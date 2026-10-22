// electron/services/feed-push.ts
// Modo Caster LQC: empuja el snapshot en vivo al canal /api/live-feed del
// backend de ATAK (la versión integrada del script companion/atak-companion.mjs
// de sniperlol). Se activa/desactiva desde la UI con canal+token.
import https from 'node:https';
import http from 'node:http';
import type { GameState } from './live-client.js';

export interface FeedConfig {
  backend: string;   // https://atakback.revolution505.com
  channel: string;   // lqc-2026
  token: string;     // LIVE_FEED_TOKEN
  matchLabel: string;
  streamUrl: string;
  team1: string; team2: string;
  logo1: string; logo2: string;
  /** Color de acento del overlay (hex #rrggbb) — personalización del caster. */
  accent?: string;
}

// Eventos que el overlay necesita ENTEROS (objetivos, estructuras): de las kills
// basta con las últimas. Con un corte parejo, una partida larga perdía los
// primeros dragones y torres.
const KEY_EVENTS = new Set([
  'GameStart', 'MinionsSpawning', 'FirstBrick', 'TurretKilled', 'InhibKilled', 'InhibRespawned',
  'DragonKill', 'HeraldKill', 'BaronKill', 'HordeKill', 'FirstBlood', 'Ace', 'GameEnd',
]);

/** Eventos a enviar + si el historial arranca en el inicio de la partida. */
export function selectFeedEvents(state: GameState): { events: any[]; eventsComplete: boolean } {
  const all: any[] = Array.isArray(state.events) ? state.events : [];
  const key = all.filter((e) => KEY_EVENTS.has(e?.EventName));
  const rest = all.filter((e) => !KEY_EVENTS.has(e?.EventName)).slice(-70);
  const events = [...key, ...rest].sort((a, b) => (a?.EventID ?? 0) - (b?.EventID ?? 0)).slice(-300);
  // Si el espectador entró a medias, el Live Client no trae lo anterior: se
  // nota porque los jugadores suman más kills que eventos de kill hay.
  const kills = state.players.reduce((s, p) => s + (p.kills || 0), 0);
  const killEvents = all.filter((e) => e?.EventName === 'ChampionKill').length;
  const eventsComplete = all.some((e) => e?.EventName === 'GameStart') && killEvents >= kills - 1;
  return { events, eventsComplete };
}

export class FeedPusher {
  config: FeedConfig | null = null;
  lastStatus: { at: number; code: number | null; error?: string } | null = null;
  pushed = 0;
  // Objetivos leídos del HUD del espectador (hud-objectives.ts): el Live Client
  // en modo espectador no los emite, así que se sintetizan como eventos del
  // mismo formato y se envían junto a los reales. Se vacían al cambiar de partida.
  private hudEvents: any[] = [];
  private hudGameStart = 0;
  private hudSeq = 800001;

  addHudEvent(ev: { name: string; side: 'blue' | 'red'; extra: string }, state: GameState) {
    const team = ev.side === 'blue' ? 'ORDER' : 'CHAOS';
    const killer = state.players.find((p) => p.team === team)?.riotId || (ev.side === 'blue' ? 'Blue' : 'Red');
    const e: any = { EventID: this.hudSeq++, EventName: ev.name, EventTime: state.gameTime, KillerName: killer, Assisters: [], hud: true };
    if (ev.name === 'DragonKill') e.DragonType = ev.extra || 'Unknown';
    this.hudEvents.push(e);
  }
  get hudCount() { return this.hudEvents.length; }
  resetHud() { this.hudEvents = []; }

  // ── Champ select (overlay de selección para OBS) ───────────────────────────
  // Se manda a su propio endpoint para no pisar el snapshot in-game del canal.
  private csLastAt = 0;
  csStatus: { at: number; code: number | null } | null = null;
  async pushChampSelect(cs: any, opts: { force?: boolean } = {}): Promise<void> {
    const cfg = this.config;
    if (!cfg) return;
    const now = Date.now();
    if (!opts.force && now - this.csLastAt < 900) return; // el LCU se consulta cada ~1 s; con uno por segundo basta
    this.csLastAt = now;
    const body = { ...cs, matchLabel: cfg.matchLabel, team1: cfg.team1, team2: cfg.team2, logo1: cfg.logo1, logo2: cfg.logo2, accent: cfg.accent || '' };
    const r = await this.post(`${cfg.backend.replace(/\/$/, '')}/api/live-feed/${cfg.channel}/champselect`, body, cfg.token);
    this.csStatus = { at: now, code: r.code };
  }

  configure(cfg: FeedConfig | null) {
    this.config = cfg;
    this.pushed = 0;
  }

  get active() { return this.config !== null; }

  /** Jugadores + eventos en el formato del backend (lo comparten el modo caster y el automático). */
  private snapshotBase(state: GameState) {
    const sel = selectFeedEvents(state);
    // Partida nueva (el reloj retrocede): los eventos del HUD ya no valen.
    if (state.gameTime + 30 < this.hudGameStart) this.hudEvents = [];
    this.hudGameStart = state.gameTime;
    let events = sel.events; let eventsComplete = sel.eventsComplete;
    if (this.hudEvents.length) {
      // El Live Client puede traer alguno de estos (p. ej. con un jugador dentro): no duplicar.
      const real = new Set(events.filter((e) => /^(DragonKill|HordeKill|HeraldKill|BaronKill)$/.test(e?.EventName)).map((e) => `${e.EventName}@${Math.round((e.EventTime || 0) / 60)}`));
      const extra = this.hudEvents.filter((e) => !real.has(`${e.EventName}@${Math.round(e.EventTime / 60)}`));
      events = [...events, ...extra].sort((a, b) => (a?.EventTime ?? 0) - (b?.EventTime ?? 0));
    }
    return {
      hud: this.hudEvents.length > 0,
      gameTime: state.gameTime,
      gameMode: state.gameMode,
      mapName: state.mapName,
      // Un jugador recibe TODOS los eventos (dragones, larvas, heraldo, barón); el espectador no.
      source: state.me?.riotId ? 'player' : 'spectator',
      activePlayer: state.me?.riotId || '',
      players: state.players.map((p) => ({
        riotId: p.riotId,
        championName: p.championName,
        team: p.team,
        level: p.level,
        scores: { kills: p.kills, deaths: p.deaths, assists: p.assists, creepScore: p.creepScore, wardScore: p.wardScore },
        isDead: p.isDead,
        respawnTimer: p.respawnTimer,
        position: p.position,
        items: p.items.map((id) => ({ itemID: id })),
        spells: [p.spell1, p.spell2].map((s) => (typeof s === 'string' && s.startsWith('Summoner') ? s : '')),
        keystone: p.keystoneId || 0,
      })),
      events,
      eventsComplete,
    };
  }

  // ── Modo automático (jugadores de torneo) ─────────────────────────────────
  // Sin canal ni token: el backend reconoce la partida de torneo por la plantilla
  // registrada y la enruta al overlay de ese torneo. Si no es de torneo, se
  // deja de intentar un minuto.
  autoEnabled = true;
  autoStatus: { at: number; text: string; channel: string; sending: boolean } = { at: 0, text: 'Sin partida en curso', channel: '', sending: false };
  private autoSkipUntil = 0;
  private autoBusy = false;
  async pushAuto(state: GameState, backend: string, isCustom: boolean | null = null): Promise<void> {
    if (!this.autoEnabled || this.autoBusy || Date.now() < this.autoSkipUntil) return;
    if (!state.me?.riotId) { this.autoStatus = { at: Date.now(), text: 'Espectando: el cliente no entrega objetivos', channel: '', sending: false }; return; }
    // Solo las partidas personalizadas pueden ser de torneo: una ranked/normal/flex
    // de un equipo registrado no debe aparecer en el tablero del torneo.
    if (isCustom === false) { this.autoStatus = { at: Date.now(), text: 'Cola normal: no se envía al torneo', channel: '', sending: false }; return; }
    this.autoBusy = true;
    try {
      const r = await this.post(`${backend.replace(/\/$/, '')}/api/live-feed/auto/push`, { ...this.snapshotBase(state), isCustom }, null);
      if (r.ok && r.body?.ok) this.autoStatus = { at: Date.now(), text: `Enviando tu partida al overlay de ${r.body.channel}`, channel: String(r.body.channel || ''), sending: true };
      else { this.autoSkipUntil = Date.now() + 60_000; this.autoStatus = { at: Date.now(), text: r.body?.reason === 'not_tournament' ? 'Esta partida no es de un torneo de ATAK.GG' : `Sin respuesta del servidor (${r.code ?? 'red'})`, channel: '', sending: false }; }
    } finally { this.autoBusy = false; }
  }
  private post(url: string, snapshot: any, token: string | null): Promise<{ ok: boolean; code: number | null; body: any }> {
    return new Promise((resolve) => {
      try {
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;
        const body = JSON.stringify(snapshot);
        const req = lib.request(u, { method: 'POST', timeout: 5000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...(token ? { 'X-Feed-Token': token } : {}) } }, (res) => {
          let txt = ''; res.on('data', (c) => (txt += c)); res.on('end', () => { let parsed: any = null; try { parsed = JSON.parse(txt); } catch { /* */ } resolve({ ok: res.statusCode === 200, code: res.statusCode ?? null, body: parsed }); });
        });
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, code: null, body: null }); });
        req.on('error', () => resolve({ ok: false, code: null, body: null }));
        req.write(body); req.end();
      } catch { resolve({ ok: false, code: null, body: null }); }
    });
  }

  async push(state: GameState): Promise<void> {
    const cfg = this.config;
    if (!cfg) return;
    const snapshot = {
      ...this.snapshotBase(state),
      matchLabel: cfg.matchLabel,
      streamUrl: cfg.streamUrl,
      team1: cfg.team1, team2: cfg.team2, logo1: cfg.logo1, logo2: cfg.logo2,
      accent: cfg.accent || '',
    };

    await new Promise<void>((resolve) => {
      try {
        const u = new URL(`${cfg.backend.replace(/\/$/, '')}/api/live-feed/${cfg.channel}/push`);
        const lib = u.protocol === 'https:' ? https : http;
        const body = JSON.stringify(snapshot);
        const req = lib.request(u, {
          method: 'POST',
          timeout: 5000,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Feed-Token': cfg.token },
        }, (res) => {
          this.lastStatus = { at: Date.now(), code: res.statusCode ?? null };
          if (res.statusCode === 200) this.pushed++;
          res.resume();
          resolve();
        });
        req.on('timeout', () => { req.destroy(); this.lastStatus = { at: Date.now(), code: null, error: 'timeout' }; resolve(); });
        req.on('error', (e) => { this.lastStatus = { at: Date.now(), code: null, error: e.message }; resolve(); });
        req.write(body);
        req.end();
      } catch (e: any) {
        this.lastStatus = { at: Date.now(), code: null, error: e.message };
        resolve();
      }
    });
  }
}
