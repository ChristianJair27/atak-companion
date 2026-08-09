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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // lo inyecta vite-plugin-electron en dev
const BACKEND = process.env.ATAK_BACKEND || 'https://atakback.revolution505.com';
const FRONTEND = process.env.ATAK_FRONTEND || 'https://atakgg.revolution505.com';

const lcu = new LcuService();
const live = new LiveClientService();
const feed = new FeedPusher();

// ── Ventanas ─────────────────────────────────────────────────────────────────
type WinKind = 'main' | 'hud' | 'champselect' | 'scoreboard' | 'eog' | 'caster';
const wins = new Map<WinKind, BrowserWindow>();

function loadView(win: BrowserWindow, view: WinKind) {
  if (DEV_URL) void win.loadURL(`${DEV_URL}?view=${view}`);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { view } });
}

/** Flags de overlay que funcionan sobre LoL en borderless (know-how del repo viejo). */
function makeOverlayWindow(kind: WinKind, opts: { w: number; h: number; x?: number; y?: number; center?: boolean }) {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: opts.w,
    height: opts.h,
    x: opts.center ? undefined : (opts.x ?? width - opts.w - 20),
    y: opts.center ? undefined : (opts.y ?? 20),
    center: opts.center,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.once('ready-to-show', () => win.showInactive()); // no robar foco al juego
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
    case 'hud': return makeOverlayWindow('hud', { w: 360, h: 640 });
    case 'champselect': return makeOverlayWindow('champselect', { w: 380, h: 640, y: 120 });
    case 'scoreboard': return makeOverlayWindow('scoreboard', { w: 820, h: 460, center: true });
    case 'caster': return makeOverlayWindow('caster', { w: 1920, h: 1080, x: 0, y: 0 });
    case 'eog': {
      const win = new BrowserWindow({
        width: 960, height: 660, frame: false, transparent: true, show: false, center: true,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
      });
      win.once('ready-to-show', () => win.show());
      win.on('closed', () => wins.delete('eog'));
      loadView(win, 'eog');
      wins.set('eog', win);
      return win;
    }
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
      closeWin('champselect');
      if (!casterMode) ensure('hud');
      break;
    case 'WaitingForStats':
    case 'PreEndOfGame':
    case 'EndOfGame':
      closeWin('hud');
      closeWin('scoreboard');
      break;
    case 'None':
    case 'Lobby':
      closeWin('champselect');
      closeWin('hud');
      closeWin('scoreboard');
      break;
  }
}

// ── Wiring de servicios ──────────────────────────────────────────────────────
lcu.on('phase', handlePhase);
lcu.on('connected', () => broadcast('lcu-connected'));
lcu.on('disconnected', () => broadcast('lcu-disconnected'));
lcu.on('summoner', (s) => broadcast('summoner', s));
lcu.on('champ-select-update', (state) => broadcast('champ-select', {
  ...state, session: undefined, // el session completo es enorme; la UI pide lo que necesite
  team: (state.session?.myTeam || []).map((p: any) => ({ cellId: p.cellId, championId: p.championId || p.championPickIntent, position: p.assignedPosition })),
  bans: state.session?.bans || null,
}));
lcu.on('champ-select-ended', () => broadcast('champ-select-ended'));
lcu.on('local-champion-changed', async (championId: number, position: string) => {
  // Build/runas/counters del backend (misma superficie que usaba Overwolf)
  try {
    const { champById } = await getPatchData();
    const champ = champById[championId];
    if (!champ) return;
    broadcast('champion-build-loading', { championId, name: champ.name });
    const res = await fetch(`${BACKEND}/api/champ-select?champion=${encodeURIComponent(champ.id)}${position ? `&position=${encodeURIComponent(position)}` : ''}`);
    const data = (await res.json()) as Record<string, unknown>;
    broadcast('champion-build', { championId, name: champ.name, ...data });
  } catch (e: any) {
    broadcast('champion-build-error', { championId, error: e.message });
  }
});
lcu.on('eog-stats', (eog) => {
  ensure('eog');
  const w = wins.get('eog');
  w?.webContents.once('did-finish-load', () => w.webContents.send('eog-data', eog));
  // Por si ya estaba cargada:
  setTimeout(() => w?.webContents.send('eog-data', eog), 400);
});

live.on('game-started', () => broadcast('game-started'));
live.on('game-ended', () => {
  broadcast('game-ended');
  if (casterMode) void 0; // el caster sigue esperando la siguiente partida
});
live.on('state', (state) => {
  const objectives = computeObjectives(state);
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

// ── Ciclo de vida ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensure('main');
  lcu.start();
  live.start();

  // Hotkeys (los mismos del companion viejo)
  globalShortcut.register('F9', () => {
    const hud = wins.get('hud');
    if (hud && !hud.isDestroyed()) { hud.isVisible() ? hud.hide() : hud.showInactive(); }
  });
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    const sb = wins.get('scoreboard');
    if (sb && !sb.isDestroyed()) closeWin('scoreboard');
    else if (live.state?.isActive) ensure('scoreboard');
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
