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

  configure(cfg: FeedConfig | null) {
    this.config = cfg;
    this.pushed = 0;
  }

  get active() { return this.config !== null; }

  async push(state: GameState): Promise<void> {
    const cfg = this.config;
    if (!cfg) return;
    const { events, eventsComplete } = selectFeedEvents(state);
    const snapshot = {
      gameTime: state.gameTime,
      gameMode: state.gameMode,
      mapName: state.mapName,
      matchLabel: cfg.matchLabel,
      streamUrl: cfg.streamUrl,
      team1: cfg.team1, team2: cfg.team2, logo1: cfg.logo1, logo2: cfg.logo2,
      accent: cfg.accent || '',
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
        // Hechizos (token "SummonerFlash") y runa clave (id) para la tabla del overlay.
        spells: [p.spell1, p.spell2].map((s) => (typeof s === 'string' && s.startsWith('Summoner') ? s : '')),
        keystone: p.keystoneId || 0,
      })),
      events,
      eventsComplete,
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
