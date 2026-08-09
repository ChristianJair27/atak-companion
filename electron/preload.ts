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
  // modo caster
  casterStart: (cfg: any) => ipcRenderer.invoke('caster-start', cfg),
  casterStop: () => ipcRenderer.invoke('caster-stop'),
  // ventana
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  win: (action: 'minimize' | 'close' | 'hide') => ipcRenderer.send('win', action),
});
