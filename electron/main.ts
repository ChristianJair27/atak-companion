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
import { uIOhook, UiohookKey } from 'uiohook-napi';
// electron-updater es CJS: importar el default y desestructurar (los named
// exports no siempre son analizables desde ESM).
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import path from 'node:path';
import { writeFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LcuService } from './services/lcu.js';
import { LiveClientService, computeObjectives } from './services/live-client.js';
import { FeedPusher, type FeedConfig } from './services/feed-push.js';
import { getPatchData } from './services/patch.js';
import { AugmentDetector, CARD_GEOM, CARD_GEOM_ARENA } from './services/augment-detector.js';
import { analyzeDraft, draftAiNames, type DraftRequest } from './services/draft-ai.js';
import {
  fetchRosterOpgg,
  getChampionBuild,
  getCounters,
  getMatchup,
  getPickSuggestions,
  getAramAugmentBoard,
  RUNE_PATH_NAMES,
  type OpggGameMode,
} from './services/opgg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // lo inyecta vite-plugin-electron en dev
const BACKEND = process.env.ATAK_BACKEND || 'https://atakback.revolution505.com';
const FRONTEND = process.env.ATAK_FRONTEND || 'https://atakgg.revolution505.com';

const lcu = new LcuService();
const live = new LiveClientService();
const feed = new FeedPusher();

// ── Ventanas ─────────────────────────────────────────────────────────────────
type WinKind = 'main' | 'hud' | 'champselect' | 'scoreboard' | 'eog' | 'caster' | 'players' | 'augments' | 'augbadges';
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
      // Overlays sobre el juego: Chromium los cree "ocultos" y congela rAF → las
      // animaciones (framer) se quedaban a medias (vista oscura/borrosa).
      backgroundThrottling: false,
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
        width: 1180, height: 760, minWidth: 960, minHeight: 620,
        frame: false, backgroundColor: '#0a0a0c', show: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          // Pestaña "ATAK.GG": el frontend real embebido en un <webview>
          // (proceso aislado, sin acceso a window.atak).
          webviewTag: true,
        },
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
    case 'hud': return makeOverlayWindow('hud', { w: 320, h: 420, alwaysOnTop: true, resizable: false });
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
    // Augments ARAM (F7): panel lateral IZQUIERDO — las cards de augments
    // salen al centro de la pantalla, así no las tapa. AlwaysOnTop como el HUD.
    case 'augments':
      return makeOverlayWindow('augments', { w: 400, h: 740, x: 16, y: 90, alwaysOnTop: true, resizable: true });
    // Badges SOBRE las cards de augments: ventana fullscreen transparente que
    // deja pasar TODOS los clics (el jugador clickea la card de League
    // normalmente; nosotros solo pintamos encima).
    case 'augbadges': {
      const { width, height } = screen.getPrimaryDisplay().bounds;
      const win = new BrowserWindow({
        x: 0, y: 0, width, height,
        frame: false, transparent: true, resizable: false, movable: false,
        focusable: false, skipTaskbar: true, show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      win.setIgnoreMouseEvents(true, { forward: true });
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.on('closed', () => wins.delete('augbadges'));
      loadView(win, 'augbadges');
      wins.set('augbadges', win);
      return win;
    }
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

// ── Show/hide animado de overlays ────────────────────────────────────────────
// La ventana no puede animarse sola (es frameless/transparente): el contenido
// reproduce la coreografía (spring de entrada / genie de salida, estilo Apple)
// y el main sincroniza el hide con el final de la animación.
const OVERLAY_OUT_MS = 200;
const hideTimers = new Map<number, ReturnType<typeof setTimeout>>();

function animatedShow(win: BrowserWindow, raise: (w: BrowserWindow) => void = (w) => w.showInactive()) {
  const t = hideTimers.get(win.id);
  if (t) { clearTimeout(t); hideTimers.delete(win.id); }
  raise(win);
  win.webContents.send('overlay-anim', 'in');
}

function animatedHide(win: BrowserWindow) {
  if (!win.isVisible() || hideTimers.has(win.id)) return;
  win.webContents.send('overlay-anim', 'out');
  const t = setTimeout(() => {
    hideTimers.delete(win.id);
    if (!win.isDestroyed()) win.hide();
  }, OVERLAY_OUT_MS);
  hideTimers.set(win.id, t);
}

// ── Perfil ATAK.GG embebido ──────────────────────────────────────────────────
// Clic en un jugador/campeón en cualquier vista → el frontend real de ATAK
// dentro de la app (siempre la última versión desplegada — cero duplicación).
// SIN preload: es contenido remoto y no debe ver window.atak.
let atakWin: BrowserWindow | null = null;

function openAtakPage(pagePath: string) {
  const url = `${FRONTEND}${pagePath.startsWith('/') ? '' : '/'}${pagePath}`;
  if (atakWin && !atakWin.isDestroyed()) {
    void atakWin.loadURL(url);
    if (atakWin.isMinimized()) atakWin.restore();
    atakWin.show();
    atakWin.focus();
    return;
  }
  atakWin = new BrowserWindow({
    width: 1360, height: 900, minWidth: 980, minHeight: 640,
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    title: 'ATAK.GG',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  atakWin.on('closed', () => { atakWin = null; });
  // Enlaces externos (Discord, etc.) al navegador del sistema; el resto navega dentro.
  atakWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith(FRONTEND)) return { action: 'allow' };
    if (/^https?:\/\//.test(u)) void shell.openExternal(u);
    return { action: 'deny' };
  });
  void atakWin.loadURL(url);
}

/** Región LCU ('LA1') → plataforma de la URL del frontend ('la1'). */
function currentPlatform(): string {
  return String(lcu.region || 'la1').toLowerCase();
}

function broadcast(channel: string, payload?: any) {
  for (const w of wins.values()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// ── Máquina de estados por fase ──────────────────────────────────────────────
let casterMode = false; // el Modo Caster mantiene su propia ventana/push

// Modo OP.GG según la cola actual (LCU) o el modo vivo (Live Client):
// runas/builds/picks se adaptan a ARAM/Arena; solo/flex comparten 'ranked'.
function currentOpggMode(): OpggGameMode {
  const qid = lcu.currentQueueId;
  if (qid === 450 || qid === 3220) return 'aram';
  if (qid === 1700 || qid === 1710 || qid === 1720) return 'arena';
  const liveMode = String(live.state?.gameMode || '').toUpperCase();
  if (liveMode === 'ARAM') return 'aram';
  if (liveMode === 'CHERRY') return 'arena';
  return 'ranked';
}

function handlePhase(phase: string) {
  broadcast('phase', phase);
  switch (phase) {
    case 'ChampSelect':
      // En modo caster no se auto-abre NINGÚN overlay in-game: la prioridad es
      // la vista de espectador limpia. Los hotkeys siguen como override manual.
      if (!casterMode) ensure('champselect');
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
      closeWin('augments');
      augDetector.stop();
      closeWin('augbadges');
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
        closeWin('augments');
      }
      break;
  }
}

// ── Wiring de servicios ──────────────────────────────────────────────────────
lcu.on('phase', handlePhase);
lcu.on('connected', () => broadcast('lcu-connected'));
lcu.on('disconnected', () => broadcast('lcu-disconnected'));
lcu.on('summoner', (s) => broadcast('summoner', s));
// ── Datos del cliente de Riot por jugador del draft (una vez por puuid) ──────
// Nombre de invocador, rango SoloQ/Flex y maestría por campeón. En ranked el
// LCU oculta el puuid de los enemigos: solo se enriquece lo que el cliente da.
interface CellInfo {
  gameName: string;
  tagLine: string;
  rank: { queue: string; tier: string; division: string; lp: number; wins: number; losses: number } | null;
  masteryByChamp: Record<number, { level: number; points: number }>;
}
const cellInfoCache = new Map<string, Promise<CellInfo>>();
function getCellInfo(puuid: string, summonerId: number): Promise<CellInfo> {
  const hit = cellInfoCache.get(puuid);
  if (hit) return hit;
  const job = (async (): Promise<CellInfo> => {
    const [sum, ranked, m1] = await Promise.all([
      lcu.get<any>(`/lol-summoner/v2/summoners/puuid/${puuid}`),
      lcu.get<any>(`/lol-ranked/v1/ranked-stats/${puuid}`),
      lcu.get<any>(`/lol-champion-mastery/v1/${puuid}/champion-mastery`),
    ]);
    let mastery: any[] = Array.isArray(m1) ? m1 : [];
    if (!mastery.length && summonerId) {
      const m2 = await lcu.get<any>(`/lol-collections/v1/inventories/${summonerId}/champion-mastery`);
      if (Array.isArray(m2)) mastery = m2;
    }
    const masteryByChamp: Record<number, { level: number; points: number }> = {};
    for (const m of mastery) {
      const id = Number(m?.championId);
      if (id) masteryByChamp[id] = { level: Number(m?.championLevel) || 0, points: Number(m?.championPoints) || 0 };
    }
    const qmap = ranked?.queueMap || {};
    const q = qmap.RANKED_SOLO_5x5?.tier && qmap.RANKED_SOLO_5x5.tier !== 'NONE' ? qmap.RANKED_SOLO_5x5
      : qmap.RANKED_FLEX_SR?.tier && qmap.RANKED_FLEX_SR.tier !== 'NONE' ? qmap.RANKED_FLEX_SR : null;
    return {
      gameName: String(sum?.gameName || sum?.displayName || ''),
      tagLine: String(sum?.tagLine || ''),
      rank: q ? {
        queue: String(q.queueType || ''), tier: String(q.tier || ''), division: String(q.division || ''),
        lp: Number(q.leaguePoints) || 0, wins: Number(q.wins) || 0, losses: Number(q.losses) || 0,
      } : null,
      masteryByChamp,
    };
  })().catch((): CellInfo => ({ gameName: '', tagLine: '', rank: null, masteryByChamp: {} }));
  cellInfoCache.set(puuid, job);
  return job;
}

lcu.on('champ-select-update', (state) => {
  // Resuelve nombres/tags en el main para que la UI analice comp sin otra llamada.
  void (async () => {
    const patch = await getPatchData().catch(() => null);
    // Riot API (LCU) por celda: nombre, rango y maestría (cacheado por puuid).
    const cells: any[] = [...(state.session?.myTeam || []), ...(state.session?.theirTeam || [])];
    const infoByCell = new Map<number, CellInfo>();
    await Promise.all(cells.map(async (c) => {
      const puuid = String(c?.puuid || '');
      if (!puuid || puuid === '0') return;
      infoByCell.set(Number(c.cellId), await getCellInfo(puuid, Number(c?.summonerId) || 0));
    }));
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
      const info = infoByCell.get(Number(p.cellId)) || null;
      return {
        cellId: p.cellId,
        championId,
        championName: meta?.name || '',
        tags: meta?.tags || [],
        position: p.assignedPosition || '',
        isLocal: p.cellId === state.session?.localPlayerCellId,
        acting: actingCells.has(Number(p.cellId)),
        spells: [Number(p.spell1Id) || 0, Number(p.spell2Id) || 0],
        summonerName: info?.gameName || '',
        tagLine: info?.tagLine || '',
        rank: info?.rank || null,
        mastery: championId && info ? info.masteryByChamp[championId] || null : null,
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
  cellInfoCache.clear();
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

    const mode = currentOpggMode();
    const [opgg, counters, matchup] = await Promise.all([
      getChampionBuild(champ.name, position || 'MIDDLE', mode),
      // Counters/matchup son conceptos de línea: solo aplican en la Grieta.
      mode === 'ranked' ? getCounters(champ.name, position || 'MIDDLE') : Promise.resolve([]),
      mode === 'ranked' && rivalName ? getMatchup(champ.name, rivalName, position || 'MIDDLE') : Promise.resolve(null),
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
        // Builds completas (6 items) con variantes y alternativas por slot.
        fullBuilds: opgg?.full_builds ?? [],
        itemOptions: opgg?.item_options ?? null,
        spells: opgg?.spell_ids ?? [],
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
lcu.on('eog-stats', (payloadIn: any) => void (async () => {
  // lcu emite { eog, ranked } (ranked = before/after/lpDelta).
  closeWin('players');
  const eog = payloadIn?.eog ?? payloadIn;
  const ranked = payloadIn?.ranked ?? null;
  // Rango de los 10 jugadores (LCU ranked-stats por puuid; en paralelo).
  const ranks: Record<string, any> = {};
  const people: any[] = (Array.isArray(eog?.teams) ? eog.teams : []).flatMap((t: any) => t?.players || []);
  await Promise.all(people.map(async (p: any) => {
    const puuid = String(p?.puuid || p?.stats?.puuid || '');
    if (!puuid || puuid === '0' || ranks[puuid]) return;
    const r = await lcu.get<any>(`/lol-ranked/v1/ranked-stats/${puuid}`);
    const qmap = r?.queueMap || {};
    const q = qmap.RANKED_SOLO_5x5?.tier && qmap.RANKED_SOLO_5x5.tier !== 'NONE' ? qmap.RANKED_SOLO_5x5
      : qmap.RANKED_FLEX_SR?.tier && qmap.RANKED_FLEX_SR.tier !== 'NONE' ? qmap.RANKED_FLEX_SR : null;
    ranks[puuid] = q
      ? { queue: String(q.queueType || ''), tier: String(q.tier || ''), division: String(q.division || ''), lp: Number(q.leaguePoints) || 0, wins: Number(q.wins) || 0, losses: Number(q.losses) || 0 }
      : null;
  }));
  const payload = {
    ...eog,
    _ranks: ranks,
    _liveEvents: lastLiveEvents,
    _region: lcu.region,
    _summoner: lcu.summoner,
    _ranked: ranked,
    _meSkinId: lastMeSkinId,
    _meChampionName: lastMeChampionName,
    _mapNumber: lastMapNumber,
  };
  // En modo caster no se auto-abre el post-partida: el caster va directo a la
  // siguiente partida sin ventanas encima de la vista de espectador.
  if (casterMode) return;
  ensure('eog');
  const w = wins.get('eog');
  w?.webContents.once('did-finish-load', () => w.webContents.send('eog-data', payload));
  setTimeout(() => w?.webContents.send('eog-data', payload), 400);
})());

live.on('game-started', () => {
  lastLiveEvents = [];
  lastMeSkinId = 0;
  lastMeChampionName = '';
  augmentsAutoShown = false;
  broadcast('game-started');
});
live.on('game-ended', () => {
  broadcast('game-ended');
  closeWin('players');
  closeWin('augments');
  augDetector.stop();
  closeWin('augbadges');
  if (casterMode) void 0; // el caster sigue esperando la siguiente partida
});
// Detector visual de la oferta de augments: identifica las 3 cards por sus
// iconos (captura de pantalla + matching) y pinta badges tier/pick% encima.
const augDetector = new AugmentDetector();
augDetector.on('offers', (matches) => {
  const w = wins.get('augbadges');
  if (matches) {
    const win = w && !w.isDestroyed() ? w : ensure('augbadges');
    win.showInactive();
    // El overlay pinta "sinergia con {campeón}": va el nombre junto a las cards.
    win.webContents.send('aug-offers', { matches, championName: lastMeChampionName });
  } else if (w && !w.isDestroyed()) {
    w.webContents.send('aug-offers', null);
    setTimeout(() => { if (!w.isDestroyed()) w.hide(); }, 250);
  }
});

// Al detectar partida de ARAM o Arena: preparar huellas del pool (stats del
// campeón propio incluidas) y arrancar la vigilancia visual. Una vez por partida.
let augmentsAutoShown = false;
live.on('state', (state) => {
  const liveMode = String(state?.gameMode || '').toUpperCase();
  if (
    !augmentsAutoShown && !casterMode
    && state?.isActive
    && (liveMode === 'ARAM' || liveMode === 'CHERRY')
    && (state?.players || []).some((p: any) => p.isMe && p.championName)
  ) {
    augmentsAutoShown = true;
    void (async () => {
      try {
        const me = (state.players || []).find((p: any) => p.isMe);
        lastMeChampionName = String(me?.championName || '');
        const championId = await championIdByName(me?.championName || '');
        const board = await getAramAugmentBoard(championId);
        if (!board.length) { ensure('augments'); return; } // sin datos → panel F7 clásico
        const n = await augDetector.prepare(board);
        console.log(`[aug-detector] ${n} huellas de iconos listas — vigilando la oferta de augments`);
        augDetector.start(1800, liveMode === 'CHERRY' ? CARD_GEOM_ARENA : CARD_GEOM);
      } catch (e: any) {
        console.warn('[aug-detector] no arrancó:', e?.message);
        ensure('augments');
      }
    })();
  }
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
  if (feed.active) {
    void feed.push(state);
    dumpRawForDebug(state);
  }
});

// Modo caster: cada 30 s guarda el allgamedata crudo en la carpeta de datos de
// la app (debug-allgamedata.json). Sirve para ver qué campos trae Riot en cada
// parche (misiones de rol, cargas…) sin tener que abrir el juego otra vez.
// Solo en disco local: no se envía a ningún sitio.
let lastRawDump = 0;
function dumpRawForDebug(state: any) {
  if (!state?.raw || Date.now() - lastRawDump < 30_000) return;
  lastRawDump = Date.now();
  try {
    writeFile(path.join(app.getPath('userData'), 'debug-allgamedata.json'), JSON.stringify(state.raw), () => { /* mejor esfuerzo */ });
  } catch { /* sin disco: da igual */ }
}

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
  // Prioridad total a la vista del caster: cerrar cualquier overlay in-game
  // que ya estuviera abierto (se pueden reabrir a mano con los hotkeys).
  closeWin('hud');
  closeWin('scoreboard');
  closeWin('players');
  closeWin('champselect');
  closeWin('eog');
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

// ── Frontend ATAK embebido: perfil de jugador / página de campeón ────────────
ipcMain.on('open-atak-profile', (_e, riotId: string, platform?: string) => {
  const rid = String(riotId || '').trim();
  if (!rid.includes('#')) return;
  const pf = String(platform || currentPlatform()).toLowerCase();
  openAtakPage(`/stats/${pf}/${encodeURIComponent(rid)}`);
});
ipcMain.on('open-atak', (_e, pagePath: string) => {
  const p = String(pagePath || '');
  // Solo rutas internas del frontend — nada de URLs arbitrarias.
  if (!p.startsWith('/') || p.startsWith('//')) return;
  openAtakPage(p);
});
ipcMain.on('win', (e, action: 'minimize' | 'close' | 'hide') => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (action === 'minimize') w.minimize();
  else if (action === 'hide') w.hide();
  else w.close();
});

// OP.GG MCP — roster de la partida viva + build del campeón local.
// CACHÉ DE PAYLOAD: el roster de una misma partida no cambia (mismos 10
// jugadores/campeones), así que la respuesta completa se cachea por roster.
// Reabrir el panel con F8 es instantáneo (antes cada apertura re-armaba
// todo y se veían spinners); fuera de partida se sirve el último conocido.
let rosterPayloadCache: { key: string; payload: any } | null = null;
ipcMain.handle('opgg-roster', async () => {
  const state = live.state;
  if (!state?.players?.length) {
    return rosterPayloadCache?.payload ?? { ok: false, players: [], build: null };
  }
  const rosterKey = state.players.map((p) => `${p.riotId}:${p.championName}`).join('|');
  if (rosterPayloadCache?.key === rosterKey) return rosterPayloadCache.payload;
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
    ? await getChampionBuild(me.championName, me.position || 'MIDDLE', currentOpggMode())
    : null;
  const payload = {
    ok: true,
    region,
    gameTime: state.gameTime,
    gameMode: state.gameMode,
    players: players.map((p, i) => ({ ...p, opgg: cards[i] })),
    build,
    meChampion: me?.championName || null,
    mePosition: me?.position || null,
  };
  rosterPayloadCache = { key: rosterKey, payload };
  return payload;
});

// ATAK Coach: análisis IA del draft → build personalizada para esta partida.
ipcMain.handle('draft-analyze', async (_e, req: DraftRequest) => {
  if (!req?.me?.championName) return null;
  try {
    return await analyzeDraft({ ...req, mode: req.mode || currentOpggMode() });
  } catch (e: any) {
    console.warn('[draft-ai] falló:', e?.message);
    return null;
  }
});
ipcMain.handle('draft-ai-names', async () => await draftAiNames().catch(() => ({ items: {}, runes: {} })));

// Meta de un campeón en su rol (tier / WR / PR / BR) para los chips del draft.
// Reusa el caché de builds del servicio: una llamada por campeón+rol.
ipcMain.handle('champ-meta', async (_e, championName: string, position: string) => {
  if (!championName) return null;
  const b = await getChampionBuild(String(championName), String(position || ''), currentOpggMode()).catch(() => null);
  if (!b) return null;
  const pct = (v: number | null) => (v == null ? null : v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10);
  return { winRate: pct(b.win_rate), pickRate: pct(b.pick_rate), banRate: pct(b.ban_rate), tier: b.tier, rank: b.rank };
});

ipcMain.handle('opgg-build', async (_e, championName: string, position: string) => {
  if (!championName) return null;
  return await getChampionBuild(String(championName), String(position || 'MIDDLE'), currentOpggMode());
});

// Augments de ARAM para MI campeón: tier + pick rate de la comunidad (OP.GG)
// con iconos/rareza de CDragon. Cache 30 min por campeón en el servicio.
ipcMain.handle('aram-augments', async () => {
  const me = (live.state?.players || []).find((p: any) => p.isMe);
  const championName = me?.championName || lastMeChampionName;
  if (!championName) return { ok: false, championName: null, augments: [] };
  const championId = await championIdByName(championName);
  const augments = await getAramAugmentBoard(championId);
  return { ok: augments.length > 0, championName, championId, augments };
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
    if (pw.isVisible() && !hideTimers.has(pw.id)) {
      console.log('[hotkey] players HIDE', reason);
      animatedHide(pw);
      return;
    }
    console.log('[hotkey] players SHOW', reason);
    animatedShow(pw, raisePlayersWindow);
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

// Toggle de cualquier overlay desde la UI (mismo camino animado que el hotkey):
// para que TODO sea alcanzable con mouse aunque un hotkey falle.
ipcMain.handle('toggle-overlay', (_e, kind: string) => {
  if (kind === 'players') { togglePlayersPanel('ui'); return { ok: true }; }
  if (kind !== 'hud' && kind !== 'scoreboard' && kind !== 'champselect' && kind !== 'augments') return { ok: false };
  const existing = wins.get(kind as WinKind);
  if (existing && !existing.isDestroyed()) {
    existing.isVisible() && !hideTimers.has(existing.id)
      ? animatedHide(existing)
      : animatedShow(existing);
  } else {
    ensure(kind as WinKind);
  }
  return { ok: true };
});

// Traer un overlay al frente sin togglear (segmented SELECT | EN PARTIDA del
// post-partida): si ya está visible se queda visible.
ipcMain.handle('show-overlay', (_e, kind: string) => {
  if (kind !== 'hud' && kind !== 'champselect') return { ok: false };
  const existing = wins.get(kind);
  if (existing && !existing.isDestroyed()) {
    animatedShow(existing, kind === 'hud' ? undefined : (w) => { w.show(); w.focus(); });
  } else {
    ensure(kind);
  }
  return { ok: true };
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

  // Los hotkeys llegan por DOS caminos (globalShortcut + hook de bajo nivel);
  // este candado evita el doble toggle cuando ambos disparan a la vez.
  const lastFire = new Map<string, number>();
  const fire = (key: string, fn: () => void) => {
    const now = Date.now();
    if (now - (lastFire.get(key) || 0) < 250) return;
    lastFire.set(key, now);
    fn();
  };

  // Los hotkeys de overlays solo tienen sentido con LoL presente: sin cliente
  // ni partida, no-op (antes Ctrl+A abría el panel escribiendo en Word).
  const lolPresent = () => lcu.connected || Boolean(live.state?.isActive);

  const toggleHud = () => {
    if (!lolPresent()) return;
    const hud = wins.get('hud');
    if (hud && !hud.isDestroyed()) {
      hud.isVisible() && !hideTimers.has(hud.id) ? animatedHide(hud) : animatedShow(hud);
    }
    else if (live.state?.isActive || lcu.currentPhase === 'InProgress') ensure('hud');
  };
  const toggleScoreboard = () => {
    if (!lolPresent()) return;
    const sb = wins.get('scoreboard');
    if (sb && !sb.isDestroyed()) {
      sb.isVisible() && !hideTimers.has(sb.id) ? animatedHide(sb) : animatedShow(sb);
    } else {
      ensure('scoreboard');
    }
  };
  const openPlayers = () => {
    if (!lolPresent()) return;
    console.log('[hotkey] F8/players fired');
    togglePlayersPanel('hotkey');
  };

  // F7: panel de augments (ARAM) — tier + pick rate del campeón propio.
  const toggleAugments = () => {
    if (!lolPresent()) return;
    const aw = wins.get('augments');
    if (aw && !aw.isDestroyed()) {
      aw.isVisible() && !hideTimers.has(aw.id) ? animatedHide(aw) : animatedShow(aw);
    } else {
      ensure('augments');
    }
  };

  // Hotkeys clásicos (funcionan en escritorio y en el cliente de LoL)
  bind('F9', () => fire('hud', toggleHud));
  bind('F7', () => fire('augments', toggleAugments));
  bind('CommandOrControl+Shift+S', () => fire('scoreboard', toggleScoreboard));

  // F8/F10 son los globales (teclas dedicadas, sin colisiones). Ctrl+A y
  // variantes YA NO se registran globales — secuestraban "seleccionar todo"
  // en cualquier app; ahora viven SOLO en el hook de bajo nivel, que actúa
  // únicamente dentro de la partida.
  const PLAYER_ACCELS = ['F8', 'F10'];
  const bindPlayers = (why: string) => {
    for (const accel of PLAYER_ACCELS) {
      try { globalShortcut.unregister(accel); } catch { /* */ }
      bind(accel, () => fire('players', openPlayers));
    }
    console.log(`[hotkey] players re-bound (${why}): ${PLAYER_ACCELS.join(' · ')}`);
  };
  bindPlayers('boot');
  // Re-registrar tras 3s por si otro proceso los soltó al arrancar…
  setTimeout(() => bindPlayers('boot+3s'), 3000);
  live.on('game-started', () => setTimeout(() => bindPlayers('game-started'), 2000));
  lcu.on('phase', (phase: string) => {
    if (phase === 'InProgress' || phase === 'GameStart') {
      setTimeout(() => bindPlayers(`phase:${phase}`), 2500);
    }
  });

  // ── Hook de teclado de bajo nivel (uiohook) ────────────────────────────────
  // El juego (League of Legends.exe) se come los globalShortcut de Electron —
  // funcionaban en el cliente pero NO in-game. Este hook ve las teclas por
  // debajo del juego. Solo actúa DENTRO de partida: fuera, los globalShortcut
  // normales mandan y Ctrl+A sigue siendo "seleccionar todo" en otras apps.
  // (En "pantalla completa exclusiva" el overlay no puede dibujarse encima de
  // todos modos: recomendar modo "sin bordes" en el cliente.)
  // ── Auto-actualización (GitHub Releases del repo atak-companion) ───────────
  // Descarga en segundo plano y se instala al cerrar la app; sin repartir
  // .exe a mano. Solo en la app empacada (en dev no aplica). Los assets del
  // release necesitan: Setup.exe + .blockmap + latest.yml.
  if (app.isPackaged) {
    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('update-available', (info) => {
        console.log(`[updater] actualización disponible: v${info.version} — descargando…`);
        broadcast('update-status', { state: 'downloading', version: info.version });
      });
      autoUpdater.on('update-downloaded', (info) => {
        console.log(`[updater] v${info.version} descargada — se instala al cerrar la app`);
        broadcast('update-status', { state: 'ready', version: info.version });
      });
      autoUpdater.on('error', (e) => console.warn('[updater] error:', e?.message));
      void autoUpdater.checkForUpdatesAndNotify();
      // Re-chequear cada 4h (sesiones largas de la app en bandeja).
      setInterval(() => { void autoUpdater.checkForUpdatesAndNotify(); }, 4 * 3600_000);
    } catch (e: any) {
      console.warn('[updater] no arrancó:', e?.message);
    }
  }

  try {
    const inGame = () =>
      Boolean(live.state?.isActive)
      || lcu.currentPhase === 'InProgress'
      || lcu.currentPhase === 'GameStart';
    uIOhook.on('keydown', (e) => {
      if (!inGame()) return;
      const { keycode, ctrlKey, shiftKey, altKey } = e;
      if (keycode === UiohookKey.F8 || keycode === UiohookKey.F10) fire('players', openPlayers);
      else if (keycode === UiohookKey.A && (ctrlKey || altKey)) fire('players', openPlayers);
      else if (keycode === UiohookKey.F9) fire('hud', toggleHud);
      else if (keycode === UiohookKey.F7) fire('augments', toggleAugments);
      else if (keycode === UiohookKey.S && ctrlKey && shiftKey) fire('scoreboard', toggleScoreboard);
    });
    uIOhook.start();
    console.log('[hotkey-hook] uiohook activo — hotkeys garantizados dentro del juego');
  } catch (e: any) {
    console.error('[hotkey-hook] no arrancó (quedan solo los globalShortcut):', e?.message);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { uIOhook.stop(); } catch { /* ya detenido */ }
});
app.on('window-all-closed', () => app.quit());

// Evitar que se cierre la app al cerrar overlays (main puede estar oculta).
app.on('browser-window-created', (_e, win) => {
  win.setMenuBarVisibility(false);
});
