// electron/services/obs.ts — cliente mínimo de obs-websocket v5 (OBS 28+).
// El modo caster cambia la escena de OBS solo según la fase del cliente:
// champ select → escena de selección · partida → escena de juego · fin → post.
// Protocolo: Hello(op 0) → Identify(op 1, con auth sha256 si hay contraseña)
// → Identified(op 2); peticiones Request(op 6) / RequestResponse(op 7).
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export interface ObsConfig { host: string; port: number; password: string }
export interface ObsScenes { champselect?: string; ingame?: string; postgame?: string; idle?: string; replay?: string }

export class ObsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private cfg: ObsConfig | null = null;
  private reqId = 0;
  private waiting = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  connected = false;
  lastError = '';
  currentScene = '';

  configure(cfg: ObsConfig | null) {
    this.cfg = cfg;
    this.disconnect();
    if (cfg) this.connect();
  }

  private connect() {
    const cfg = this.cfg; if (!cfg) return;
    try {
      const ws = new WebSocket(`ws://${cfg.host || '127.0.0.1'}:${cfg.port || 4455}`);
      this.ws = ws;
      ws.on('message', (data) => this.onMessage(String(data)));
      ws.on('close', (code: number) => { if (code === 4009) this.lastError = 'OBS rechazó la contraseña: cópiala de nuevo en "Mostrar información de conexión".'; else if (code === 4010) this.lastError = 'Versión de OBS WebSocket no compatible: actualiza OBS a la 28 o más nueva.'; this.connected = false; this.emit('status'); this.scheduleReconnect(); });
      ws.on('error', (e: any) => { this.lastError = ObsClient.explain(e, cfg); this.connected = false; this.emit('status'); });
    } catch (e: any) { this.lastError = e.message; this.scheduleReconnect(); }
  }
  /** Errores de conexión en palabras del caster (lo más común: el servidor WebSocket de OBS apagado). */
  static explain(e: any, cfg: ObsConfig): string {
    const code = String(e?.code || '');
    const where = `${cfg.host || '127.0.0.1'}:${cfg.port || 4455}`;
    if (code === 'ECONNREFUSED') return `OBS no responde en ${where}: abre OBS (28 o más nuevo) y activa Herramientas → Ajustes del servidor WebSocket → "Habilitar servidor WebSocket", puerto 4455, Aplicar. Si OBS está en esta misma PC usa 127.0.0.1.`;
    if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return `No se llega a ${where}: si OBS está en esta PC usa 127.0.0.1; si está en otra, revisa la IP y que el Firewall de Windows permita OBS.`;
    if (/401|auth/i.test(String(e?.message))) return 'OBS rechazó la contraseña: cópiala de nuevo en "Mostrar información de conexión".';
    return String(e?.message || e);
  }
  private scheduleReconnect() {
    if (!this.cfg || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; if (this.cfg) this.connect(); }, 5000);
  }
  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const ws = this.ws; this.ws = null; this.connected = false;
    try { ws?.removeAllListeners(); ws?.close(); } catch { /* */ }
    for (const w of this.waiting.values()) w.reject(new Error('desconectado'));
    this.waiting.clear();
  }

  private onMessage(txt: string) {
    let msg: any; try { msg = JSON.parse(txt); } catch { return; }
    if (msg.op === 0) { // Hello
      const d = msg.d || {}; const auth = d.authentication;
      const identify: any = { rpcVersion: 1, eventSubscriptions: 0 };
      if (auth) {
        if (!this.cfg?.password) { this.lastError = 'OBS pide contraseña'; this.emit('status'); return; }
        const secret = createHash('sha256').update(this.cfg.password + auth.salt).digest('base64');
        identify.authentication = createHash('sha256').update(secret + auth.challenge).digest('base64');
      }
      this.send({ op: 1, d: identify });
    } else if (msg.op === 2) { // Identified
      this.connected = true; this.lastError = ''; this.emit('status');
      void this.request('GetCurrentProgramScene').then((r) => { this.currentScene = String(r?.currentProgramSceneName || r?.sceneName || ''); this.emit('status'); }).catch(() => {});
    } else if (msg.op === 7) { // RequestResponse
      const d = msg.d || {}; const w = this.waiting.get(String(d.requestId)); if (!w) return;
      this.waiting.delete(String(d.requestId));
      if (d.requestStatus?.result) w.resolve(d.responseData || {}); else w.reject(new Error(d.requestStatus?.comment || `OBS ${d.requestStatus?.code ?? '?'}`));
    }
  }
  private send(obj: any) { try { this.ws?.send(JSON.stringify(obj)); } catch { /* */ } }

  request(requestType: string, requestData: any = {}): Promise<any> {
    if (!this.connected) return Promise.reject(new Error('OBS no conectado'));
    const requestId = `r${++this.reqId}`;
    return new Promise((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject });
      this.send({ op: 6, d: { requestType, requestId, requestData } });
      setTimeout(() => { if (this.waiting.delete(requestId)) reject(new Error('OBS sin respuesta')); }, 5000);
    });
  }
  async scenes(): Promise<string[]> {
    const r = await this.request('GetSceneList');
    return (Array.isArray(r?.scenes) ? r.scenes : []).map((s: any) => String(s.sceneName)).reverse();
  }
  async setScene(name: string): Promise<boolean> {
    if (!name || name === this.currentScene) return false;
    await this.request('SetCurrentProgramScene', { sceneName: name });
    this.currentScene = name; this.emit('status'); this.emit('scene', name);
    return true;
  }
  /** Guarda el búfer de repetición de OBS (si está activo): repetición instantánea sin tocar el teclado. */
  async saveReplayBuffer(): Promise<boolean> {
    try { await this.request('SaveReplayBuffer'); return true; } catch { return false; }
  }
  /** ¿Está activo el búfer de repetición? Si no, intenta arrancarlo (OBS debe tenerlo configurado en Salida). */
  async ensureReplayBuffer(): Promise<boolean> {
    try {
      const st = await this.request('GetReplayBufferStatus');
      if (st?.outputActive) return true;
      await this.request('StartReplayBuffer');
      return true;
    } catch (e: any) { this.lastError = `Búfer de repetición: ${e.message}`; this.emit('status'); return false; }
  }
  /** Ruta del último archivo guardado por el búfer (tras SaveReplayBuffer tarda ~1 s en escribirse). */
  async lastReplayPath(): Promise<string> {
    try { const r = await this.request('GetLastReplayBufferReplay'); return String(r?.savedReplayPath || ''); } catch { return ''; }
  }
  /** Pone un archivo en una fuente Multimedia y la reinicia (la reproduce desde el principio). */
  async playMedia(inputName: string, file: string): Promise<boolean> {
    try {
      await this.request('SetInputSettings', { inputName, inputSettings: { local_file: file, is_local_file: true, restart_on_activate: true }, overlay: true });
      await this.request('TriggerMediaInputAction', { inputName, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
      return true;
    } catch (e: any) { this.lastError = `Fuente "${inputName}": ${e.message}`; this.emit('status'); return false; }
  }
  status() { return { connected: this.connected, error: this.lastError, scene: this.currentScene, configured: !!this.cfg }; }
}
