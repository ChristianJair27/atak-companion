// src/views/MainView.tsx — Ventana principal 1120×720 sin marco (diseño 1e).
// Title bar custom + estado de conexión + panel MODO CASTER LQC.
import { useEffect, useState } from 'react';
import logo from '../assets/atak-logo.png';
import { fmtClock, phaseEs, useLive, useStatus } from './shared';

const CASTER_KEY = 'atak.caster.cfg';

interface CasterCfg {
  channel: string;
  token: string;
  matchLabel: string;
  team1: string;
  team2: string;
  streamUrl: string;
}

const defaultCfg: CasterCfg = { channel: 'lqc-2026', token: '', matchLabel: '', team1: '', team2: '', streamUrl: '' };

const loadCfg = (): CasterCfg => {
  try {
    const raw = localStorage.getItem(CASTER_KEY);
    if (raw) return { ...defaultCfg, ...JSON.parse(raw) };
  } catch { /* config corrupta → defaults */ }
  return defaultCfg;
};

const FIELDS: Array<{ key: keyof CasterCfg; label: string; mono?: boolean; password?: boolean; placeholder: string }> = [
  { key: 'channel', label: 'CANAL', placeholder: 'lqc-2026' },
  { key: 'token', label: 'TOKEN', mono: true, password: true, placeholder: 'LIVE_FEED_TOKEN' },
  { key: 'matchLabel', label: 'ETIQUETA DE PARTIDA', placeholder: 'Final · Juego 3 de 5' },
  { key: 'team1', label: 'EQUIPO AZUL', placeholder: 'Nombre del equipo azul' },
  { key: 'team2', label: 'EQUIPO ROJO', placeholder: 'Nombre del equipo rojo' },
  { key: 'streamUrl', label: 'URL DEL STREAM', placeholder: 'https://twitch.tv/…' },
];

export default function MainView() {
  const status = useStatus(2000); // refresco cada 2 s (feed.pushed / lastStatus)
  const live = useLive();
  const [caster, setCaster] = useState<CasterCfg>(loadCfg);
  const [showOverlay, setShowOverlay] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(CASTER_KEY, JSON.stringify(caster)); } catch { /* sin persistencia */ }
  }, [caster]);

  const feed = status?.feed;
  const transmitting = Boolean(feed?.active || status?.casterMode);
  const last = feed?.lastStatus;
  const lastTxt = !last ? '—' : last.code === 200 ? 'OK 200' : last.error ? 'ERROR' : last.code != null ? `HTTP ${last.code}` : '—';
  const lastColor = !last ? 'var(--text-faint)' : last.code === 200 ? 'var(--green)' : 'var(--crimson)';
  const lastAgo = last?.at ? `hace ${Math.max(0, Math.round((Date.now() - last.at) / 1000))} s` : '—';

  const toggleCaster = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (transmitting) await window.atak.casterStop();
      else await window.atak.casterStart({ ...caster, backend: status?.backend, logo1: '', logo2: '', showOverlay });
    } finally {
      setBusy(false);
    }
  };

  const gameTime = live?.state?.gameTime;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0A0A0C', border: '1px solid rgba(200,205,214,.2)', display: 'flex', flexDirection: 'column' }}>
      {/* Barra de título */}
      <div className="drag" style={{ height: 38, flex: 'none', display: 'flex', alignItems: 'center', paddingLeft: 14, background: 'linear-gradient(180deg,#111216,#0A0A0C)', borderBottom: '1px solid rgba(200,205,214,.14)' }}>
        <img src={logo} alt="" style={{ height: 24, marginRight: 8 }} />
        <span className="metal-text" style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.2em' }}>ATAK.GG</span>
        <span style={{ marginLeft: 10, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>v0.1.0</span>
        <div className="no-drag" style={{ marginLeft: 'auto', display: 'flex', height: '100%' }}>
          <button className="tb-btn" onClick={() => window.atak.win('minimize')} aria-label="Minimizar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5 H9" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button className="tb-btn close" onClick={() => window.atak.win('close')} aria-label="Cerrar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Riel de navegación */}
        <div style={{ width: 64, flex: 'none', borderRight: '1px solid rgba(200,205,214,.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 6, background: '#0c0c0f' }}>
          <button className="rail-btn active" title="Inicio">
            <svg width="17" height="17" viewBox="0 0 16 16"><path d="M2 8 L8 2 L14 8 M4 7 V14 H12 V7" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
          </button>
          <button className="rail-btn" title="Estadísticas">
            <svg width="17" height="17" viewBox="0 0 16 16"><path d="M2 14 V9 M6.5 14 V4 M11 14 V7 M15 14 V2" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
          <button className="rail-btn" title="Torneos">
            <svg width="17" height="17" viewBox="0 0 16 16"><path d="M3 2 H13 V5 A5 5 0 0 1 3 5 Z M6 12 H10 M5 14 H11 M8 10 V12" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
          <button className="rail-btn" title="En vivo">
            <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2" fill="currentColor" /><path d="M8 1 V4 M8 12 V15 M1 8 H4 M12 8 H15" stroke="currentColor" strokeWidth="1.4" /></svg>
            {status?.inGame && <span className="dot" style={{ position: 'absolute', top: 8, right: 8 }} />}
          </button>
          <button className="rail-btn" title="Ajustes" style={{ marginTop: 'auto' }}>
            <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.5 V4 M8 12 V14.5 M14.5 8 H12 M4 8 H1.5 M12.6 3.4 L10.8 5.2 M5.2 10.8 L3.4 12.6 M12.6 12.6 L10.8 10.8 M5.2 5.2 L3.4 3.4" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
        </div>

        {/* Contenido */}
        <div style={{ flex: 1, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="display" style={{ fontWeight: 700, fontSize: 20, letterSpacing: '0.14em' }}>INICIO</span>
            <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#6f7480,transparent)' }} />
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {/* Estado de conexión */}
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
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Overlay activo · datos en vivo cada 2 s</div>
            </div>

            {/* Invocador */}
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
                      <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status.summoner.gameName}</span>
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

          {/* MODO CASTER LQC */}
          <div className="cut cut-lg" style={{ flex: 1, minHeight: 0, background: 'linear-gradient(135deg,rgba(225,36,46,.07),rgba(255,255,255,.02) 45%)', border: '1px solid rgba(225,36,46,.35)', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="metal-text-bright" style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.16em' }}>MODO CASTER LQC</span>
              <span className="badge-outline-red" style={{ fontSize: 10, letterSpacing: '0.14em', padding: '1px 8px', border: '1px solid rgba(225,36,46,.5)' }}>TRANSMISIÓN</span>
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(225,36,46,.5),transparent)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {FIELDS.slice(0, 3).map((f) => (
                <div className="field" key={f.key}>
                  <span className="label">{f.label}</span>
                  <input
                    className={`input${f.mono ? ' mono' : ''}`}
                    type={f.password ? 'password' : 'text'}
                    placeholder={f.placeholder}
                    value={caster[f.key]}
                    disabled={transmitting}
                    onChange={(e) => setCaster((c) => ({ ...c, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {FIELDS.slice(3).map((f, i) => (
                <div className="field" key={f.key}>
                  <span className="label">{f.label}</span>
                  <input
                    className="input"
                    type="text"
                    placeholder={f.placeholder}
                    value={caster[f.key]}
                    disabled={transmitting}
                    onChange={(e) => setCaster((c) => ({ ...c, [f.key]: e.target.value }))}
                    style={i === 1 ? { borderColor: 'rgba(225,36,46,.35)' } : undefined}
                  />
                </div>
              ))}
            </div>

            {/* Estado del push */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 3, background: '#0d0d10', border: '1px solid rgba(200,205,214,.12)', padding: '8px 12px', overflow: 'hidden' }}>
              <div className="label" style={{ letterSpacing: '0.2em', marginBottom: 2 }}>REGISTRO DE ENVÍO</div>
              {transmitting ? (
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  <span style={{ color: lastColor }}>{lastTxt}</span>
                  {' · '}snapshot #{feed?.pushed ?? 0} → {caster.channel || '—'} · {lastAgo}
                  {last?.error ? <span style={{ color: 'var(--crimson)' }}> · {String(last.error)}</span> : null}
                </div>
              ) : (
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  Transmisión detenida. Configura canal + token y presiona INICIAR.
                </div>
              )}
              <label className="no-drag" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={showOverlay} disabled={transmitting} onChange={(e) => setShowOverlay(e.target.checked)} style={{ accentColor: '#E1242E' }} />
                Mostrar barra de transmisión en pantalla (overlay 1920×112)
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <button className="btn btn-primary btn-big skew" style={{ '--skew': '11px' } as any} onClick={() => void toggleCaster()} disabled={busy}>
                <span className="dot" style={{ width: 8, height: 8, background: '#fff', animationDuration: '1.2s', animationPlayState: transmitting ? 'running' : 'paused' }} />
                {transmitting ? 'DETENER TRANSMISIÓN' : 'INICIAR TRANSMISIÓN'}
              </button>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{feed?.pushed ?? 0}</div>
                  <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>SNAPSHOTS ENVIADOS</div>
                </div>
                <div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: transmitting ? lastColor : 'var(--text-faint)' }}>{transmitting ? lastTxt : 'INACTIVO'}</div>
                  <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>ÚLTIMO ESTADO</div>
                </div>
                <div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-soft)' }}>{transmitting ? lastAgo : '—'}</div>
                  <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>ÚLTIMO ENVÍO</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
