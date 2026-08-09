// electron/services/lcu.ts
// Conexión nativa al cliente de League (LCU API): lockfile → puerto+password →
// HTTPS local con Basic auth. Base: atak-electron/lcu.service.ts, mejorado con
// lo aprendido en la versión Overwolf:
//  - más rutas de lockfile (C:–G:, Program Files x86)
//  - matching del jugador local por cellId (el viejo comparaba summonerId con
//    localPlayerCellId — bug)
//  - región vía /riotclient/region-locale (los clientes modernos ya no
//    exponen platformId en current-summoner)
import { EventEmitter } from 'node:events';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

export type GameflowPhase =
  | 'None' | 'Lobby' | 'Matchmaking' | 'ReadyCheck' | 'ChampSelect'
  | 'GameStart' | 'InProgress' | 'WaitingForStats' | 'PreEndOfGame' | 'EndOfGame' | string;

export interface Lockfile { port: number; password: string; protocol: string }

export interface ChampSelectState {
  inChampSelect: boolean;
  localPlayerChampionId: number;
  localPlayerPosition: string;
  phase: string;
  timerSecs: number;
  session: any;
}

const LOCKFILE_CANDIDATES = (): string[] => {
  const home = process.env.USERPROFILE || '';
  const fixed = [
    path.join(home, 'AppData', 'Local', 'Riot Games', 'League of Legends', 'lockfile'),
    'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
  ];
  const drives = ['C', 'D', 'E', 'F', 'G'].map((d) => `${d}:\\Riot Games\\League of Legends\\lockfile`);
  return [...drives, ...fixed];
};

export class LcuService extends EventEmitter {
  private lockfile: Lockfile | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private phase: GameflowPhase = 'None';
  private eogFetched = false;
  private lastChampionId = -1;
  private inChampSelect = false;
  /** Ruta extra de lockfile derivada del exe del proceso (si la conocemos). */
  extraLockfileDir: string | null = null;

  region: string | null = null; // p.ej. 'LA1'
  summoner: { gameName: string; tagLine: string; puuid: string } | null = null;

  start(intervalMs = 2000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get connected() { return this.lockfile !== null; }
  get currentPhase() { return this.phase; }

  private findLockfile(): Lockfile | null {
    const candidates = [...LOCKFILE_CANDIDATES()];
    if (this.extraLockfileDir) candidates.unshift(path.join(this.extraLockfileDir, 'lockfile'));
    for (const p of candidates) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const parts = content.split(':'); // LeagueClient:pid:port:password:protocol
        if (parts.length >= 5) {
          return { port: Number(parts[2]), password: parts[3], protocol: parts[4].trim() };
        }
      } catch { /* siguiente candidato */ }
    }
    return null;
  }

  /** GET a la LCU API. Devuelve null en error/timeout (el cliente abre y cierra). */
  get<T = any>(endpoint: string): Promise<T | null> {
    const lf = this.lockfile;
    if (!lf) return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = https.request({
        host: '127.0.0.1',
        port: lf.port,
        path: endpoint,
        method: 'GET',
        headers: { Authorization: `Basic ${Buffer.from(`riot:${lf.password}`).toString('base64')}` },
        agent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 1500,
      }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  private async poll() {
    if (!this.lockfile) {
      this.lockfile = this.findLockfile();
      if (this.lockfile) {
        this.emit('connected');
        void this.resolveIdentity();
      } else {
        return; // cliente cerrado; seguimos esperando
      }
    }

    const phase = await this.get<string>('/lol-gameflow/v1/gameflow-phase');
    if (phase == null) {
      // Cliente cerrado a media sesión → resetear y re-descubrir lockfile.
      this.lockfile = null;
      if (this.phase !== 'None') { this.phase = 'None'; this.emit('phase', 'None'); }
      this.emit('disconnected');
      return;
    }

    if (phase !== this.phase) {
      this.phase = phase;
      if (phase !== 'EndOfGame' && phase !== 'PreEndOfGame' && phase !== 'WaitingForStats') this.eogFetched = false;
      this.emit('phase', phase);
    }

    if (phase === 'ChampSelect') await this.pollChampSelect();
    else if (this.inChampSelect) {
      this.inChampSelect = false;
      this.lastChampionId = -1;
      this.emit('champ-select-ended');
    }

    if ((phase === 'EndOfGame' || phase === 'PreEndOfGame' || phase === 'WaitingForStats') && !this.eogFetched) {
      const eog = await this.get('/lol-end-of-game/v1/eog-stats-block');
      if (eog && !(eog as any).errorCode) {
        this.eogFetched = true;
        this.emit('eog-stats', eog);
      }
    }
  }

  private async pollChampSelect() {
    const session = await this.get<any>('/lol-champ-select/v1/session');
    if (!session || session.errorCode || session.httpStatus) return;

    if (!this.inChampSelect) {
      this.inChampSelect = true;
      this.emit('champ-select-started');
    }

    // Jugador local por cellId (fix del bug viejo que comparaba summonerId).
    const me = (session.myTeam || []).find((p: any) => p.cellId === session.localPlayerCellId);
    const state: ChampSelectState = {
      inChampSelect: true,
      localPlayerChampionId: me?.championId ?? me?.championPickIntent ?? 0,
      localPlayerPosition: me?.assignedPosition || '',
      phase: session.timer?.phase || '',
      timerSecs: Math.round((session.timer?.adjustedTimeLeftInPhase ?? 0) / 1000),
      session,
    };
    this.emit('champ-select-update', state);

    if (state.localPlayerChampionId && state.localPlayerChampionId !== this.lastChampionId) {
      this.lastChampionId = state.localPlayerChampionId;
      this.emit('local-champion-changed', state.localPlayerChampionId, state.localPlayerPosition);
    }
  }

  private async resolveIdentity() {
    const me = await this.get<any>('/lol-summoner/v1/current-summoner');
    if (me?.gameName) {
      this.summoner = { gameName: me.gameName, tagLine: me.tagLine || '', puuid: me.puuid || '' };
      this.emit('summoner', this.summoner);
    }
    // Región: los clientes modernos no dan platformId en current-summoner.
    const rl = await this.get<any>('/riotclient/region-locale');
    if (rl?.region) {
      this.region = String(rl.region).toUpperCase(); // 'LA1', 'NA', etc.
      this.emit('region', this.region);
    }
  }
}
