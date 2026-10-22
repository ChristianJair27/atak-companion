// electron/services/obs.ts — cliente mínimo de obs-websocket v5 (OBS 28+).
// El modo caster cambia la escena de OBS solo según la fase del cliente:
// champ select → escena de selección · partida → escena de juego · fin → post.
// Protocolo: Hello(op 0) → Identify(op 1, con auth sha256 si hay contraseña)
// → Identified(op 2); peticiones Request(op 6) / RequestResponse(op 7).
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export interface ObsConfig { host: string; port: number; password: string }
export interface ObsScenes { champselect?: string; ingame?: string; postgame?: string; idle?: string }

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
      ws.on('close', () => { this.connected = false; this.emit('status'); this.scheduleReconnect(); });
      ws.on('error', (e) => { this.lastError = e.message; this.connected = false; this.emit('status'); });
    } catch (e: any) { this.lastError = e.message; this.scheduleReconnect(); }
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
  status() { return { connected: this.connected, error: this.lastError, scene: this.currentScene, configured: !!this.cfg }; }
}
