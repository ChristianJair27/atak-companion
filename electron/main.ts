// electron/main.ts — ATAK Companion
// Orquestador: máquina de estados por fase del cliente (traducida de la versión
// Overwolf background.js) + ventanas overlay con los flags probados en Electron
// puro (rama fallback del atak-electron viejo) + servicios nativos LCU/2999.
//
// Fases → ventanas:
//   ChampSelect      → ventana champ-select (panel lateral)
//   InProgress       → HUD overlay + scoreboard (Ctrl+Shift+S) + [caster push]
//   EndOfGame        → ventana post-partida
//   resto            → solo la ventana principal
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LcuService } from './services/lcu.js';
import { LiveClientService, computeObjectives } from './services/live-client.js';
import { FeedPusher, type FeedConfig } from './services/feed-push.js';
import { getPatchData } from './services/patch.js';
import {
  fetchRosterOpgg,
  getChampionBuild,
  getCounters,
  getMatchup,
  getPickSuggestions,
  RUNE_PATH_NAMES,
} from './services/opgg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // lo inyecta vite-plugin-electron en dev
const BACKEND = process.env.ATAK_BACKEND || 'https://atakback.revolution505.com';
const FRONTEND = process.env.ATAK_FRONTEND || 'https://atakgg.revolution505.com';

const lcu = new LcuService();
const live = new LiveClientService();
const feed = new FeedPusher();

// ── Ventanas ─────────────────────────────────────────────────────────────────
type WinKind = 'main' | 'hud' | 'champselect' | 'scoreboard' | 'eog' | 'caster' | 'players';
const wins = new Map<WinKind, BrowserWindow>();

/** Eventos live cacheados para la timeline 2D del EOG (sin Match-V5). */
let lastLiveEvents: any[] = [];
/** Skin del jugador local (Live Client skinID) para modelo 3D en EOG. */
let lastMeSkinId = 0;
let lastMeChampionName = '';
let lastMapNumber = 11;

function loadView(win: BrowserWindow, view: WinKind) {
  if (DEV_URL) void win.loadURL(`${DEV_URL}?view=${view}`);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { view } });
}

/**
 * Overlay movible (frame:false + drag en UI).
 * - HUD: alwaysOnTop (debe flotar sobre el juego).
 * - Champ select / players / scoreboard / eog: NO alwaysOnTop — el usuario las mueve libremente.
 */
function makeOverlayWindow(
  kind: WinKind,
  opts: {
    w: number; h: number; x?: number; y?: number; center?: boolean;
    alwaysOnTop?: boolean; resizable?: boolean; transparent?: boolean;
  },
) {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  // HUD, F8 players y caster se clavan encima del juego (si no, se abren detrás de LoL).
  const pin = opts.alwaysOnTop === true;
  const win = new BrowserWindow({
    width: opts.w,
    height: opts.h,
    x: opts.center ? undefined : (opts.x ?? width - opts.w - 20),
    y: opts.center ? undefined : (opts.y ?? 20),
    center: opts.center,
    frame: false,
    transparent: opts.transparent !== false,
    resizable: opts.resizable ?? true,
    movable: true,
    minimizable: true,
    skipTaskbar: kind === 'hud' || kind === 'caster',
    show: false,
    alwaysOnTop: pin,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (pin) {
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.once('ready-to-show', () => {
    if (kind === 'hud' || kind === 'caster') win.showInactive();
    else win.show();
  });
  win.on('closed', () => wins.delete(kind));
  loadView(win, kind);
  wins.set(kind, win);
  return win;
}

function ensure(kind: WinKind): BrowserWindow {
  const existing = wins.get(kind);
  if (existing && !existing.isDestroyed()) return existing;
  switch (kind) {
    case 'main': {
      const win = new BrowserWindow({
        width: 1120, height: 720, minWidth: 900, minHeight: 600,
        frame: false, backgroundColor: '#0a0a0c', show: true,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
      });
      win.on('closed', () => wins.delete('main'));
      // Nunca depurar a ciegas: en dev, DevTools abierto y errores de carga al log.
      if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
      win.webContents.on('did-fail-load', (_e, code, desc, url) =>
        console.error('[main-window] did-fail-load', code, desc, url));
      loadView(win, 'main');
      wins.set('main', win);
      return win;
    }
    case 'hud': return makeOverlayWindow('hud', { w: 360, h: 640, alwaysOnTop: true, resizable: false });
    // Champ select: movible, NO always-on-top (no tapa el client a la fuerza)
    case 'champselect':
      return makeOverlayWindow('champselect', {
        w: 1280, h: 720, center: true, alwaysOnTop: false, resizable: true, transparent: false,
      });
    case 'scoreboard':
      return makeOverlayWindow('scoreboard', { w: 820, h: 460, center: true, alwaysOnTop: false });
    // F8 in-game: DEBE ir alwaysOnTop o se abre detrás de League y “no funciona”.
    case 'players':
      return makeOverlayWindow('players', {
        w: 1480, h: 900, center: true, alwaysOnTop: true, resizable: true, transparent: false,
      });
    case 'caster': return makeOverlayWindow('caster', { w: 1920, h: 1080, x: 0, y: 0, alwaysOnTop: true, resizable: false });
    case 'eog':
      return makeOverlayWindow('eog', {
        w: 1240, h: 860, center: true, alwaysOnTop: false, resizable: true, transparent: false,
      });
  }
}

function closeWin(kind: WinKind) {
  const w = wins.get(kind);
  if (w && !w.isDestroyed()) w.close();
  wins.delete(kind);
}

function broadcast(channel: string, payload?: any) {
  for (const w of wins.values()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// ── Máquina de estados por fase ──────────────────────────────────────────────
let casterMode = false; // el Modo Caster mantiene su propia ventana/push

function handlePhase(phase: string) {
  broadcast('phase', phase);
  switch (phase) {
    case 'ChampSelect':
      ensure('champselect');
      break;
    case 'InProgress':
    case 'GameStart':
      closeWin('champselect');
      if (!casterMode) ensure('hud');
      break;
    case 'WaitingForStats':
    case 'PreEndOfGame':
    case 'EndOfGame':
      closeWin('hud');
      closeWin('scoreboard');
      closeWin('players');
      closeWin('champselect');
      break;
    case 'None':
    case 'Lobby':
    case 'Matchmaking':
    case 'ReadyCheck':
    default:
      // Dodge / cancel / salida de champ select → cerrar panel SIEMPRE.
      // Antes solo se cerraba en Lobby/None y a veces se quedaba colgada.
      closeWin('champselect');
      if (phase === 'None' || phase === 'Lobby' || phase === 'Matchmaking' || phase === 'ReadyCheck') {
        closeWin('hud');
        closeWin('scoreboard');
        closeWin('players');
      }
      break;
  }
}

// ── Wiring de servicios ──────────────────────────────────────────────────────
lcu.on('phase', handlePhase);
lcu.on('connected', () => broadcast('lcu-connected'));
lcu.on('disconnected', () => broadcast('lcu-disconnected'));
lcu.on('summoner', (s) => broadcast('summoner', s));
lcu.on('champ-select-update', (state) => {
  // Resuelve nombres/tags en el main para que la UI analice comp sin otra llamada.
  void (async () => {
    const patch = await getPatchData().catch(() => null);
    // Celdas con acción en curso: son los jugadores a los que les toca banear o
    // pickear ahora mismo (la UI las resalta).
    const actingCells = new Set<number>();
    // El timer del LCU dice BAN_PICK tanto en baneos como en picks; el tipo de la
    // acción en curso es lo único que los distingue.
    let currentActionType = '';
    for (const group of (state.session?.actions || []) as any[][]) {
      for (const a of group || []) {
        if (a?.isInProgress && !a?.completed && a?.actorCellId != null) {
          actingCells.add(Number(a.actorCellId));
          if (!currentActionType && a?.type) currentActionType = String(a.type).toLowerCase();
        }
      }
    }
    const mapPick = (p: any) => {
      const championId = Number(p.championId || p.championPickIntent || 0) || 0;
      const meta = championId && patch ? patch.champById[championId] : null;
      return {
        cellId: p.cellId,
        championId,
        championName: meta?.name || '',
        tags: meta?.tags || [],
        position: p.assignedPosition || '',
        isLocal: p.cellId === state.session?.localPlayerCellId,
        acting: actingCells.has(Number(p.cellId)),
      };
    };
    const myBans = (state.session?.bans?.myTeamBans || []).map(Number).filter(Boolean);
    const theirBans = (state.session?.bans?.theirTeamBans || []).map(Number).filter(Boolean);
    broadcast('champ-select', {
      phase: state.phase,
      actionType: currentActionType,
      timerSecs: state.timerSecs,
      localPlayerChampionId: state.localPlayerChampionId,
      localPlayerPosition: state.localPlayerPosition,
      team: (state.session?.myTeam || []).map(mapPick),
      enemy: (state.session?.theirTeam || []).map(mapPick),
      bans: {
        ally: myBans.map((id: number) => ({
          id,
          name: patch?.champById[id]?.name || '',
        })),
        enemy: theirBans.map((id: number) => ({
          id,
          name: patch?.champById[id]?.name || '',
        })),
      },
    });
  })();
});
// Cierre forzado al terminar/dodge champ select (además de handlePhase).
lcu.on('champ-select-ended', () => {
  broadcast('champ-select-ended');
  closeWin('champselect');
});
// Build de un campeón → broadcast 'champion-build'. `preview` marca las builds
// que el usuario pidió a mano (click en una sugerencia) para distinguirlas de su
// pick real en la UI.
async function emitChampionBuild(
  championId: number,
  position: string,
  preview = false,
  rivalName = '',
) {
  // Preferencia: OP.GG MCP directo (runas/items/counters). Fallback: backend ATAK.
  try {
    const { champById, runeIconById } = await getPatchData();
    const champ = champById[championId];
    if (!champ) return;
    broadcast('champion-build-loading', { championId, name: champ.name, preview, rival: rivalName });

    const [opgg, counters, matchup] = await Promise.all([
      getChampionBuild(champ.name, position || 'MIDDLE'),
      getCounters(champ.name, position || 'MIDDLE'),
      rivalName ? getMatchup(champ.name, rivalName, position || 'MIDDLE') : Promise.resolve(null),
    ]);

    // La página de runas del matchup solo se usa si OP.GG tiene muestra real;
    // con 3 partidas de Ahri vs Garen preferimos la build general de la línea.
    const MIN_MATCHUP_PLAY = 20;
    const mRunes = matchup?.runes?.[0];
    const useMatchup = Boolean(mRunes && mRunes.play >= MIN_MATCHUP_PLAY);

    if (opgg?.rune_ids?.length || useMatchup) {
      /** OP.GG a veces manda 0–1 y a veces 0–100. */
      const asPct = (v: number | null | undefined): number | null => {
        if (v == null || !Number.isFinite(v)) return null;
        const n = Number(v);
        return n <= 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
      };
      const primaryNames = opgg?.primary_rune_names || [];
      const secondaryNames = opgg?.secondary_rune_names || [];
      const runeEntry = (id: number, name?: string) => ({
        id,
        name: name || String(id),
        icon: runeIconById[id] || null,
      });
      const weak = counters.slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name,
        winRate: Math.round(c.winRate * 1000) / 10,
        games: c.games,
      }));
      // Favorables: matchups donde el counter tiene WR bajo vs nosotros.
      const strong = counters
        .filter((c) => c.winRate < 0.48 && c.games >= 50)
        .sort((a, b) => a.winRate - b.winRate)
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          name: c.name,
          winRate: Math.round((1 - c.winRate) * 1000) / 10,
          games: c.games,
        }));

      // ── Runas / items: del matchup si hay muestra, si no de la línea ──────
      const set = (s: { ids: number[]; names: string[] } | undefined) =>
        (s?.ids || []).map((id, i) => ({ id, name: s?.names?.[i] || '' }));

      const runes = useMatchup && mRunes
        ? {
            primaryPath: RUNE_PATH_NAMES[mRunes.primaryPathId] || mRunes.primaryPathName,
            secondaryPath: RUNE_PATH_NAMES[mRunes.secondaryPathId] || mRunes.secondaryPathName,
            primaryPathId: mRunes.primaryPathId,
            secondaryPathId: mRunes.secondaryPathId,
            keystone: runeEntry(mRunes.primaryIds[0], mRunes.primaryNames[0]),
            primary: mRunes.primaryIds.slice(1, 4).map((id, i) => runeEntry(id, mRunes.primaryNames[i + 1])),
            secondary: mRunes.secondaryIds.slice(0, 2).map((id, i) => runeEntry(id, mRunes.secondaryNames[i])),
            shards: mRunes.shardIds.slice(0, 3).map((id) => runeEntry(id)),
            rune_ids: [
              ...mRunes.primaryIds.slice(0, 4),
              ...mRunes.secondaryIds.slice(0, 2),
              ...mRunes.shardIds.slice(0, 3),
            ],
          }
        : opgg?.rune_ids?.length
          ? {
              primaryPath: RUNE_PATH_NAMES[opgg.primary_path_id] || String(opgg.primary_path_id),
              secondaryPath: RUNE_PATH_NAMES[opgg.secondary_path_id] || String(opgg.secondary_path_id),
              primaryPathId: opgg.primary_path_id,
              secondaryPathId: opgg.secondary_path_id,
              keystone: runeEntry(opgg.rune_ids[0], primaryNames[0]),
              primary: opgg.rune_ids.slice(1, 4).map((id, i) => runeEntry(id, primaryNames[i + 1])),
              secondary: opgg.rune_ids.slice(4, 6).map((id, i) => runeEntry(id, secondaryNames[i])),
              shards: opgg.rune_ids.slice(6, 9).map((id) => runeEntry(id)),
              rune_ids: opgg.rune_ids,
            }
          : null;

      const items = useMatchup && matchup
        ? {
            starter: set(matchup.starterItems[0]),
            core: set(matchup.coreItems[0]),
            boots: set(matchup.boots[0]),
          }
        : {
            starter: (opgg?.starter_ids || []).map((id, i) => ({ id, name: opgg?.starter_names?.[i] || '' })),
            core: (opgg?.core_item_ids || []).map((id, i) => ({ id, name: opgg?.core_item_names?.[i] || '' })),
            boots: opgg?.boots_id ? [{ id: opgg.boots_id, name: opgg.boots_name || '' }] : [],
          };

      // Página lista para mandar al cliente de un click (9 runas exactas).
      const perkIds: number[] = runes?.rune_ids?.slice(0, 9) ?? [];
      const runePage =
        runes && perkIds.length === 9 && runes.primaryPathId && runes.secondaryPathId
          ? {
              name: `ATAK ${champ.name}${useMatchup && rivalName ? ` vs ${rivalName}` : ''}`,
              primaryStyleId: runes.primaryPathId,
              subStyleId: runes.secondaryPathId,
              selectedPerkIds: perkIds,
            }
          : null;

      const skillOrder = useMatchup && matchup?.skills?.length ? matchup.skills : opgg?.skill_order;

      broadcast('champion-build', {
        championId,
        name: champ.name,
        tags: champ.tags,
        source: 'opgg',
        preview,
        winrate: asPct(opgg?.win_rate),
        pickRate: asPct(opgg?.pick_rate),
        banRate: asPct(opgg?.ban_rate),
        tier: opgg?.tier ?? null,
        skillOrder,
        runes,
        runePage,
        items,
        counters: {
          weakAgainst: weak,
          strongAgainst: strong,
        },
        // Contexto del duelo de línea: de dónde salen estos datos y contra quién.
        matchup: matchup
          ? {
              rival: rivalName,
              play: matchup.play,
              winRate: matchup.winRate,
              runesPlay: mRunes?.play ?? 0,
              runesWinRate: mRunes?.winRate ?? null,
              tip: matchup.tip,
              playStyle: matchup.playStyle,
              spells: matchup.spells[0] ? { ids: matchup.spells[0].ids, names: matchup.spells[0].names } : null,
              source: useMatchup ? 'matchup' : 'general',
            }
          : null,
        tips: [
          useMatchup && matchup?.winRate != null
            ? `Este matchup: ${matchup.winRate}% de winrate en ${matchup.play} partidas (OP.GG).`
            : null,
          !useMatchup && rivalName
            ? `Sin muestra suficiente vs ${rivalName}: runas e items de la línea, no del duelo.`
            : null,
          counters[0]
            ? `Cuidado con ${counters[0].name}: te gana ~${Math.round(counters[0].winRate * 100)}% en matchup.`
            : null,
          skillOrder?.length
            ? `Prioridad de skills: ${skillOrder.slice(0, 3).join(' → ').toUpperCase()}.`
            : null,
        ].filter(Boolean),
      });
      return;
    }

    // Fallback backend (tips IA / curated) si MCP no respondió.
    const res = await fetch(
      `${BACKEND}/api/champ-select?champion=${encodeURIComponent(champ.id)}${
        position ? `&position=${encodeURIComponent(position)}` : ''
      }`,
    );
    const data = (await res.json()) as Record<string, unknown>;
    broadcast('champion-build', {
      championId,
      name: champ.name,
      tags: champ.tags,
      source: 'backend',
      preview,
      ...data,
      counters: {
        weakAgainst: counters.slice(0, 6).map((c) => ({
          id: c.id,
          name: c.name,
          winRate: Math.round(c.winRate * 1000) / 10,
          games: c.games,
        })),
        strongAgainst: [],
        ...(typeof data.counters === 'object' && data.counters ? (data.counters as object) : {}),
      },
    });
  } catch (e: any) {
    broadcast('champion-build-error', { championId, error: e.message, preview });
  }
}

lcu.on('local-champion-changed', (championId: number, position: string) => {
  void emitChampionBuild(championId, position, false);
});
lcu.on('eog-stats', (payloadIn: any) => {
  // lcu emite { eog, ranked } (ranked = before/after/lpDelta).
  closeWin('players');
  const eog = payloadIn?.eog ?? payloadIn;
  const ranked = payloadIn?.ranked ?? null;
  const payload = {
    ...eog,
    _liveEvents: lastLiveEvents,
    _region: lcu.region,
    _summoner: lcu.summoner,
    _ranked: ranked,
    _meSkinId: lastMeSkinId,
    _meChampionName: lastMeChampionName,
    _mapNumber: lastMapNumber,
  };
  ensure('eog');
  const w = wins.get('eog');
  w?.webContents.once('did-finish-load', () => w.webContents.send('eog-data', payload));
  setTimeout(() => w?.webContents.send('eog-data', payload), 400);
});

live.on('game-started', () => {
  lastLiveEvents = [];
  lastMeSkinId = 0;
  lastMeChampionName = '';
  broadcast('game-started');
});
live.on('game-ended', () => {
  broadcast('game-ended');
  closeWin('players');
  if (casterMode) void 0; // el caster sigue esperando la siguiente partida
});
live.on('state', (state) => {
  if (Array.isArray(state?.events)) lastLiveEvents = state.events;
  if (state?.mapNumber) lastMapNumber = Number(state.mapNumber) || 11;
  const me = (state?.players || []).find((p: any) => p.isMe);
  if (me) {
    lastMeSkinId = Number(me.skinID) || 0;
    lastMeChampionName = String(me.championName || '');
  }
  const objectives = computeObjectives(state);
  // events se ocultan del broadcast liviano; se reinyectan al EOG desde lastLiveEvents
  broadcast('live', { state: { ...state, raw: undefined, events: undefined }, objectives });
  if (feed.active) void feed.push(state);
});

// ── IPC de la UI ─────────────────────────────────────────────────────────────
ipcMain.handle('status', () => ({
  lcuConnected: lcu.connected,
  phase: lcu.currentPhase,
  summoner: lcu.summoner,
  region: lcu.region,
  inGame: live.state?.isActive ?? false,
  casterMode,
  feed: { active: feed.active, pushed: feed.pushed, lastStatus: feed.lastStatus },
  backend: BACKEND,
  frontend: FRONTEND,
}));
ipcMain.handle('patch-data', async () => await getPatchData());
ipcMain.handle('caster-start', (_e, cfg: FeedConfig & { showOverlay?: boolean }) => {
  casterMode = true;
  feed.configure(cfg.token ? cfg : null);
  if (cfg.showOverlay) ensure('caster');
  return { ok: true };
});
ipcMain.handle('caster-stop', () => {
  casterMode = false;
  feed.configure(null);
  closeWin('caster');
  return { ok: true };
});
ipcMain.on('open-external', (_e, url: string) => {
  if (/^https?:\/\//.test(String(url))) void shell.openExternal(url);
});
ipcMain.on('win', (e, action: 'minimize' | 'close' | 'hide') => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (action === 'minimize') w.minimize();
  else if (action === 'hide') w.hide();
  else w.close();
});

// OP.GG MCP — roster de la partida viva + build del campeón local
ipcMain.handle('opgg-roster', async () => {
  const state = live.state;
  if (!state?.players?.length) return { ok: false, players: [], build: null };
  const region = lcu.region || 'LA1';
  const players = state.players.map((p) => ({
    riotId: p.riotId,
    championName: p.championName,
    name: p.name,
    team: p.team,
    isMe: p.isMe,
    position: p.position,
    level: p.level,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    creepScore: p.creepScore,
    items: p.items,
    spell1: p.spell1,
    spell2: p.spell2,
    keystoneId: p.keystoneId,
    primaryRuneTree: p.primaryRuneTree,
    secondaryRuneTree: p.secondaryRuneTree,
    skinID: p.skinID,
  }));
  const cards = await fetchRosterOpgg(
    players.map((p) => ({ riotId: p.riotId, championName: p.championName })),
    region,
  );
  const me = players.find((p) => p.isMe) || players[0];
  const build = me
    ? await getChampionBuild(me.championName, me.position || 'MIDDLE')
    : null;
  return {
    ok: true,
    region,
    gameTime: state.gameTime,
    gameMode: state.gameMode,
    players: players.map((p, i) => ({ ...p, opgg: cards[i] })),
    build,
    meChampion: me?.championName || null,
    mePosition: me?.position || null,
  };
});

ipcMain.handle('opgg-build', async (_e, championName: string, position: string) => {
  if (!championName) return null;
  return await getChampionBuild(String(championName), String(position || 'MIDDLE'));
});

/** Nombre de campeón → championId numérico usando el patch en memoria. */
async function championIdByName(championName: string): Promise<number> {
  const needle = String(championName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!needle) return 0;
  try {
    const { champById } = await getPatchData();
    const hit = Object.entries(champById).find(
      ([, c]: [string, any]) => String(c?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === needle,
    );
    return hit ? Number(hit[0]) : 0;
  } catch {
    return 0;
  }
}

// Click en una sugerencia de pick → misma tubería de build que el pick real,
// marcada como preview para que la UI ofrezca volver a tu campeón.
ipcMain.handle('champion-preview', async (_e, championName: string, position: string, rival?: string) => {
  const championId = await championIdByName(championName);
  if (!championId) return { ok: false };
  void emitChampionBuild(championId, String(position || 'MIDDLE'), true, String(rival || ''));
  return { ok: true, championId };
});

// ── Acciones sobre el cliente de League ──────────────────────────────────────
// Hover = intención de pick (reversible). Lock = confirmar, solo en tu turno.
ipcMain.handle('champ-select-hover', async (_e, championName: string) => {
  const championId = await championIdByName(championName);
  if (!championId) return { ok: false, error: 'Campeón desconocido' };
  return await lcu.hoverChampion(championId);
});

ipcMain.handle('champ-select-lock', async (_e, championName?: string) => {
  const championId = championName ? await championIdByName(championName) : 0;
  return await lcu.lockChampion(championId || undefined);
});

// Aplicar runas: solo cuando el jugador pulsa el botón, nunca automático.
ipcMain.handle('apply-runes', async (_e, page: any) => {
  const ids = Array.isArray(page?.selectedPerkIds) ? page.selectedPerkIds.map(Number).filter(Boolean) : [];
  return await lcu.applyRunePage({
    name: String(page?.name || 'ATAK'),
    primaryStyleId: Number(page?.primaryStyleId) || 0,
    subStyleId: Number(page?.subStyleId) || 0,
    selectedPerkIds: ids,
  });
});

// Runas/build de un matchup concreto sin tocar el estado de champ select
// (lo usa el análisis post-partida).
ipcMain.handle('matchup-data', async (_e, championName: string, opponentName: string, position: string) => {
  if (!championName || !opponentName) return null;
  return await getMatchup(String(championName), String(opponentName), String(position || 'MIDDLE'));
});

ipcMain.handle('opgg-pick-suggestions', async (_e, payload: any) => {
  try {
    // Tags del patch para que el scoring sepa qué campeón cubre AP/AD/TANK.
    const tagsByName: Record<string, string[]> = {};
    try {
      const { champById } = await getPatchData();
      for (const c of Object.values(champById) as any[]) {
        const k = String(c?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (k) tagsByName[k] = Array.isArray(c?.tags) ? c.tags : [];
      }
    } catch { /* sin patch: scoring solo por meta */ }

    return await getPickSuggestions({
      position: String(payload?.position || 'MIDDLE'),
      missingRoles: Array.isArray(payload?.missingRoles) ? payload.missingRoles.map(String) : [],
      bannedNames: Array.isArray(payload?.bannedNames) ? payload.bannedNames.map(String) : [],
      pickedNames: Array.isArray(payload?.pickedNames) ? payload.pickedNames.map(String) : [],
      limit: Number(payload?.limit) || 6,
      tagsByName,
      enemyNames: Array.isArray(payload?.enemyNames) ? payload.enemyNames.map(String) : [],
      rivalName: String(payload?.rivalName || ''),
      deep: payload?.deep !== false,
    });
  } catch (e: any) {
    console.warn('[opgg] pick-suggestions', e?.message);
    return [];
  }
});

function raisePlayersWindow(win: BrowserWindow) {
  try {
    // Critico sobre League en borderless/fullscreen: clavar y traer al frente.
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (win.isMinimized()) win.restore();
    win.show();
    win.moveTop();
    // showInactive evita robar el foco del juego (el hotkey sigue llegando).
    win.showInactive();
  } catch (e) {
    console.warn('[players] raise failed', e);
  }
}

function togglePlayersPanel(reason = 'hotkey') {
  const pw = wins.get('players');
  if (pw && !pw.isDestroyed()) {
    if (pw.isVisible()) {
      console.log('[hotkey] players HIDE', reason);
      pw.hide();
      return;
    }
    console.log('[hotkey] players SHOW', reason);
    raisePlayersWindow(pw);
    return;
  }
  const phase = String(lcu.currentPhase || '');
  const inGame =
    Boolean(live.state?.isActive) ||
    phase === 'InProgress' ||
    phase === 'GameStart' ||
    phase === 'WaitingForStats';
  console.log('[hotkey] players OPEN', reason, {
    inGame,
    phase,
    live: Boolean(live.state?.isActive),
    players: live.state?.players?.length ?? 0,
  });
  const win = ensure('players');
  if (win) raisePlayersWindow(win);
}

ipcMain.handle('toggle-players', () => {
  togglePlayersPanel('ipc');
  return { ok: true, open: Boolean(wins.get('players') && !wins.get('players')!.isDestroyed()) };
});

// ── Ciclo de vida ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensure('main');
  lcu.start();
  live.start();

  const bind = (accel: string, fn: () => void) => {
    const ok = globalShortcut.register(accel, fn);
    console.log(`[hotkey] register ${accel}: ${ok ? 'OK' : 'FAIL (ya tomado o inválido)'}`);
    return ok;
  };

  // Hotkeys
  bind('F9', () => {
    const hud = wins.get('hud');
    if (hud && !hud.isDestroyed()) { hud.isVisible() ? hud.hide() : hud.showInactive(); }
    else if (live.state?.isActive || lcu.currentPhase === 'InProgress') ensure('hud');
  });
  bind('CommandOrControl+Shift+S', () => {
    const sb = wins.get('scoreboard');
    if (sb && !sb.isDestroyed()) closeWin('scoreboard');
    else ensure('scoreboard');
  });

  // F8 es el principal (como F9 HUD). League a veces come Ctrl+A.
  // Si el juego está en "pantalla completa exclusiva", Windows puede bloquear
  // hotkeys: usa borderless windowed en LoL. Con borderless + alwaysOnTop OK.
  const openPlayers = () => {
    console.log('[hotkey] F8/players fired');
    togglePlayersPanel('hotkey');
  };
  bind('F8', openPlayers);
  bind('F10', openPlayers);
  bind('CommandOrControl+Shift+A', openPlayers);
  bind('Alt+A', openPlayers);
  // Re-registrar tras 3s por si otro proceso los soltó al arrancar.
  setTimeout(() => {
    for (const accel of ['F8', 'F10', 'CommandOrControl+Shift+A', 'Alt+A']) {
      try { globalShortcut.unregister(accel); } catch { /* */ }
      bind(accel, openPlayers);
    }
    console.log('[hotkey] players re-bound: F8 · F10 · Ctrl+Shift+A · Alt+A');
  }, 3000);
  console.log('[hotkey] players: F8 · F10 · Ctrl+Shift+A · Alt+A');
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// Evitar que se cierre la app al cerrar overlays (main puede estar oculta).
app.on('browser-window-created', (_e, win) => {
  win.setMenuBarVisibility(false);
});
