// electron/preload.ts — puente IPC tipado (contextIsolation ON en TODAS las
// ventanas; se acabó el window.require('electron') del companion viejo).
import { contextBridge, ipcRenderer } from 'electron';

const on = (channel: string) => (fn: (payload: any) => void) => {
  const listener = (_e: unknown, payload: any) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('atak', {
  // estado / datos
  status: () => ipcRenderer.invoke('status'),
  patchData: () => ipcRenderer.invoke('patch-data'),
  onPhase: on('phase'),
  onLive: on('live'),
  onGameStarted: on('game-started'),
  onGameEnded: on('game-ended'),
  onChampSelect: on('champ-select'),
  onChampSelectEnded: on('champ-select-ended'),
  onChampionBuild: on('champion-build'),
  onChampionBuildLoading: on('champion-build-loading'),
  onChampionBuildError: on('champion-build-error'),
  onEogData: on('eog-data'),
  onSummoner: on('summoner'),
  onLcuConnected: on('lcu-connected'),
  onLcuDisconnected: on('lcu-disconnected'),
  // actualizaciones (botón de Ajustes)
  updateState: () => ipcRenderer.invoke('update-state'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateStatus: on('update-status'),
  // modo caster
  casterStart: (cfg: any) => ipcRenderer.invoke('caster-start', cfg),
  casterStop: () => ipcRenderer.invoke('caster-stop'),
  // OP.GG MCP (elo / WR / build / runas / sugerencias)
  opggRoster: () => ipcRenderer.invoke('opgg-roster'),
  aramAugments: () => ipcRenderer.invoke('aram-augments'),
  draftAnalyze: (req: any) => ipcRenderer.invoke('draft-analyze', req),
  draftAiNames: () => ipcRenderer.invoke('draft-ai-names'),
  champMeta: (championName: string, position: string) =>
    ipcRenderer.invoke('champ-meta', championName, position),
  opggBuild: (championName: string, position: string) =>
    ipcRenderer.invoke('opgg-build', championName, position),
  championPreview: (championName: string, position: string, rival?: string) =>
    ipcRenderer.invoke('champion-preview', championName, position, rival),
  opggPickSuggestions: (payload: {
    position: string;
    missingRoles: string[];
    bannedNames: string[];
    pickedNames: string[];
    limit?: number;
    enemyNames?: string[];
    rivalName?: string;
    deep?: boolean;
  }) => ipcRenderer.invoke('opgg-pick-suggestions', payload),
  matchupData: (championName: string, opponentName: string, position: string) =>
    ipcRenderer.invoke('matchup-data', championName, opponentName, position),
  // Acciones sobre el cliente de League (siempre disparadas por el usuario)
  champSelectHover: (championName: string) => ipcRenderer.invoke('champ-select-hover', championName),
  champSelectLock: (championName?: string) => ipcRenderer.invoke('champ-select-lock', championName),
  applyRunes: (page: {
    name: string;
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
  }) => ipcRenderer.invoke('apply-runes', page),
  togglePlayers: () => ipcRenderer.invoke('toggle-players'),
  toggleOverlay: (kind: 'hud' | 'scoreboard' | 'players' | 'champselect') =>
    ipcRenderer.invoke('toggle-overlay', kind),
  showOverlay: (kind: 'hud' | 'champselect') => ipcRenderer.invoke('show-overlay', kind),
  // ventana
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  win: (action: 'minimize' | 'close' | 'hide') => ipcRenderer.send('win', action),
  // Frontend ATAK embebido (perfil de jugador / campeón / cualquier ruta)
  openProfile: (riotId: string, platform?: string) =>
    ipcRenderer.send('open-atak-profile', riotId, platform),
  openAtak: (pagePath: string) => ipcRenderer.send('open-atak', pagePath),
  // Animación de overlays (show/hide coreografiado desde el main)
  onOverlayAnim: on('overlay-anim'),
  onAugOffers: on('aug-offers'),
});
