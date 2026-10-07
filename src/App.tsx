// src/App.tsx — router por ventana (?view=main|hud|champselect|scoreboard|players|eog|caster)
// Diseño "Arena" (el del sitio ATAK.GG; tokens --ax-* en styles.css): crimson ·
// Barlow Condensed · paneles opacos. Las vistas viven en src/views/* y consumen los datos reales de
// la capa Electron vía window.atak (declarado abajo).
import { useEffect, useState, type ReactNode } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import MainView from './views/MainView';
import HudView from './views/HudView';
import ChampSelectView from './views/ChampSelectView';
import ScoreboardView from './views/ScoreboardView';
import PlayersView from './views/PlayersView';
import EogView from './views/EogView';
import CasterView from './views/CasterView';
import AugmentsView from './views/AugmentsView';
import AugBadgesView from './views/AugBadgesView';

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error' | 'dev';
  version?: string; percent?: number; error?: string; checkedAt?: number; current?: string;
};

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
      opggRoster: () => Promise<any>;
      aramAugments: () => Promise<any>;
      opggBuild: (championName: string, position: string) => Promise<any>;
      draftAnalyze: (req: import('./views/DraftAiPanel').DraftAiRequest) => Promise<import('./views/DraftAiPanel').DraftAnalysis | null>;
      draftAiNames: () => Promise<{ items: Record<number, string>; runes: Record<number, string> }>;
      champMeta: (championName: string, position: string) => Promise<{
        winRate: number | null; pickRate: number | null; banRate: number | null; tier: number | null; rank: number | null;
      } | null>;
      championPreview: (
        championName: string,
        position: string,
        rival?: string,
      ) => Promise<{ ok: boolean; championId?: number }>;
      matchupData: (championName: string, opponentName: string, position: string) => Promise<any>;
      champSelectHover: (championName: string) => Promise<{ ok: boolean; error?: string }>;
      champSelectLock: (championName?: string) => Promise<{ ok: boolean; error?: string }>;
      applyRunes: (page: {
        name: string;
        primaryStyleId: number;
        subStyleId: number;
        selectedPerkIds: number[];
      }) => Promise<{ ok: boolean; error?: string }>;
      opggPickSuggestions: (payload: {
        position: string;
        missingRoles: string[];
        bannedNames: string[];
        pickedNames: string[];
        limit?: number;
        enemyNames?: string[];
        rivalName?: string;
        deep?: boolean;
      }) => Promise<Array<{
        name: string;
        winRate: number | null;
        pickRate: number | null;
        tier: number | null;
        reason: string;
        score: number;
        matchupWinRate: number | null;
        vsRival: string;
        goodInto: string[];
        badInto: string[];
        covers: string[];
      }>>;
      togglePlayers: () => Promise<{ ok: boolean; open: boolean }>;
      toggleOverlay: (kind: 'hud' | 'scoreboard' | 'players' | 'champselect') => Promise<{ ok: boolean }>;
      updateState: () => Promise<UpdateStatus>;
      updateCheck: () => Promise<UpdateStatus>;
      updateInstall: () => Promise<{ ok: boolean }>;
      onUpdateStatus: (fn: (s: UpdateStatus) => void) => () => void;
      showOverlay: (kind: 'hud' | 'champselect') => Promise<{ ok: boolean }>;
      openExternal: (url: string) => void;
      win: (a: 'minimize' | 'close' | 'hide') => void;
      openProfile: (riotId: string, platform?: string) => void;
      openAtak: (pagePath: string) => void;
      onOverlayAnim: (fn: (dir: 'in' | 'out') => void) => () => void;
      onAugOffers: (fn: (offers: any) => void) => () => void;
    };
  }
}

const view = new URLSearchParams(location.search).get('view') || 'main';

// ── Shell animado para overlays ──────────────────────────────────────────────
// El main manda 'overlay-anim' in/out sincronizado con show/hide de la ventana:
// entrada con spring (scale+fade+lift) y salida rápida estilo "genie" de Apple.
// La ventana solo se oculta cuando la salida terminó (200ms en el main).
function OverlayShell({ children, origin = 'center' }: { children: ReactNode; origin?: 'center' | 'top-right' }) {
  const [dir, setDir] = useState<'in' | 'out'>('in');
  useEffect(() => window.atak.onOverlayAnim((d) => setDir(d)), []);
  return (
    <motion.div
      style={{ height: '100vh', transformOrigin: origin === 'top-right' ? '90% 0%' : '50% 40%' }}
      initial={{ opacity: 0, scale: 0.94, y: 14 }}
      animate={
        dir === 'in'
          ? { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } }
          : { opacity: 0, scale: 0.93, y: 10, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }
      }
    >
      {children}
    </motion.div>
  );
}

// reducedMotion="user": con prefers-reduced-motion framer anula transform/layout
// y deja solo opacity en TODAS las vistas.
export default function App() {
  return <MotionConfig reducedMotion="user"><Views /></MotionConfig>;
}

function Views() {
  // Guard anti-pantalla-negra: si el preload no cargó (window.atak ausente),
  // mostrar el error en vez de tronar en silencio.
  if (!window.atak) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', color: '#ff6b73', background: '#0a0a0c', minHeight: '100vh' }}>
        <b>ATAK Companion — error de arranque</b>
        <p>El puente IPC (preload) no cargó: window.atak no existe.</p>
        <p>Revisa que dist-electron/preload.cjs exista y reinicia con npm run dev.</p>
      </div>
    );
  }
  switch (view) {
    // Overlays con show/hide animado (players/hud/scoreboard se togglean con hotkey)
    case 'hud': return <OverlayShell origin="top-right"><HudView /></OverlayShell>;
    case 'champselect': return <OverlayShell><ChampSelectView /></OverlayShell>;
    case 'scoreboard': return <OverlayShell><ScoreboardView /></OverlayShell>;
    case 'players': return <OverlayShell><PlayersView /></OverlayShell>;
    case 'augments': return <OverlayShell><AugmentsView /></OverlayShell>;
    // Badges sobre las cards: ventana transparente click-through — sin shell.
    case 'augbadges': return <AugBadgesView />;
    case 'eog': return <OverlayShell><EogView /></OverlayShell>;
    case 'caster': return <CasterView />;
    default: return <MainView />;
  }
}
