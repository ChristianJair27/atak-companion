// Replays de torneo: baja del cliente de League los .rofl de las partidas de
// torneo que ATAK.GG todavía no tiene y los sube al backend.
//
// El cliente permite descargar el replay de CUALQUIER partida de la región
// (no solo las propias) mientras esté dentro de los parches vigentes, así que
// cualquier companion abierto (jugador, caster, organizador) completa el
// archivo del torneo. Nunca trabaja mientras el usuario está en champ select o
// en partida: solo con el cliente en reposo (None / Lobby / fin de partida).
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LcuService } from './lcu.js';

export interface ReplayStatus {
  enabled: boolean;
  busy: boolean;
  pending: number;    // partidas que faltan en el servidor (región del cliente)
  uploaded: number;   // subidas por este companion en esta sesión
  skipped: number;    // no descargables (parche viejo / perdidas)
  last: string;       // última acción, para la UI
  lastAt: number;
}

const IDLE_PHASES = new Set(['None', 'Lobby', 'EndOfGame', 'PreEndOfGame', 'WaitingForStats']);
const REGION_PREFIX: Record<string, string> = { LAN: 'LA1', LAS: 'LA2', NA: 'NA1', BR: 'BR1', EUW: 'EUW1', EUNE: 'EUN1', OCE: 'OC1', TR: 'TR1', RU: 'RU', JP: 'JP1', KR: 'KR' };

export class ReplayFetcher extends EventEmitter {
  status: ReplayStatus = { enabled: true, busy: false, pending: 0, uploaded: 0, skipped: 0, last: '', lastAt: 0 };
  private timer: NodeJS.Timeout | null = null;
  private skip = new Set<number>();
  private tried = new Map<number, number>();

  constructor(private lcu: LcuService, private backend: string) { super(); }

  start() {
    if (this.timer) return;
    // Primer intento a los 30 s de abrir; luego cada 2 min.
    setTimeout(() => void this.tick(), 30_000);
    this.timer = setInterval(() => void this.tick(), 120_000);
  }

  setEnabled(on: boolean) { this.status.enabled = on; this.set(on ? 'Activado' : 'Desactivado'); if (on) void this.tick(true); }

  private set(last: string, patch: Partial<ReplayStatus> = {}) {
    Object.assign(this.status, patch, { last, lastAt: Date.now() });
    this.emit('status', { ...this.status });
  }

  /** Región del cliente en formato de plataforma (LA1), como la guarda ATAK.GG. */
  private platform(): string | null {
    const r = (this.lcu.region || '').toUpperCase();
    if (!r) return null;
    return REGION_PREFIX[r] || r;
  }

  async tick(force = false) {
    if (!this.status.enabled || this.status.busy) return;
    const region = this.platform();
    if (!region) return;
    const phase = this.lcu.currentPhase;
    if (!force && !IDLE_PHASES.has(phase)) return; // no molestar en partida
    this.status.busy = true;
    try {
      const r = await fetch(`${this.backend}/api/replays/wanted?region=${encodeURIComponent(region)}&limit=20`);
      if (!r.ok) { this.set(`Servidor respondió ${r.status}`); return; }
      const { wanted } = await r.json() as { wanted: Array<{ gameId: number; region: string; matchId: string; tournamentId: string; team1: string; team2: string }> };
      const todo = wanted.filter((w) => !this.skip.has(w.gameId) && (Date.now() - (this.tried.get(w.gameId) || 0)) > 10 * 60_000);
      this.set(todo.length ? `${todo.length} replays por subir` : (wanted.length ? 'Nada pendiente que pueda bajar' : 'Todo al día'), { pending: wanted.length });
      // Pocas por ciclo: cada descarga tarda unos segundos y el cliente no se satura.
      for (const w of todo.slice(0, 3)) {
        if (!IDLE_PHASES.has(this.lcu.currentPhase) && !force) break;
        this.tried.set(w.gameId, Date.now());
        await this.fetchOne(w);
      }
    } catch (e: any) {
      this.set(`Error: ${String(e?.message || e).slice(0, 80)}`);
    } finally {
      this.status.busy = false;
      this.emit('status', { ...this.status });
    }
  }

  private async fetchOne(w: { gameId: number; region: string; matchId: string; team1: string; team2: string }) {
    const label = `${w.team1} vs ${w.team2}`;
    // 1) Estado del replay en el cliente.
    let meta = await this.lcu.get<any>(`/lol-replays/v1/metadata/${w.gameId}`);
    const bad = new Set(['lost', 'incompatible', 'error', 'missing']);
    if (meta?.state && bad.has(meta.state)) { this.skip.add(w.gameId); this.set(`${label}: no disponible (${meta.state})`, { skipped: this.status.skipped + 1 }); return; }
    // 2) Pedir la descarga si no está ya.
    if (meta?.state !== 'watch') {
      this.set(`Bajando ${label}…`);
      const r = await this.lcu.request('POST', `/lol-replays/v1/rofls/${w.gameId}/download`, { componentType: 'replay-button_match-history' });
      if (!r.ok && r.status !== 204) { this.set(`${label}: el cliente rechazó la descarga (${r.status})`); return; }
      for (let i = 0; i < 60; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        meta = await this.lcu.get<any>(`/lol-replays/v1/metadata/${w.gameId}`);
        if (meta?.state === 'watch') break;
        if (meta?.state && bad.has(meta.state)) { this.skip.add(w.gameId); this.set(`${label}: no disponible (${meta.state})`, { skipped: this.status.skipped + 1 }); return; }
      }
      if (meta?.state !== 'watch') { this.set(`${label}: la descarga no terminó`); return; }
    }
    // 3) Localizar el archivo (LA1-123456.rofl en la carpeta de replays).
    const dir = (await this.lcu.get<string>('/lol-replays/v1/rofls/path')) || (await this.lcu.get<string>('/lol-replays/v1/rofls-path'));
    if (!dir || typeof dir !== 'string') { this.set(`${label}: no sé dónde guarda el cliente los replays`); return; }
    const region = this.platform() || w.region;
    const candidates = [path.join(dir, `${region}-${w.gameId}.rofl`), path.join(dir, `${w.region}-${w.gameId}.rofl`)];
    let file: string | null = null;
    for (const c of candidates) { try { await fs.access(c); file = c; break; } catch { /* siguiente */ } }
    if (!file) {
      try { const found = (await fs.readdir(dir)).find((f) => f.includes(String(w.gameId)) && f.endsWith('.rofl')); if (found) file = path.join(dir, found); } catch { /* */ }
    }
    if (!file) { this.set(`${label}: el archivo no apareció en ${dir}`); return; }
    const buf = await fs.readFile(file);
    // 4) Subir.
    const cfg = await this.lcu.get<any>('/lol-replays/v1/configuration');
    const me = this.lcu.summoner;
    const up = await fetch(`${this.backend}/api/replays/${encodeURIComponent(w.region)}/${w.gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Patch': String(cfg?.gameVersion || ''), 'X-Uploader': me ? `${me.gameName}#${me.tagLine}` : 'companion' },
      body: buf,
    });
    if (up.ok) this.set(`${label}: subido (${(buf.length / 1048576).toFixed(1)} MB)`, { uploaded: this.status.uploaded + 1, pending: Math.max(0, this.status.pending - 1) });
    else this.set(`${label}: el servidor no lo aceptó (${up.status})`);
  }
}
