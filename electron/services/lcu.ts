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
import { execFile } from 'node:child_process';

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
  ];
  const drives = ['C', 'D', 'E', 'F', 'G'];
  const perDrive = drives.flatMap((d) => [
    `${d}:\\Riot Games\\League of Legends\\lockfile`,
    `${d}:\\Program Files\\Riot Games\\League of Legends\\lockfile`,
    `${d}:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile`,
    `${d}:\\Games\\Riot Games\\League of Legends\\lockfile`,
  ]);
  return [...perDrive, ...fixed];
};

export interface RankedSnapshot {
  queue: string;
  tier: string | null;
  division: string | number | null;
  lp: number;
  wins: number;
  losses: number;
}

export class LcuService extends EventEmitter {
  private lockfile: Lockfile | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private phase: GameflowPhase = 'None';
  private eogFetched = false;
  private lastChampionId = -1;
  private inChampSelect = false;
  /** Ruta extra de lockfile derivada del exe del proceso (si la conocemos). */
  extraLockfileDir: string | null = null;
  /** LP/rango capturado al entrar InProgress → delta en EOG. */
  rankedBeforeGame: RankedSnapshot | null = null;
  /** Cola de la partida actual (420 solo, 440 flex, 450 aram…). */
  currentQueueId: number | null = null;
  /** true = partida personalizada (las de torneo lo son); false = cola normal; null = no se sabe. */
  currentIsCustom: boolean | null = null;
  /** queueType de ranked de ESTA partida (RANKED_SOLO_5x5 | RANKED_FLEX_SR | null). */
  rankedQueueType: string | null = null;

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

  /**
   * Petición con cuerpo a la LCU API (PATCH/POST/PUT/DELETE). A diferencia de
   * `get`, informa del status para poder explicar el fallo en la UI: el cliente
   * rechaza acciones fuera de turno con 4xx y un mensaje útil.
   */
  request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
    const lf = this.lockfile;
    if (!lf) return Promise.resolve({ ok: false, status: 0, data: null, error: 'Cliente de League no detectado' });
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    return new Promise((resolve) => {
      const req = https.request({
        host: '127.0.0.1',
        port: lf.port,
        path: endpoint,
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`riot:${lf.password}`).toString('base64')}`,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        },
        agent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 4000,
      }, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          let data: any = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { /* 204 o texto plano */ }
          const ok = status >= 200 && status < 300;
          resolve({
            ok,
            status,
            data,
            error: ok ? undefined : String(data?.message || data?.errorCode || raw || `HTTP ${status}`),
          });
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, data: null, error: 'timeout LCU' }); });
      req.on('error', (e) => resolve({ ok: false, status: 0, data: null, error: e.message }));
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** Acción de champ select del jugador local pendiente (pick o ban). */
  private async myAction(type: 'pick' | 'ban'): Promise<{ id: number; isInProgress: boolean } | null> {
    const session = await this.get<any>('/lol-champ-select/v1/session');
    const cell = session?.localPlayerCellId;
    if (cell == null) return null;
    for (const group of (session?.actions || []) as any[][]) {
      for (const a of group || []) {
        if (Number(a?.actorCellId) === Number(cell) && String(a?.type) === type && !a?.completed) {
          return { id: Number(a.id), isInProgress: Boolean(a.isInProgress) };
        }
      }
    }
    return null;
  }

  /** Campeones que el jugador local puede elegir en ESTE champ select (propios + rotación). */
  async pickableChampionIds(): Promise<number[]> {
    const r = await this.get<any>('/lol-champ-select/v1/pickable-champion-ids');
    return Array.isArray(r) ? r.map(Number).filter((n) => n > 0) : [];
  }

  /** Deja el campeón en "hover" (intención de pick, visible para tu equipo). */
  async hoverChampion(championId: number): Promise<{ ok: boolean; error?: string }> {
    if (!championId) return { ok: false, error: 'Campeón inválido' };
    const action = await this.myAction('pick');
    if (!action) return { ok: false, error: 'No tienes un pick pendiente en esta selección' };
    const r = await this.request('PATCH', `/lol-champ-select/v1/session/actions/${action.id}`, { championId });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  /** Confirma el pick (lock in). Solo funciona cuando es tu turno. */
  async lockChampion(championId?: number): Promise<{ ok: boolean; error?: string }> {
    const action = await this.myAction('pick');
    if (!action) return { ok: false, error: 'No tienes un pick pendiente en esta selección' };
    if (!action.isInProgress) return { ok: false, error: 'Aún no es tu turno de pickear' };
    if (championId) {
      const p = await this.request('PATCH', `/lol-champ-select/v1/session/actions/${action.id}`, { championId });
      if (!p.ok) return { ok: false, error: p.error };
    }
    const r = await this.request('POST', `/lol-champ-select/v1/session/actions/${action.id}/complete`, {});
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  /**
   * Crea (o reemplaza) una página de runas y la deja seleccionada. Reutiliza
   * siempre la misma página ATAK para no llenarle el inventario al jugador.
   */
  async applyRunePage(page: {
    name: string;
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
  }): Promise<{ ok: boolean; error?: string }> {
    if (!page.primaryStyleId || !page.subStyleId || page.selectedPerkIds.length !== 9) {
      return { ok: false, error: 'Página de runas incompleta (se esperan 9 runas)' };
    }
    const pagesRes = await this.request<any[]>('GET', '/lol-perks/v1/pages');
    if (!pagesRes.ok) return { ok: false, error: pagesRes.error || 'No se pudieron leer tus páginas de runas' };
    const pages = Array.isArray(pagesRes.data) ? pagesRes.data : [];

    // Reutilizamos siempre la misma página ATAK: se borra la anterior y punto.
    const mine = pages.filter((p: any) => p?.isDeletable && String(p?.name || '').startsWith('ATAK'));
    for (const p of mine) await this.request('DELETE', `/lol-perks/v1/pages/${p.id}`);

    // Si el inventario sigue lleno, NO tocamos páginas del jugador: preferimos
    // fallar y que él decida cuál borrar.
    const remaining = pages.filter((p: any) => p?.isDeletable && !mine.some((m: any) => m.id === p.id));
    const inv = await this.request<any>('GET', '/lol-perks/v1/inventory');
    const owned = Number(inv.data?.ownedPageCount) || 0;
    if (owned && remaining.length >= owned) {
      return {
        ok: false,
        error: 'No te quedan espacios de runas libres. Borra una página en el cliente y vuelve a darle.',
      };
    }

    const created = await this.request<any>('POST', '/lol-perks/v1/pages', {
      name: page.name.slice(0, 24),
      primaryStyleId: page.primaryStyleId,
      subStyleId: page.subStyleId,
      selectedPerkIds: page.selectedPerkIds,
      current: true,
    });
    if (!created.ok) return { ok: false, error: created.error || 'El cliente rechazó la página' };

    // Algunos clientes no la dejan activa al crearla.
    const id = Number(created.data?.id);
    if (id) await this.request('PUT', '/lol-perks/v1/currentpage', id);
    return { ok: true };
  }

  private probing = false;
  private lastProbeAt = 0;

  /**
   * Descubrimiento por PROCESO: si el lockfile no aparece en las rutas
   * conocidas (instalación en carpeta custom — el bug clásico de "la app
   * abre pero no reconoce el juego" en otras PCs), leemos la línea de
   * comandos de LeagueClientUx.exe, que trae puerto, token y ruta real.
   * Es el mismo método que usan Blitz/Porofessor.
   */
  private probeProcess(): void {
    if (this.probing || Date.now() - this.lastProbeAt < 10_000) return;
    this.probing = true;
    this.lastProbeAt = Date.now();
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\").CommandLine",
    ], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      this.probing = false;
      if (err || !stdout) return;
      const cmd = String(stdout);
      const port = cmd.match(/--app-port=["']?(\d+)/)?.[1];
      const token = cmd.match(/--remoting-auth-token=["']?([\w-]+)/)?.[1];
      // El arg completo viene entre comillas ("--install-directory=C:\..."):
      // terminar en la comilla de cierre, el siguiente --flag o el fin.
      const dir = cmd.match(/--install-directory=["']?([^"]+?)(?=["']|\s+--|\s*$)/)?.[1];
      if (dir) this.extraLockfileDir = dir.trim();
      if (port && token && !this.lockfile) {
        this.lockfile = { port: Number(port), password: token, protocol: 'https' };
        console.log(`[lcu] cliente encontrado por PROCESO (puerto ${port}${dir ? `, dir "${dir.trim()}"` : ''})`);
        this.emit('connected');
        void this.resolveIdentity();
      }
    });
  }

  private async poll() {
    if (!this.lockfile) {
      this.lockfile = this.findLockfile();
      if (this.lockfile) {
        this.emit('connected');
        void this.resolveIdentity();
      } else {
        this.probeProcess(); // instalación custom: buscar el proceso
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
      const prev = this.phase;
      this.phase = phase;
      if (phase !== 'EndOfGame' && phase !== 'PreEndOfGame' && phase !== 'WaitingForStats') this.eogFetched = false;
      // Snapshot de ranked al entrar a partida (para calcular ΔLP al final).
      if ((phase === 'InProgress' || phase === 'GameStart') && prev !== 'InProgress' && prev !== 'GameStart') {
        void this.snapshotRankedBeforeGame();
      }
      // Cola detectada desde champ select: las sugerencias (runas/picks) se
      // adaptan al modo (ranked/aram/arena) desde el primer segundo del draft.
      if (phase === 'ChampSelect' && prev !== 'ChampSelect') {
        void this.get<any>('/lol-gameflow/v1/session').then((s) => {
          const qid = Number(s?.gameData?.queue?.id) || null;
          if (qid) this.currentQueueId = qid;
          if (typeof s?.gameData?.isCustomGame === 'boolean') this.currentIsCustom = s.gameData.isCustomGame;
        });
      }
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
        // Ranked post-partida (puede tardar 1–2s en actualizar LP; reintentamos).
        const ranked = await this.fetchRankedWithRetry();
        this.emit('eog-stats', { eog, ranked });
      }
    }
  }

  /**
   * Rango de UNA cola concreta. Sin queueType: Solo/Duo preferido, Flex de
   * respaldo (comportamiento clásico para vistas genéricas).
   * OJO: para el ΔLP del EOG SIEMPRE pedir la cola que se jugó — antes se
   * mostraba SoloQ tras una flex y el delta salía 0.
   */
  async getRankedSnapshot(queueType?: string | null): Promise<RankedSnapshot | null> {
    const data = await this.get<any>('/lol-ranked/v1/current-ranked-stats');
    if (!data || data.errorCode) return null;
    const qmap = data.queueMap || {};
    const pick = (qt: string) =>
      qmap[qt] ||
      (Array.isArray(data.queues) ? data.queues.find((q: any) => q.queueType === qt) : null) ||
      null;
    const entry = queueType
      ? pick(queueType)
      : (pick('RANKED_SOLO_5x5') || pick('RANKED_FLEX_SR'));
    if (!entry) return null;
    const tier = entry.tier && entry.tier !== 'NONE' && entry.tier !== 'UNRANKED' ? String(entry.tier) : null;
    return {
      queue: String(entry.queueType || queueType || 'RANKED_SOLO_5x5'),
      tier,
      division: entry.division ?? entry.rank ?? null,
      lp: Number(entry.leaguePoints ?? entry.lp ?? 0) || 0,
      wins: Number(entry.wins ?? 0) || 0,
      losses: Number(entry.losses ?? 0) || 0,
    };
  }

  private async snapshotRankedBeforeGame() {
    // Cola real de la partida desde la sesión de gameflow.
    const session = await this.get<any>('/lol-gameflow/v1/session');
    const qid = Number(session?.gameData?.queue?.id) || null;
    this.currentQueueId = qid;
    this.currentIsCustom = typeof session?.gameData?.isCustomGame === 'boolean' ? session.gameData.isCustomGame : (qid === 0 ? true : qid ? false : null);
    this.rankedQueueType =
      qid === 420 ? 'RANKED_SOLO_5x5'
      : qid === 440 ? 'RANKED_FLEX_SR'
      : null; // normales/ARAM/customs: sin LP → el EOG oculta el bloque
    this.rankedBeforeGame = this.rankedQueueType
      ? await this.getRankedSnapshot(this.rankedQueueType)
      : null;
  }

  private async fetchRankedWithRetry(): Promise<{
    before: RankedSnapshot | null;
    after: RankedSnapshot | null;
    lpDelta: number | null;
  }> {
    // Partida sin LP (normal/ARAM/custom) → sin bloque de ranked en el EOG.
    if (!this.rankedQueueType) return { before: null, after: null, lpDelta: null };
    const before = this.rankedBeforeGame;
    let after = await this.getRankedSnapshot(this.rankedQueueType);
    // A veces el LCU tarda en reflejar el LP; 3 reintentos cortos.
    for (let i = 0; i < 3 && after && before && after.lp === before.lp; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      after = await this.getRankedSnapshot(this.rankedQueueType);
    }
    let lpDelta: number | null = null;
    if (before && after && before.tier && after.tier) {
      // Delta simple en LP (no cruza divisiones de forma perfecta, pero cubre el caso típico).
      if (before.tier === after.tier && String(before.division) === String(after.division)) {
        lpDelta = after.lp - before.lp;
      } else {
        // Promo / up/down de división: marcar cambio con signo por wins.
        lpDelta = after.lp - before.lp;
        // Si tier subió, forzar positivo al menos +1 visual
        const order = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
        const bi = order.indexOf(String(before.tier).toUpperCase());
        const ai = order.indexOf(String(after.tier).toUpperCase());
        if (ai > bi) lpDelta = Math.max(lpDelta ?? 0, 1);
        if (ai < bi) lpDelta = Math.min(lpDelta ?? 0, -1);
      }
    }
    return { before, after, lpDelta };
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
