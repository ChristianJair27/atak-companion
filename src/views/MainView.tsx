// src/views/MainView.tsx — Ventana principal con pestañas internas:
// INICIO (estado) · DRAFT (herramienta de drafteo) · ATAK.GG (frontend embebido
// en <webview>) · CASTER (transmisión LQC simplificada) · AJUSTES.
// El riel navega entre pantallas SIN abrir ventanas nuevas.
// Piel: "hextech / cliente de League" (hextech.css + hextech.tsx) con la misma
// información y el mismo cableado de datos/IPC que antes.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import logo from '../assets/atak-logo.png';
import { fmtClock, phaseEs, useLive, useStatus } from './shared';
import DraftView from './DraftView';
import { EASE, Rise, Stagger, Ticker, rise, staggerParent, swap } from '../motion';
import { HxHex, HxPanel, HxSegmented } from './hextech';
import './home-motion.css';

// ── Movimiento (constantes a nivel de módulo: no cambian entre renders, así el
// sondeo de estado cada 2 s nunca re-dispara una entrada) ────────────────────
/** Panel de pestaña: entra repartiendo a sus hijos (50ms) y sale como `swap`. */
const PANEL: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
  exit: swap.exit,
};
/** Card que sube y además reparte la entrada de sus secciones internas. */
const CARD_STAGGER: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, staggerChildren: 0.06, delayChildren: 0.08 } },
};
/** Card que sube 14px (cinemático, un poco más lento que `rise`). */
const CARD: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
/** Card que entra deslizando desde un lado (como `slideCard` del champ select). */
const slideCard = (fromX: number): Variants => ({
  hidden: { opacity: 0, x: fromX },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
});
const HERO = slideCard(-28);
/** Rótulo de sección: tracking abierto + blur que se limpia (preset `title` del champ select). */
const TITLE = {
  initial: { opacity: 0, letterSpacing: '0.42em', filter: 'blur(8px)' },
  animate: { opacity: 1, letterSpacing: '0.12em', filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE } },
  exit: { opacity: 0, letterSpacing: '0.2em', filter: 'blur(4px)', transition: { duration: 0.18, ease: EASE } },
};
const GRID_STAGGER = staggerParent(0.05, 0.1);
const TITLE_IN = { duration: 0.3, ease: EASE };
const IND_SLIDE = { type: 'tween' as const, duration: 0.25, ease: EASE };

/** Cruza (fade + 4px) el contenido cuando cambia `id`; no anima en el primer render. */
function Crossfade({ id, children, style, block }: { id: string; children: ReactNode; style?: CSSProperties; block?: boolean }) {
  const Tag = block ? motion.div : motion.span;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Tag
        key={id}
        style={{ display: block ? 'block' : 'inline-block', ...style }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE } }}
        exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
      >
        {children}
      </Tag>
    </AnimatePresence>
  );
}

/** Rótulo de paso del formulario de caster: numeral carmesí + label dorado. */
function StepLabel({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span className="hm-step">{n}</span>
      <span className="hx-label gold" style={{ fontSize: 10.5 }}>{children}</span>
      <span className="hx-hr" style={{ flex: 1, display: 'block' }} />
    </div>
  );
}

// <webview> de Electron: React ya lo tipa; solo la main window lo habilita
// (webviewTag: true en main.ts).
const CASTER_KEY = 'atak.caster.cfg';

interface CasterCfg {
  channel: string;
  token: string;
  matchLabel: string;
  team1: string;
  team2: string;
  streamUrl: string;
  logo1: string;
  logo2: string;
  accent: string;
}

const defaultCfg: CasterCfg = {
  channel: 'lqc-2026', token: '', matchLabel: '', team1: '', team2: '',
  streamUrl: '', logo1: '', logo2: '', accent: '',
};

const loadCfg = (): CasterCfg => {
  try {
    const raw = localStorage.getItem(CASTER_KEY);
    if (raw) return { ...defaultCfg, ...JSON.parse(raw) };
  } catch { /* config corrupta → defaults */ }
  return defaultCfg;
};

type Tab = 'inicio' | 'draft' | 'atak' | 'caster' | 'ajustes';

const TAB_TITLE: Record<Exclude<Tab, 'atak'>, string> = {
  inicio: 'Inicio', draft: 'Herramienta de draft', caster: 'Modo caster', ajustes: 'Ajustes',
};
const TAB_NUM: Record<Exclude<Tab, 'atak'>, string> = { inicio: '01', draft: '02', caster: '04', ajustes: '05' };

// ── Iconos del riel ──────────────────────────────────────────────────────────
const RAIL: Array<{ tab: Tab; title: string; icon: React.ReactNode }> = [
  {
    tab: 'inicio', title: 'Inicio',
    icon: <svg width="17" height="17" viewBox="0 0 16 16"><path d="M2 8 L8 2 L14 8 M4 7 V14 H12 V7" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>,
  },
  {
    tab: 'draft', title: 'Herramienta de draft',
    icon: <svg width="17" height="17" viewBox="0 0 16 16"><path d="M2 3 H7 V8 H2 Z M9 3 H14 V8 H9 Z M2 10 H7 V15 H2 Z M9 10 H14 V15 H9 Z" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>,
  },
  {
    tab: 'atak', title: 'ATAK.GG (perfiles, torneos, stats)',
    icon: <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M2 8 H14 M8 2 C5.5 4.5 5.5 11.5 8 14 C10.5 11.5 10.5 4.5 8 2 Z" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>,
  },
  {
    tab: 'caster', title: 'Modo caster (transmisión)',
    icon: <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2" fill="currentColor" /><path d="M4.5 4.5 A5 5 0 0 0 4.5 11.5 M11.5 4.5 A5 5 0 0 1 11.5 11.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>,
  },
];

const OVERLAYS = [
  ['players', 'Panel de jugadores', 'F8 · Ctrl+A'],
  ['hud', 'HUD in-game', 'F9'],
  ['scoreboard', 'Scoreboard 5v5', 'Ctrl+Shift+S'],
  ['champselect', 'Champ select', 'auto en selección'],
] as const;

export default function MainView() {
  const status = useStatus(2000); // refresco cada 2 s (feed.pushed / lastStatus)
  const live = useLive();
  const [tab, setTab] = useState<Tab>('inicio');
  const [caster, setCaster] = useState<CasterCfg>(loadCfg);
  const [showOverlay, setShowOverlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    try { localStorage.setItem(CASTER_KEY, JSON.stringify(caster)); } catch { /* sin persistencia */ }
  }, [caster]);

  const frontend = String(status?.frontend || 'https://atakgg.revolution505.com').replace(/\/$/, '');
  const feed = status?.feed;
  const transmitting = Boolean(feed?.active || status?.casterMode);
  const last = feed?.lastStatus;
  const lastTxt = !last ? '—' : last.code === 200 ? 'OK 200' : last.error ? 'ERROR' : last.code != null ? `HTTP ${last.code}` : '—';
  const lastTone = !last ? '' : last.code === 200 ? ' ok' : ' miss';
  const lastAgo = last?.at ? `hace ${Math.max(0, Math.round((Date.now() - last.at) / 1000))} s` : '—';
  const gameTime = live?.state?.gameTime;

  const myRiotId = status?.summoner?.gameName
    ? `${status.summoner.gameName}#${status.summoner.tagLine || ''}`
    : '';
  const profilePath = myRiotId.includes('#')
    ? `/stats/${String(status?.region || 'la1').toLowerCase()}/${encodeURIComponent(myRiotId)}`
    : '/stats';

  const toggleCaster = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (transmitting) await window.atak.casterStop();
      else await window.atak.casterStart({ ...caster, backend: status?.backend, showOverlay });
    } finally {
      setBusy(false);
    }
  };

  const copy = (what: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  };

  const overlayUrl = `${frontend}/broadcast/${caster.channel || 'lqc-2026'}/overlay`;
  const boardUrl = `${frontend}/broadcast/${caster.channel || 'lqc-2026'}`;

  const set = (k: keyof CasterCfg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCaster((c) => ({ ...c, [k]: e.target.value }));

  const inputCls = (mono = false) => `hm-input${mono ? ' mono' : ''}`;

  // ── Webview (pestaña ATAK.GG) ──────────────────────────────────────────────
  const webRef = useRef<any>(null);
  const [atakUrl, setAtakUrl] = useState(frontend);
  const goAtak = (path: string) => {
    const url = `${frontend}${path}`;
    setAtakUrl(url);
    try { webRef.current?.loadURL?.(url); } catch { /* aún no montado */ }
  };

  // ── Solo presentación: el webview aparece cuando el panel saliente terminó su
  // salida (150ms); así nunca comparten fila. Al salir de ATAK se oculta al instante.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const [atakReady, setAtakReady] = useState(false);
  useEffect(() => { if (tab !== 'atak') setAtakReady(false); }, [tab]);
  const atakOn = tab === 'atak' && atakReady;

  const connKey = status?.lcuConnected ? 'on' : 'off';
  const phaseKey = status?.inGame ? 'ingame' : String(status?.phase || 'None');
  const phaseTxt = status?.inGame ? 'En partida' : phaseEs(status?.phase || 'None');
  const initial = (status?.summoner?.gameName || '?').charAt(0).toUpperCase();

  const railBtn = (r: { tab: Tab; title: string; icon: React.ReactNode }) => (
    <button
      type="button"
      className={`hm-rail-btn no-drag${tab === r.tab ? ' active' : ''}`}
      title={r.title}
      onClick={() => setTab(r.tab)}
    >
      {tab === r.tab && <motion.span layoutId="hm-rail-ind" className="hm-rail-ind" initial={false} transition={IND_SLIDE} />}
      {r.icon}
      {r.tab === 'caster' && transmitting && <span className="hm-rail-dot live" />}
      {r.tab === 'inicio' && status?.inGame && <span className="hm-rail-dot" />}
    </button>
  );

  return (
    <div className="hx hx-stage hm" style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: 'inset 0 0 0 1px var(--hx-gold-faint)' }}>
      {/* Viñeta estática sobre el escenario (debajo del contenido, como en champ select) */}
      <div className="hx-vignette" style={{ zIndex: 0 }} />

      {/* Barra de título — el contenedor arrastrable queda quieto; solo entra su contenido */}
      <header className="hx-topbar drag" style={{ position: 'relative', zIndex: 2, height: 44, flex: 'none', gap: 12 }}>
        <motion.div
          style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 10 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={TITLE_IN}
        >
          <img src={logo} alt="" style={{ height: 24 }} draggable={false} />
          <span className="hx-wordmark hx-chrome" style={{ fontSize: 14 }}>ATAK.GG</span>
          <span className="hx-label" style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'none', fontWeight: 500 }}>
            v0.1.0 · F9 HUD · F8/Ctrl+A players · Ctrl+Shift+S score
          </span>
        </motion.div>
        <motion.div
          className="no-drag"
          style={{ marginLeft: 'auto', display: 'flex', height: '100%', alignItems: 'center', gap: 6 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...TITLE_IN, delay: 0.04 }}
        >
          <button
            type="button"
            className="hx-btn primary sm"
            title="Abrir panel de jugadores (F8 / Ctrl+A)"
            onClick={() => { void window.atak.togglePlayers(); }}
          >
            Jugadores · F8
          </button>
          <span style={{ width: 1, height: 18, background: 'var(--hx-gold-faint)', margin: '0 4px' }} />
          <button type="button" className="hx-icon-btn" onClick={() => window.atak.win('minimize')} aria-label="Minimizar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5 H9" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button type="button" className="hx-icon-btn close" onClick={() => window.atak.win('close')} aria-label="Cerrar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </motion.div>
      </header>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Riel de navegación — pestañas internas, misma ventana */}
        <Stagger className="hm-rail" delay={0.04}>
          {RAIL.map((r) => (
            <Rise key={r.tab}>{railBtn(r)}</Rise>
          ))}
          <Rise style={{ marginTop: 'auto' }}>
            {railBtn({
              tab: 'ajustes', title: 'Ajustes y overlays',
              icon: <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.5 V4 M8 12 V14.5 M14.5 8 H12 M4 8 H1.5 M12.6 3.4 L10.8 5.2 M5.2 10.8 L3.4 12.6 M12.6 12.6 L10.8 10.8 M5.2 5.2 L3.4 3.4" stroke="currentColor" strokeWidth="1.3" /></svg>,
            })}
          </Rise>
        </Stagger>

        {/* ── Contenido por pestaña ── */}

        {/* ATAK.GG: el frontend real embebido — siempre montado para no recargar.
            Solo se funde la opacidad del contenedor; nunca transform sobre el webview. */}
        <motion.div
          style={{ flex: 1, minWidth: 0, display: atakOn ? 'flex' : 'none', flexDirection: 'column' }}
          initial={false}
          animate={{ opacity: atakOn ? 1 : 0 }}
          transition={atakOn ? { duration: 0.25, ease: EASE } : { duration: 0 }}
        >
          <div className="no-drag" style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderBottom: '1px solid var(--hx-gold-faint)', background: 'rgb(7 10 18 / 0.75)' }}>
            <button type="button" className="hx-btn ghost sm" aria-label="Atrás" onClick={() => { try { webRef.current?.goBack?.(); } catch { /* */ } }}>←</button>
            <button type="button" className="hx-btn ghost sm" onClick={() => goAtak('/')}>Inicio</button>
            <button type="button" className="hx-btn ghost sm" onClick={() => goAtak(profilePath)}>
              {myRiotId ? 'Mi perfil' : 'Stats'}
            </button>
            <button type="button" className="hx-btn ghost sm" onClick={() => goAtak('/tournaments')}>Torneos</button>
            <span className="hx-label" style={{ marginLeft: 'auto', fontSize: 9.5, textTransform: 'none', fontWeight: 500, color: 'var(--hx-faint)' }}>atakgg · siempre la última versión desplegada</span>
          </div>
          <webview ref={webRef} src={atakUrl} style={{ flex: 1, minHeight: 0 }} />
        </motion.div>

        <AnimatePresence mode="wait" onExitComplete={() => { if (tabRef.current === 'atak') setAtakReady(true); }}>
        {tab !== 'atak' && (
          <motion.div
            key={tab}
            variants={PANEL}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ flex: 1, padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', minWidth: 0 }}
          >
            {/* Cabecera de la pestaña: rótulo cromado con entrada `title` + hairline dorado */}
            <motion.div variants={rise} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none', minHeight: 30 }}>
              <span style={{ width: 8, height: 8, flex: 'none', transform: 'rotate(45deg)', background: 'var(--hx-cyan)', boxShadow: '0 0 8px var(--hx-cyan)' }} />
              <motion.span
                {...TITLE}
                className="hx-chrome"
                style={{ fontWeight: 700, fontSize: 22, textTransform: 'uppercase', lineHeight: 1, textShadow: '0 4px 20px rgba(0,0,0,.8)', whiteSpace: 'nowrap' }}
              >
                {TAB_TITLE[tab]}
              </motion.span>
              <span className="hx-label gold" style={{ fontSize: 9.5, marginTop: 2 }}>{TAB_NUM[tab]} · Companion</span>
              <span className="hx-hr" style={{ flex: 1, display: 'block', background: 'linear-gradient(90deg, var(--hx-gold-dim), transparent)' }} />
            </motion.div>

            {/* ── INICIO ── */}
            {tab === 'inicio' && (
              <>
                {/* Hero: invocador + estado + accesos rápidos */}
                <motion.div variants={HERO} style={{ flex: 'none' }}>
                  <HxPanel corners strong cut={14} className="hm-card" inner={{ padding: '18px 22px', background: 'linear-gradient(135deg, rgb(10 200 185 / 0.06), rgb(16 21 34 / 0.9) 40%, rgb(16 21 34 / 0.9) 70%, rgb(200 170 110 / 0.06))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <HxHex size={64} tone={status?.summoner ? 'cyan' : 'dim'} letter={initial} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* La ficha se cruza al llegar el invocador (y si se desvincula) */}
                        <Crossfade block id={status?.summoner ? `summoner:${initial}` : 'none'}>
                          {status?.summoner ? (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                              <span
                                className="hx-chrome hm-link"
                                title="Ver mi perfil en ATAK.GG"
                                onClick={() => { setTab('atak'); goAtak(profilePath); }}
                                style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {status.summoner.gameName}
                              </span>
                              {status.summoner.tagLine && <span className="hx-goldtext" style={{ fontSize: 13, fontWeight: 700 }}>#{status.summoner.tagLine}</span>}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                              <span className="hx-chrome" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.1 }}>Sin invocador</span>
                              <span className="hx-muted" style={{ fontSize: 12 }}>abre el cliente de League para vincular tu cuenta.</span>
                            </div>
                          )}
                        </Crossfade>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {status?.region && <span className="hx-pill gold">{status.region}</span>}
                          <Crossfade id={connKey}>
                            <span className={`hx-pill${status?.lcuConnected ? ' ok' : ' miss'}`}>
                              <span className={`hm-diamond ${status?.lcuConnected ? 'on' : 'off'}`} style={{ width: 6, height: 6 }} />
                              {status?.lcuConnected ? 'LCU conectado' : 'LCU desconectado'}
                            </span>
                          </Crossfade>
                          <Crossfade id={phaseKey}>
                            <span className="hx-pill" style={status?.inGame ? { color: '#bff5ef', borderColor: 'rgb(10 200 185 / 0.5)', background: 'rgb(10 200 185 / 0.1)' } : undefined}>
                              {phaseTxt}
                            </span>
                          </Crossfade>
                          {status?.summoner && <span className="hx-muted" style={{ fontSize: 11 }}>Cuenta vinculada al companion</span>}
                        </div>
                      </div>

                      {/* Accesos rápidos */}
                      <span style={{ width: 1, alignSelf: 'stretch', background: 'linear-gradient(180deg, transparent, var(--hx-gold-dim), transparent)' }} />
                      <motion.div variants={GRID_STAGGER} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 'none' }}>
                        {([
                          ['Herramienta de draft', 'primary', () => setTab('draft')],
                          ['Mi perfil ATAK.GG', '', () => { setTab('atak'); goAtak(profilePath); }],
                          ['Torneos', 'ghost', () => { setTab('atak'); goAtak('/tournaments'); }],
                          ['Modo caster', 'ghost', () => setTab('caster')],
                        ] as const).map(([label, kind, fn]) => (
                          <motion.div key={label} variants={rise} style={{ display: 'grid' }}>
                            <button type="button" className={`hx-btn ${kind}`} style={{ minHeight: 36, fontSize: 11, padding: '0 16px', whiteSpace: 'nowrap' }} onClick={fn}>{label}</button>
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>
                  </HxPanel>
                </motion.div>

                <div style={{ display: 'flex', gap: 14, flex: 'none' }}>
                  {/* Estado de conexión */}
                  <motion.div variants={CARD} style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                    <HxPanel corners className="hm-card" style={{ flex: 1 }} inner={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="hx-label gold">Estado de conexión</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`hm-diamond ${status?.lcuConnected ? 'on' : 'off'}`} />
                        <Crossfade id={connKey} style={{ fontSize: 14 }}>
                          {status?.lcuConnected ? 'Cliente de League detectado' : 'Esperando al cliente de League…'}
                        </Crossfade>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`hm-diamond${status?.inGame ? ' on' : ''}`} />
                        {/* key = fase (no el reloj): el tick del reloj no re-dispara el cruce */}
                        <Crossfade id={phaseKey} style={{ fontSize: 14 }}>
                          {status?.inGame ? (
                            <>En partida{gameTime != null && <> · <span className="hx-mono" style={{ fontSize: 12.5, color: 'var(--hx-cyan)' }}>{fmtClock(gameTime)}</span></>}</>
                          ) : (
                            phaseEs(status?.phase || 'None')
                          )}
                        </Crossfade>
                      </div>
                      <AnimatePresence initial={false}>
                        {(status?.inGame || status?.phase === 'InProgress') && (
                          <motion.div
                            key="open-players"
                            style={{ alignSelf: 'flex-start', marginTop: 4 }}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } }}
                            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
                          >
                            <button
                              type="button"
                              className="hx-btn primary"
                              onClick={() => { void window.atak.togglePlayers(); }}
                            >
                              Abrir jugadores (F8)
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </HxPanel>
                  </motion.div>

                  {/* Overlays y atajos (mismo toggle que en Ajustes) */}
                  <motion.div variants={CARD} style={{ flex: 1.15, minWidth: 0, display: 'flex' }}>
                    <HxPanel corners className="hm-card" style={{ flex: 1 }} inner={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="hx-label gold">Overlays y atajos</div>
                      <motion.div variants={GRID_STAGGER} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {OVERLAYS.map(([kind, label, keys]) => (
                          <motion.div key={kind} variants={rise} style={{ display: 'grid' }}>
                            <button
                              type="button"
                              className="hx-btn ghost row"
                              style={{ minHeight: 34, fontSize: 11, padding: '0 12px' }}
                              onClick={() => { void window.atak.toggleOverlay(kind); }}
                            >
                              <span>{label}</span>
                              <span className="hx-mono" style={{ fontSize: 9.5, letterSpacing: 0, textTransform: 'none', color: 'var(--hx-gold)' }}>{keys}</span>
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    </HxPanel>
                  </motion.div>
                </div>
              </>
            )}

            {/* ── DRAFT ── */}
            {tab === 'draft' && <DraftView />}

            {/* ── CASTER (simplificado) ── */}
            {tab === 'caster' && (
              <motion.div variants={CARD_STAGGER} style={{ flex: 'none' }}>
                <HxPanel corners strong cut={16} inner={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16, background: 'linear-gradient(135deg, rgb(225 36 46 / 0.09), rgb(16 21 34 / 0.9) 45%)' }}>
                  {/* Paso 1: canal + token */}
                  <Rise>
                    <StepLabel n="01">Canal y token</StepLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
                      <div className="hm-field">
                        <span className="hx-label">Canal</span>
                        <input className={inputCls()} placeholder="lqc-2026" value={caster.channel} disabled={transmitting} onChange={set('channel')} />
                      </div>
                      <div className="hm-field">
                        <span className="hx-label">Token (te lo pasa el organizador — se guarda)</span>
                        <input className={inputCls(true)} type="password" placeholder="LIVE_FEED_TOKEN" value={caster.token} disabled={transmitting} onChange={set('token')} />
                      </div>
                      <button
                        type="button"
                        className="hx-btn ghost"
                        style={{ minHeight: 34, fontSize: 11 }}
                        disabled={transmitting}
                        onClick={() => setCaster((c) => ({ ...c, channel: 'lqc-2026' }))}
                        title="Rellena el canal oficial de la LQC"
                      >
                        Preset LQC
                      </button>
                    </div>
                  </Rise>

                  {/* Paso 2: partida (opcional) */}
                  <Rise>
                    <StepLabel n="02">Partida (opcional)</StepLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
                      <div className="hm-field"><span className="hx-label">Etiqueta</span>
                        <input className={inputCls()} placeholder="Final · Juego 3 de 5" value={caster.matchLabel} disabled={transmitting} onChange={set('matchLabel')} /></div>
                      <div className="hm-field"><span className="hx-label blue">Equipo azul</span>
                        <input className={inputCls()} placeholder="Nombre" value={caster.team1} disabled={transmitting} onChange={set('team1')} /></div>
                      <div className="hm-field"><span className="hx-label red">Equipo rojo</span>
                        <input className={inputCls()} placeholder="Nombre" value={caster.team2} disabled={transmitting} onChange={set('team2')} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                      <div className="hm-field"><span className="hx-label">Logo azul (URL PNG)</span>
                        <input className={inputCls()} placeholder="https://…/logo1.png" value={caster.logo1} disabled={transmitting} onChange={set('logo1')} /></div>
                      <div className="hm-field"><span className="hx-label">Logo rojo (URL PNG)</span>
                        <input className={inputCls()} placeholder="https://…/logo2.png" value={caster.logo2} disabled={transmitting} onChange={set('logo2')} /></div>
                      <div className="hm-field"><span className="hx-label">Color de acento</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="color"
                            className="hm-color"
                            value={caster.accent || '#0066ff'}
                            disabled={transmitting}
                            onChange={(e) => setCaster((c) => ({ ...c, accent: e.target.value }))}
                          />
                          <input className={inputCls(true)} placeholder="#0066ff (vacío = LQC)" value={caster.accent} disabled={transmitting} onChange={set('accent')} />
                        </div>
                      </div>
                    </div>
                  </Rise>

                  {/* Paso 3: transmitir + links */}
                  <Rise>
                    <StepLabel n="03">Transmitir y poner en OBS</StepLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="hx-btn primary big" onClick={() => void toggleCaster()} disabled={busy}>
                        <span className="hm-live" style={{ animationPlayState: transmitting ? 'running' : 'paused' }} />
                        <Crossfade id={transmitting ? 'stop' : 'start'}>{transmitting ? 'Detener transmisión' : 'Iniciar transmisión'}</Crossfade>
                      </button>
                      <button type="button" className="hx-btn" style={{ fontSize: 11 }} onClick={() => copy('overlay', overlayUrl)} title={overlayUrl}>
                        <Crossfade id={copied === 'overlay' ? 'ok' : 'idle'}>{copied === 'overlay' ? '✓ Copiado' : 'Copiar link overlay (OBS)'}</Crossfade>
                      </button>
                      <button type="button" className="hx-btn" style={{ fontSize: 11 }} onClick={() => copy('board', boardUrl)} title={boardUrl}>
                        <Crossfade id={copied === 'board' ? 'ok' : 'idle'}>{copied === 'board' ? '✓ Copiado' : 'Copiar link tablero'}</Crossfade>
                      </button>
                      <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }} title="Muestra la barra de transmisión (1920×112) en esta PC">
                        <span className="hx-label">Barra en esta PC</span>
                        <HxSegmented<'off' | 'on'>
                          value={showOverlay ? 'on' : 'off'}
                          onChange={(v) => setShowOverlay(v === 'on')}
                          options={[{ id: 'off', label: 'No', disabled: transmitting }, { id: 'on', label: 'Sí · 1920×112', disabled: transmitting }]}
                        />
                      </div>
                    </div>
                    <div className="hx-muted" style={{ marginTop: 12, fontSize: 11, lineHeight: 1.6 }}>
                      <b className="hx-goldtext" style={{ fontSize: 11, letterSpacing: '0.06em' }}>Guía en 3 pasos:</b> ① espectea (o juega) la partida en el cliente de LoL desde ESTA PC ·
                      ② INICIAR TRANSMISIÓN (debajo debe decir OK 200) · ③ en OBS: Fuente de navegador → pegar el
                      LINK OVERLAY, 1920×1080. El tablero completo es para ver en cualquier navegador.
                      Al haber dragón/barón, el overlay lanza la animación solo.
                    </div>
                  </Rise>

                  {/* Registro de envío */}
                  <Rise>
                    <HxPanel cut={6} strong inner={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
                      <div>
                        <div className="hx-mono" style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}><Ticker value={Number(feed?.pushed ?? 0) || 0} /></div>
                        <div className="hx-label" style={{ fontSize: 9 }}>Snapshots</div>
                      </div>
                      <span style={{ width: 1, height: 28, background: 'var(--hx-gold-faint)' }} />
                      <div>
                        <div style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                          <Crossfade id={transmitting ? lastTxt : 'INACTIVO'}>
                            <span className={`hx-pill${transmitting ? lastTone : ''}`}>{transmitting ? lastTxt : 'Inactivo'}</span>
                          </Crossfade>
                        </div>
                        <div className="hx-label" style={{ fontSize: 9, marginTop: 2 }}>Estado</div>
                      </div>
                      <span style={{ width: 1, height: 28, background: 'var(--hx-gold-faint)' }} />
                      <div>
                        <div className="hx-mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--hx-gold-bright)', fontVariantNumeric: 'tabular-nums' }}>{transmitting ? lastAgo : '—'}</div>
                        <div className="hx-label" style={{ fontSize: 9 }}>Último envío</div>
                      </div>
                      <AnimatePresence initial={false}>
                        {transmitting && last?.error ? (
                          <motion.div
                            key="feed-error"
                            className="hx-mono"
                            style={{ fontSize: 11, color: '#ff9aa0' }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
                            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
                          >
                            {String(last.error)}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </HxPanel>
                  </Rise>
                </HxPanel>
              </motion.div>
            )}

            {/* ── AJUSTES ── */}
            {tab === 'ajustes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, flex: 'none' }}>
                <motion.div variants={CARD}>
                  <HxPanel corners className="hm-card" inner={{ padding: '14px 18px' }}>
                    <div className="hx-label gold" style={{ marginBottom: 10 }}>Abrir / cerrar overlays</div>
                    <motion.div variants={GRID_STAGGER} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {OVERLAYS.map(([kind, label, keys]) => (
                        <motion.div key={kind} variants={rise} style={{ display: 'grid' }}>
                          <button
                            type="button"
                            className="hx-btn ghost row"
                            style={{ minHeight: 36, fontSize: 11, padding: '0 12px' }}
                            onClick={() => { void window.atak.toggleOverlay(kind); }}
                          >
                            <span>{label}</span>
                            <span className="hx-mono" style={{ fontSize: 9.5, letterSpacing: 0, textTransform: 'none', color: 'var(--hx-gold)' }}>{keys}</span>
                          </button>
                        </motion.div>
                      ))}
                    </motion.div>
                  </HxPanel>
                </motion.div>

                <Rise className="hx-muted" style={{ fontSize: 10.5, lineHeight: 1.7 }}>
                  Los hotkeys se re-registran solos al entrar a partida. Si LoL está en
                  «pantalla completa exclusiva», Windows bloquea hotkeys globales — usa
                  <b style={{ color: 'var(--hx-gold-bright)' }}> sin bordes (borderless)</b> en los ajustes de video de LoL.
                  <br />ATAK Companion v0.1.0 · beta — reporta bugs al Discord de la LQC.
                </Rise>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
