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
      })),
      events: state.events.slice(-80),
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
