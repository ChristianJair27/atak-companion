// src/views/CasterView.tsx — Barra de transmisión 1920×112 superior-centro (diseño 1f).
// Todo fuera de la barra queda transparente. El payload live no trae nombres de
// equipo (el status.feed tampoco los expone), así que se muestran AZUL / ROJO.
// Mejora sobre el diseño: medallones de dragones tomados coloreados por elemento.
import logo from '../assets/atak-logo.png';
import { BaronSvg, DragonSvg, dragonColor, fmtClock, useLive } from './shared';

function HexBadge({ txt, red }: { txt: string; red?: boolean }) {
  return (
    <span
      className="display"
      style={{
        width: 34, height: 34, flex: 'none',
        background: red ? 'linear-gradient(135deg,#331114,#101115)' : 'linear-gradient(135deg,#23252b,#101115)',
        display: 'grid', placeItems: 'center',
        fontWeight: 700, fontSize: 15,
        color: red ? 'var(--crimson-soft)' : 'var(--text)',
        boxShadow: `0 0 0 1px ${red ? '#E1242E' : '#9ba0ab'}`,
        clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)',
      }}
    >
      {txt}
    </span>
  );
}

function TimerChip(props: { label: string; icon: 'dragon' | 'baron'; nextAt: number | null; alive: boolean; gameTime: number }) {
  const { label, icon, nextAt, alive, gameTime } = props;
  const gone = nextAt == null;
  const live = alive && !gone;
  const Icon = icon === 'dragon' ? DragonSvg : BaronSvg;
  return (
    <div
      className={`skew${live ? ' badge-glow' : ''}`}
      style={{
        '--skew': '10px',
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'var(--panel-bg)',
        border: `1px solid ${live ? 'rgba(225,36,46,.6)' : 'rgba(200,205,214,.25)'}`,
        padding: '4px 14px',
      } as any}
    >
      <Icon size={13} color={live ? '#E1242E' : '#9ba0ab'} />
      <span style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 600, color: live ? 'var(--crimson-soft)' : 'var(--text-soft)' }}>{label}</span>
      <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: live ? '#fff' : gone ? 'var(--text-faint)' : 'var(--text-soft)' }}>
        {gone ? '—' : live ? 'AHORA' : fmtClock(nextAt - gameTime)}
      </span>
    </div>
  );
}

function DragonMedals({ tag, taken }: { tag: string; taken: Array<{ type: string }> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--text-dim)', marginRight: 2 }}>{tag}</span>
      {taken.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>—</span>}
      {taken.map((d, i) => (
        <span key={i} className="medal" title={d.type}>
          <DragonSvg size={9} color={dragonColor(d.type)} />
        </span>
      ))}
    </div>
  );
}

export default function CasterView() {
  const live = useLive();
  const s = live?.state;
  const o = live?.objectives;
  if (!s || !o) return null; // transparente hasta que haya partida

  const players: any[] = s.players || [];
  const blue = players.filter((p) => p.team === 'ORDER');
  const red = players.filter((p) => p.team !== 'ORDER');
  const kills = (arr: any[]) => arr.reduce((a, p) => a + (p.kills || 0), 0);
  const taken: Array<{ team: string | null; type: string }> = o.dragon?.taken || [];
  const blueDragons = taken.filter((d) => d.team === 'ORDER');
  const redDragons = taken.filter((d) => d.team === 'CHAOS');

  return (
    <>
      {/* Barra principal */}
      <div
        style={{
          position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 1160, height: 64,
          background: 'var(--panel-bg)',
          border: '1px solid rgba(200,205,214,.24)', borderTop: 'none',
          clipPath: 'polygon(0 0,100% 0,calc(100% - 22px) 100%,22px 100%)',
          display: 'flex', alignItems: 'stretch',
        }}
      >
        {/* Equipo azul */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 38, minWidth: 0 }}>
          <HexBadge txt="AZ" />
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.12em', color: 'var(--text)' }}>AZUL</div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>LADO AZUL · LQC</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 14 }}>
            <span style={{ font: '600 13px var(--font-data)', color: 'var(--text-dim)' }}>VIS</span>
            <span style={{ font: '600 15px var(--font-data)', color: 'var(--text-soft)' }}>
              {blue.reduce((a, p) => a + (p.wardScore || 0), 0)}
            </span>
          </div>
        </div>

        {/* Marcador central */}
        <div
          style={{
            width: 250, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            background: 'linear-gradient(180deg,rgba(225,36,46,.14),rgba(225,36,46,.04))',
            borderLeft: '1px solid rgba(200,205,214,.2)', borderRight: '1px solid rgba(200,205,214,.2)',
            position: 'relative',
          }}
        >
          <span className="display" style={{ fontWeight: 800, fontSize: 34, color: 'var(--text)' }}>{kills(blue)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <img src={logo} alt="ATAK.GG" style={{ height: 26, filter: 'drop-shadow(0 0 5px rgba(225,36,46,.5))' }} />
            <span className="mono" style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-soft)' }}>{fmtClock(s.gameTime)}</span>
          </span>
          <span className="display" style={{ fontWeight: 800, fontSize: 34, color: 'var(--crimson)' }}>{kills(red)}</span>
          <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#9ba0ab,#E1242E)' }} />
        </div>

        {/* Equipo rojo */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, paddingRight: 38, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 }}>
            <span style={{ font: '600 15px var(--font-data)', color: 'var(--crimson-soft)' }}>
              {red.reduce((a, p) => a + (p.wardScore || 0), 0)}
            </span>
            <span style={{ font: '600 13px var(--font-data)', color: 'var(--text-dim)' }}>VIS</span>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
            <div className="display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.12em', color: 'var(--crimson-soft)' }}>ROJO</div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>LQC · LADO ROJO</div>
          </div>
          <HexBadge txt="RJ" red />
        </div>
      </div>

      {/* Chips de objetivos + medallones de dragones */}
      <div style={{ position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TimerChip label="DRAGÓN" icon="dragon" nextAt={o.dragon.nextAt} alive={o.dragon.alive} gameTime={s.gameTime} />
        <TimerChip label="BARÓN" icon="baron" nextAt={o.baron.nextAt} alive={o.baron.alive} gameTime={s.gameTime} />
        <span style={{ width: 1, height: 18, background: 'linear-gradient(180deg,transparent,#6f7480,transparent)' }} />
        <DragonMedals tag="AZ" taken={blueDragons} />
        <DragonMedals tag="RJ" taken={redDragons} />
      </div>
    </>
  );
}
