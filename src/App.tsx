// src/App.tsx — router por ventana (?view=main|hud|champselect|scoreboard|eog|caster)
// Diseño definitivo (design/ATAK-Screens.html): crimson #E1242E · plata/cromo ·
// negro #0A0A0C. Las vistas viven en src/views/* y consumen los datos reales de
// la capa Electron vía window.atak (declarado abajo).
import MainView from './views/MainView';
import HudView from './views/HudView';
import ChampSelectView from './views/ChampSelectView';
import ScoreboardView from './views/ScoreboardView';
import EogView from './views/EogView';
import CasterView from './views/CasterView';

declare global {
  interface Window {
    atak: {
      status: () => Promise<any>;
      patchData: () => Promise<any>;
      onPhase: (fn: (p: string) => void) => () => void;
      onLive: (fn: (p: any) => void) => () => void;
      onGameStarted: (fn: () => void) => () => void;
      onGameEnded: (fn: () => void) => () => void;
      onChampSelect: (fn: (p: any) => void) => () => void;
      onChampSelectEnded: (fn: () => void) => () => void;
      onChampionBuild: (fn: (p: any) => void) => () => void;
      onChampionBuildLoading: (fn: (p: any) => void) => () => void;
      onChampionBuildError: (fn: (p: any) => void) => () => void;
      onEogData: (fn: (p: any) => void) => () => void;
      onSummoner: (fn: (p: any) => void) => () => void;
      onLcuConnected: (fn: () => void) => () => void;
      onLcuDisconnected: (fn: () => void) => () => void;
      casterStart: (cfg: any) => Promise<any>;
      casterStop: () => Promise<any>;
      openExternal: (url: string) => void;
      win: (a: 'minimize' | 'close' | 'hide') => void;
    };
  }
}

const view = new URLSearchParams(location.search).get('view') || 'main';

export default function App() {
  switch (view) {
    case 'hud': return <HudView />;
    case 'champselect': return <ChampSelectView />;
    case 'scoreboard': return <ScoreboardView />;
    case 'eog': return <EogView />;
    case 'caster': return <CasterView />;
    default: return <MainView />;
  }
}
