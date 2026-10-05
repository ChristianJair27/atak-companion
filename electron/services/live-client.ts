// electron/services/live-client.ts
// Live Client Data API oficial (https://127.0.0.1:2999) — funciona jugando Y
// especteando (base del Modo Caster). Base: atak-electron/live-client.service,
// mejorado: conserva championStats (HP/AD/AP/AR/MR/MS) que el HUD usa, expone
// los EVENTOS crudos (DragonKill con tipo y tiempo exacto → timers precisos de
// objetivos) y el snapshot completo para el push al live-feed de atakgg.
import { EventEmitter } from 'node:events';
import https from 'node:https';

export interface PlayerLite {
  championName: string;
  riotId: string;
  name: string;
  kills: number; deaths: number; assists: number; creepScore: number;
  wardScore: number;
  level: number;
  team: 'ORDER' | 'CHAOS';
  isDead: boolean;
  respawnTimer: number;
  position: string;
  items: number[];
  isMe: boolean;
  /** Summoner spell raw IDs from Live Client (displayName when id missing). */
  spell1: number | string;
  spell2: number | string;
  /** Keystone + tree ids when present. */
  keystoneId: number;
  primaryRuneTree: number;
  secondaryRuneTree: number;
  skinID: number;
}

export interface GameState {
  isActive: boolean;
  gameTime: number;
  gameMode: string;
  mapName: string;
  mapNumber: number;
  // Jugador activo (vacío en modo espectador)
  me: {
    riotId: string;
    championName: string;
    level: number;
    gold: number;
    kills: number; deaths: number; assists: number; creepScore: number;
    visionScore: number;
    killParticipation: number;
    championStats: { hp: number; maxHp: number; resource: number; maxResource: number; resourceType: string; ad: number; ap: number; armor: number; mr: number; ms: number; crit: number };
  } | null;
  players: PlayerLite[];
  events: any[]; // eventos crudos de Riot (ChampionKill, DragonKill con DragonType, BaronKill, TurretKilled...)
  raw: any;      // allgamedata completo (para el push al live-feed)
}

export class LiveClientService extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private wasActive = false;
  state: GameState | null = null;

  start(intervalMs = 2000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private fetchAll(): Promise<any | null> {
    return new Promise((resolve) => {
      const req = https.request({
        host: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', method: 'GET',
        agent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 1500,
      }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  private async poll() {
    const data = await this.fetchAll();
    if (!data?.gameData) {
      if (this.wasActive) {
        this.wasActive = false;
        this.state = null;
        this.emit('game-ended');
      }
      return;
    }
    const state = this.normalize(data);
    this.state = state;
    if (!this.wasActive) {
      this.wasActive = true;
      this.emit('game-started', state);
    }
    this.emit('state', state);
  }

  private normalize(d: any): GameState {
    const activeName: string = d.activePlayer?.riotIdGameName
      ? `${d.activePlayer.riotIdGameName}#${d.activePlayer.riotIdTagLine || ''}`.replace(/#$/, '')
      : (d.activePlayer?.summonerName || '');

    const players: PlayerLite[] = (d.allPlayers || []).map((p: any) => {
      const riotId = p.riotId || p.summonerName || '';
      const runes = p.runes || {};
      const spells = p.summonerSpells || {};
      const spellId = (slot: any): number | string => {
        if (!slot) return 0;
        // Preferir el token canónico "SummonerFlash" del rawDescription
        // (el displayName en clientes ES sale "Destello" y rompe el icono).
        const raw = String(slot.rawDescription || slot.rawDisplayName || '');
        const m = raw.match(/Summoner(?!Spell)[A-Za-z]+/);
        if (m) return m[0];
        if (typeof slot.key === 'number' && slot.key > 0) return slot.key;
        if (typeof slot.key === 'string' && slot.key.startsWith('Summoner')) return slot.key;
        return slot.rawDisplayName || slot.displayName || slot.key || 0;
      };
      return {
        championName: p.championName || '',
        riotId,
        name: riotId.includes('#') ? riotId.slice(0, riotId.indexOf('#')) : riotId,
        kills: p.scores?.kills ?? 0,
        deaths: p.scores?.deaths ?? 0,
        assists: p.scores?.assists ?? 0,
        creepScore: p.scores?.creepScore ?? 0,
        wardScore: Math.round(p.scores?.wardScore ?? 0),
        level: p.level ?? 1,
        team: p.team === 'CHAOS' ? 'CHAOS' : 'ORDER',
        isDead: !!p.isDead,
        respawnTimer: Math.max(0, Math.round(p.respawnTimer ?? 0)),
        position: p.position || '',
        items: (p.items || [])
          .slice()
          .sort((a: any, b: any) => (a.slot ?? 0) - (b.slot ?? 0))
          .map((it: any) => it.itemID)
          .filter((n: number) => n > 0),
        isMe: Boolean(activeName) && riotId.toLowerCase() === activeName.toLowerCase(),
        spell1: spellId(spells.summonerSpellOne),
        spell2: spellId(spells.summonerSpellTwo),
        keystoneId: Number(runes.keystone?.id ?? runes.keystoneID ?? 0) || 0,
        primaryRuneTree: Number(runes.primaryRuneTree?.id ?? runes.primaryRuneTreeId ?? 0) || 0,
        secondaryRuneTree: Number(runes.secondaryRuneTree?.id ?? runes.secondaryRuneTreeId ?? 0) || 0,
        skinID: Number(p.skinID ?? 0) || 0,
      };
    });

    // El jugador activo: sus scores viven en allPlayers, no en activePlayer.
    const mine = players.find((p) => p.isMe) || null;
    const myTeamKills = mine ? players.filter((p) => p.team === mine.team).reduce((s, p) => s + p.kills, 0) : 0;
    const cs = d.activePlayer?.championStats || {};

    return {
      isActive: true,
      gameTime: Math.round(d.gameData?.gameTime ?? 0),
      gameMode: d.gameData?.gameMode ?? '',
      mapName: d.gameData?.mapName ?? '',
      mapNumber: d.gameData?.mapNumber ?? 0,
      me: mine ? {
        riotId: mine.riotId,
        championName: mine.championName,
        level: mine.level,
        gold: Math.round(d.activePlayer?.currentGold ?? 0),
        kills: mine.kills, deaths: mine.deaths, assists: mine.assists, creepScore: mine.creepScore,
        visionScore: mine.wardScore,
        killParticipation: myTeamKills > 0 ? Math.round(((mine.kills + mine.assists) / myTeamKills) * 100) : 0,
        championStats: {
          hp: Math.round(cs.currentHealth ?? 0), maxHp: Math.round(cs.maxHealth ?? 0),
          resource: Math.round(cs.resourceValue ?? 0), maxResource: Math.round(cs.resourceMax ?? 0),
          resourceType: cs.resourceType || 'MANA',
          ad: Math.round(cs.attackDamage ?? 0), ap: Math.round(cs.abilityPower ?? 0),
          armor: Math.round(cs.armor ?? 0), mr: Math.round(cs.magicResist ?? 0),
          ms: Math.round(cs.moveSpeed ?? 0), crit: Math.round(cs.critChance ?? 0),
        },
      } : null,
      players,
      events: d.events?.Events ?? [],
      raw: d,
    };
  }
}

// ── Timers de objetivos (Grieta) desde los EVENTOS reales ────────────────────
// Cada toma reinicia su respawn — precisión al segundo, no estimaciones.
export interface ObjectiveTimers {
  dragon: { nextAt: number; alive: boolean; taken: Array<{ team: 'ORDER' | 'CHAOS' | null; type: string; t: number }> };
  herald: { nextAt: number | null; alive: boolean; taken: boolean };
  baron: { nextAt: number | null; alive: boolean; takenCount: { ORDER: number; CHAOS: number } };
}

export function computeObjectives(state: GameState): ObjectiveTimers {
  const teamOf = (killer: string): 'ORDER' | 'CHAOS' | null => {
    const k = (killer || '').toLowerCase();
    const p = state.players.find((pl) => pl.riotId.toLowerCase() === k || pl.name.toLowerCase() === k);
    return p ? p.team : null;
  };

  let lastDragon = -1;
  const dragonsTaken: ObjectiveTimers['dragon']['taken'] = [];
  let heraldTaken = false;
  let lastBaron = -1;
  const barons = { ORDER: 0, CHAOS: 0 };

  for (const e of state.events) {
    if (e.EventName === 'DragonKill') {
      lastDragon = Math.round(e.EventTime ?? 0);
      dragonsTaken.push({ team: teamOf(e.KillerName), type: e.DragonType || 'Unknown', t: lastDragon });
    } else if (e.EventName === 'HeraldKill') {
      heraldTaken = true;
    } else if (e.EventName === 'BaronKill') {
      lastBaron = Math.round(e.EventTime ?? 0);
      const t = teamOf(e.KillerName);
      if (t) barons[t]++;
    }
  }

  // Timers de la temporada 2026: dragón 5:00 (+5:00), alma al 4.º y Anciano 6:00
  // después; Heraldo 15:00–19:45 (una vez); Barón 20:00 (+6:00).
  const t = state.gameTime;
  const elemental = dragonsTaken.filter((d) => d.type !== 'Elder');
  const soul = (['ORDER', 'CHAOS'] as const).some((side) => elemental.filter((d) => d.team === side).length >= 4);
  const dragonNext = lastDragon < 0 ? 300 : lastDragon + (soul ? 360 : 300);
  const baronBase = lastBaron < 0 ? 1200 : lastBaron + 360;

  return {
    dragon: { nextAt: dragonNext, alive: t >= dragonNext, taken: dragonsTaken },
    herald: heraldTaken || t >= 1185
      ? { nextAt: null, alive: false, taken: heraldTaken }
      : { nextAt: 900, alive: t >= 900, taken: false },
    baron: { nextAt: t >= 1140 ? baronBase : null, alive: t >= baronBase && t >= 1200, takenCount: barons },
  };
}
