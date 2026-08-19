// src/views/MainView.tsx — Ventana principal con pestañas internas:
// INICIO (estado) · DRAFT (herramienta de drafteo) · ATAK.GG (frontend embebido
// en <webview>) · CASTER (transmisión LQC simplificada) · AJUSTES.
// El riel navega entre pantallas SIN abrir ventanas nuevas.
import { useEffect, useRef, useState } from 'react';
import logo from '../assets/atak-logo.png';
import { fmtClock, phaseEs, useLive, useStatus } from './shared';
import DraftView from './DraftView';

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
  const lastColor = !last ? 'var(--text-faint)' : last.code === 200 ? 'var(--green)' : 'var(--crimson)';
  const lastAgo = last?.at ? `hace ${Math.max(0, Math.round((Date.now() - last.at) / 1000))} s` : '—';
  const gameTime = live?.state?.gameTime;

  const myRiotId = status?.summoner?.gameName
    ? `${status.summoner.gameName}#${status.summoner.tagLine || ''}`
    : '';

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

  const inputCls = (mono = false) => `input${mono ? ' mono' : ''}`;

  // ── Webview (pestaña ATAK.GG) ──────────────────────────────────────────────
  const webRef = useRef<any>(null);
  const [atakUrl, setAtakUrl] = useState(frontend);
  const goAtak = (path: string) => {
    const url = `${frontend}${path}`;
    setAtakUrl(url);
    try { webRef.current?.loadURL?.(url); } catch { /* aún no montado */ }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0A0A0C', border: '1px solid rgba(200,205,214,.2)', display: 'flex', flexDirection: 'column' }}>
      {/* Barra de título */}
      <div className="drag" style={{ height: 38, flex: 'none', display: 'flex', alignItems: 'center', paddingLeft: 14, background: 'linear-gradient(180deg,#111216,#0A0A0C)', borderBottom: '1px solid rgba(200,205,214,.14)' }}>
        <img src={logo} alt="" style={{ height: 24, marginRight: 8 }} />
        <span className="metal-text" style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.2em' }}>ATAK.GG</span>
        <span style={{ marginLeft: 10, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>v0.1.0 · F9 HUD · F8/Ctrl+A players · Ctrl+Shift+S score</span>
        <div className="no-drag" style={{ marginLeft: 'auto', display: 'flex', height: '100%', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '4px 12px', fontSize: 10, height: 26 }}
            title="Abrir panel de jugadores (F8 / Ctrl+A)"
            onClick={() => { void window.atak.togglePlayers(); }}
          >
            JUGADORES · F8
          </button>
          <button className="tb-btn" onClick={() => window.atak.win('minimize')} aria-label="Minimizar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5 H9" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button className="tb-btn close" onClick={() => window.atak.win('close')} aria-label="Cerrar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Riel de navegación — pestañas internas, misma ventana */}
        <div style={{ width: 64, flex: 'none', borderRight: '1px solid rgba(200,205,214,.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 6, background: '#0c0c0f' }}>
          {RAIL.map((r) => (
            <button
              key={r.tab}
              className={`rail-btn no-drag${tab === r.tab ? ' active' : ''}`}
              title={r.title}
              onClick={() => setTab(r.tab)}
              style={{ position: 'relative' }}
            >
              {r.icon}
              {r.tab === 'caster' && transmitting && <span className="dot" style={{ position: 'absolute', top: 6, right: 6 }} />}
              {r.tab === 'inicio' && status?.inGame && <span className="dot" style={{ position: 'absolute', top: 6, right: 6 }} />}
            </button>
          ))}
          <button
            className={`rail-btn no-drag${tab === 'ajustes' ? ' active' : ''}`}
            title="Ajustes y overlays"
            style={{ marginTop: 'auto' }}
            onClick={() => setTab('ajustes')}
          >
            <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.5 V4 M8 12 V14.5 M14.5 8 H12 M4 8 H1.5 M12.6 3.4 L10.8 5.2 M5.2 10.8 L3.4 12.6 M12.6 12.6 L10.8 10.8 M5.2 5.2 L3.4 3.4" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
        </div>

        {/* ── Contenido por pestaña ── */}

        {/* ATAK.GG: el frontend real embebido — siempre montado para no recargar */}
        <div style={{ flex: 1, minWidth: 0, display: tab === 'atak' ? 'flex' : 'none', flexDirection: 'column' }}>
          <div className="no-drag" style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderBottom: '1px solid rgba(200,205,214,.12)', background: '#0c0c0f' }}>
            <button className="btn" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { try { webRef.current?.goBack?.(); } catch { /* */ } }}>←</button>
            <button className="btn" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => goAtak('/')}>INICIO</button>
            <button className="btn" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => goAtak(myRiotId.includes('#') ? `/stats/${String(status?.region || 'la1').toLowerCase()}/${encodeURIComponent(myRiotId)}` : '/stats')}>
              {myRiotId ? 'MI PERFIL' : 'STATS'}
            </button>
            <button className="btn" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => goAtak('/tournaments')}>TORNEOS</button>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>atakgg · siempre la última versión desplegada</span>
          </div>
          <webview ref={webRef} src={atakUrl} style={{ flex: 1, minHeight: 0 }} />
        </div>

        {tab !== 'atak' && (
          <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', minWidth: 0 }}>
            {/* Cabecera de la pestaña */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: '0.14em' }}>
                {tab === 'inicio' ? 'INICIO' : tab === 'draft' ? 'HERRAMIENTA DE DRAFT' : tab === 'caster' ? 'MODO CASTER' : 'AJUSTES'}
              </span>
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#6f7480,transparent)' }} />
            </div>

            {/* ── INICIO ── */}
            {tab === 'inicio' && (
              <>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="cut cut-sm" style={{ flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(200,205,214,.16)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div className="label" style={{ fontSize: 9.5, letterSpacing: '0.2em' }}>ESTADO DE CONEXIÓN</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span className={`dot dot-lg ${status?.lcuConnected ? 'dot-ok' : 'dot-off'}`} />
                      <span style={{ fontSize: 14 }}>{status?.lcuConnected ? 'Cliente de League detectado' : 'Esperando al cliente de League…'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span className={`dot dot-lg${status?.inGame ? '' : ' dot-off'}`} />
                      <span style={{ fontSize: 14 }}>
                        {status?.inGame ? (
                          <>En partida{gameTime != null && <> · <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-soft)' }}>{fmtClock(gameTime)}</span></>}</>
                        ) : (
                          phaseEs(status?.phase || 'None')
                        )}
                      </span>
                    </div>
                    {(status?.inGame || status?.phase === 'InProgress') && (
                      <button
                        type="button"
                        className="btn btn-primary skew"
                        style={{ '--skew': '8px', alignSelf: 'flex-start', marginTop: 4 } as any}
                        onClick={() => { void window.atak.togglePlayers(); }}
                      >
                        ABRIR JUGADORES (F8)
                      </button>
                    )}
                  </div>

                  <div className="cut cut-sm" style={{ flex: 1, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(200,205,214,.16)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      className="display"
                      style={{ width: 56, height: 56, flex: 'none', borderRadius: '50%', background: 'linear-gradient(135deg,#3a1216,#16090b)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 22, boxShadow: '0 0 0 2px #0a0a0c, 0 0 0 4px #9ba0ab' }}
                    >
                      {(status?.summoner?.gameName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {status?.summoner ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span
                              className="atak-link"
                              title="Ver mi perfil en ATAK.GG"
                              onClick={() => { setTab('atak'); goAtak(`/stats/${String(status?.region || 'la1').toLowerCase()}/${encodeURIComponent(myRiotId)}`); }}
                              style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {status.summoner.gameName}
                            </span>
                            {status.summoner.tagLine && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>#{status.summoner.tagLine}</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            {status.region && (
                              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: '#7ec3e8', border: '1px solid #7ec3e8', padding: '1px 7px' }}>{status.region}</span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Cuenta vinculada al companion</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Sin invocador — abre el cliente de League para vincular tu cuenta.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Accesos rápidos */}
                <div className="cut cut-sm" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(200,205,214,.16)', padding: '14px 16px' }}>
                  <div className="label" style={{ marginBottom: 10, letterSpacing: '0.2em' }}>ACCESOS RÁPIDOS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {([
                      ['Herramienta de draft', () => setTab('draft')],
                      ['Mi perfil ATAK.GG', () => { setTab('atak'); goAtak(myRiotId.includes('#') ? `/stats/${String(status?.region || 'la1').toLowerCase()}/${encodeURIComponent(myRiotId)}` : '/stats'); }],
                      ['Torneos', () => { setTab('atak'); goAtak('/tournaments'); }],
                      ['Modo caster', () => setTab('caster')],
                    ] as const).map(([label, fn]) => (
                      <button key={label} className="btn" style={{ fontSize: 12, padding: '10px 12px' }} onClick={fn}>{label}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── DRAFT ── */}
            {tab === 'draft' && <DraftView />}

            {/* ── CASTER (simplificado) ── */}
            {tab === 'caster' && (
              <div className="cut cut-lg" style={{ background: 'linear-gradient(135deg,rgba(225,36,46,.07),rgba(255,255,255,.02) 45%)', border: '1px solid rgba(225,36,46,.35)', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Paso 1: canal + token */}
                <div>
                  <div className="label" style={{ marginBottom: 8, letterSpacing: '0.18em' }}>1 · CANAL Y TOKEN</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
                    <div className="field">
                      <span className="label">CANAL</span>
                      <input className="input" placeholder="lqc-2026" value={caster.channel} disabled={transmitting} onChange={set('channel')} />
                    </div>
                    <div className="field">
                      <span className="label">TOKEN (te lo pasa el organizador — se guarda)</span>
                      <input className={inputCls(true)} type="password" placeholder="LIVE_FEED_TOKEN" value={caster.token} disabled={transmitting} onChange={set('token')} />
                    </div>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '9px 12px' }}
                      disabled={transmitting}
                      onClick={() => setCaster((c) => ({ ...c, channel: 'lqc-2026' }))}
                      title="Rellena el canal oficial de la LQC"
                    >
                      PRESET LQC
                    </button>
                  </div>
                </div>

                {/* Paso 2: partida (opcional) */}
                <div>
                  <div className="label" style={{ marginBottom: 8, letterSpacing: '0.18em' }}>2 · PARTIDA (opcional)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
                    <div className="field"><span className="label">ETIQUETA</span>
                      <input className="input" placeholder="Final · Juego 3 de 5" value={caster.matchLabel} disabled={transmitting} onChange={set('matchLabel')} /></div>
                    <div className="field"><span className="label">EQUIPO AZUL</span>
                      <input className="input" placeholder="Nombre" value={caster.team1} disabled={transmitting} onChange={set('team1')} /></div>
                    <div className="field"><span className="label">EQUIPO ROJO</span>
                      <input className="input" placeholder="Nombre" value={caster.team2} disabled={transmitting} onChange={set('team2')} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                    <div className="field"><span className="label">LOGO AZUL (URL PNG)</span>
                      <input className="input" placeholder="https://…/logo1.png" value={caster.logo1} disabled={transmitting} onChange={set('logo1')} /></div>
                    <div className="field"><span className="label">LOGO ROJO (URL PNG)</span>
                      <input className="input" placeholder="https://…/logo2.png" value={caster.logo2} disabled={transmitting} onChange={set('logo2')} /></div>
                    <div className="field"><span className="label">COLOR DE ACENTO</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={caster.accent || '#0066ff'}
                          disabled={transmitting}
                          onChange={(e) => setCaster((c) => ({ ...c, accent: e.target.value }))}
                          style={{ width: 38, height: 34, border: '1px solid rgba(200,205,214,.25)', background: 'transparent', cursor: 'pointer' }}
                        />
                        <input className={inputCls(true)} placeholder="#0066ff (vacío = LQC)" value={caster.accent} disabled={transmitting} onChange={set('accent')} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Paso 3: transmitir + links */}
                <div>
                  <div className="label" style={{ marginBottom: 8, letterSpacing: '0.18em' }}>3 · TRANSMITIR Y PONER EN OBS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-big skew" style={{ '--skew': '11px' } as any} onClick={() => void toggleCaster()} disabled={busy}>
                      <span className="dot" style={{ width: 8, height: 8, background: '#fff', animationDuration: '1.2s', animationPlayState: transmitting ? 'running' : 'paused' }} />
                      {transmitting ? 'DETENER TRANSMISIÓN' : 'INICIAR TRANSMISIÓN'}
                    </button>
                    <button className="btn" style={{ fontSize: 12, padding: '10px 14px' }} onClick={() => copy('overlay', overlayUrl)} title={overlayUrl}>
                      {copied === 'overlay' ? '✓ COPIADO' : 'COPIAR LINK OVERLAY (OBS)'}
                    </button>
                    <button className="btn" style={{ fontSize: 12, padding: '10px 14px' }} onClick={() => copy('board', boardUrl)} title={boardUrl}>
                      {copied === 'board' ? '✓ COPIADO' : 'COPIAR LINK TABLERO'}
                    </button>
                    <label className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={showOverlay} disabled={transmitting} onChange={(e) => setShowOverlay(e.target.checked)} style={{ accentColor: '#E1242E' }} />
                      Barra en esta PC (1920×112)
                    </label>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
                    <b style={{ color: 'var(--text-soft)' }}>Guía en 3 pasos:</b> ① espectea (o juega) la partida en el cliente de LoL desde ESTA PC ·
                    ② INICIAR TRANSMISIÓN (debajo debe decir OK 200) · ③ en OBS: Fuente de navegador → pegar el
                    LINK OVERLAY, 1920×1080. El tablero completo es para ver en cualquier navegador.
                    Al haber dragón/barón, el overlay lanza la animación solo.
                  </div>
                </div>

                {/* Registro de envío */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#0d0d10', border: '1px solid rgba(200,205,214,.12)', padding: '10px 14px' }}>
                  <div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{feed?.pushed ?? 0}</div>
                    <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>SNAPSHOTS</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: transmitting ? lastColor : 'var(--text-faint)' }}>{transmitting ? lastTxt : 'INACTIVO'}</div>
                    <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>ESTADO</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-soft)' }}>{transmitting ? lastAgo : '—'}</div>
                    <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>ÚLTIMO ENVÍO</div>
                  </div>
                  {transmitting && last?.error ? (
                    <div className="mono" style={{ fontSize: 11, color: 'var(--crimson)' }}>{String(last.error)}</div>
                  ) : null}
                </div>
              </div>
            )}

            {/* ── AJUSTES ── */}
            {tab === 'ajustes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
                <div className="cut cut-sm" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(200,205,214,.16)', padding: '14px 16px' }}>
                  <div className="label" style={{ marginBottom: 10, letterSpacing: '0.18em' }}>ABRIR / CERRAR OVERLAYS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      ['players', 'Panel de jugadores', 'F8 · Ctrl+A'],
                      ['hud', 'HUD in-game', 'F9'],
                      ['scoreboard', 'Scoreboard 5v5', 'Ctrl+Shift+S'],
                      ['champselect', 'Champ select', 'auto en selección'],
                    ] as const).map(([kind, label, keys]) => (
                      <button
                        key={kind}
                        className="btn"
                        style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', padding: '9px 12px', fontSize: 12 }}
                        onClick={() => { void window.atak.toggleOverlay(kind); }}
                      >
                        <span>{label}</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{keys}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.7 }}>
                  Los hotkeys se re-registran solos al entrar a partida. Si LoL está en
                  «pantalla completa exclusiva», Windows bloquea hotkeys globales — usa
                  <b style={{ color: 'var(--text-soft)' }}> sin bordes (borderless)</b> en los ajustes de video de LoL.
                  <br />ATAK Companion v0.1.0 · beta — reporta bugs al Discord de la LQC.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
