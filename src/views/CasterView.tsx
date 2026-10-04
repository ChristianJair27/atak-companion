// src/views/CasterView.tsx — Barra de transmisión en esta PC (ventana 1920×1080
// transparente; la barra vive arriba al centro). Mismo marcador que el overlay
// de OBS del sitio (/broadcast/:canal/overlay) y sus dos temas:
//  · atak — diseño Arena (Barlow Condensed en itálica, crimson).
//  · lqc  — la liga, con la identidad de sus publicaciones: Orbitron en
//           itálica con resplandor, JetBrains Mono y el fondo azul con "LQC".
// El tema sale del canal guardado en el Modo caster (los "lqc…" usan el de la
// liga); ?theme=atak|lqc lo fuerza (preview). Los nombres y logos de equipo
// son los del formulario del Modo caster; sin ellos, AZUL / ROJO.
import { motion } from 'framer-motion';
import logo from '../assets/atak-logo.png';
import { Blip, EASE } from '../motion';
import lqcBg from '../assets/lqc-bg.webp';
import lqcMark from '../assets/lqc-wordmark.png';
import { BaronSvg, DragonSvg, dragonColor, fmtClock, useLive } from './shared';

interface Theme {
  id: 'atak' | 'lqc';
  panel: string; strip: string; line: string;
  text2: string; muted: string;
  blue: string; blueFill: string; red: string; redFill: string; accent: string;
  font: string; italic: boolean; scale: number;
  /** Fuente de datos/etiquetas, fondo del marcador y resplandor de los títulos. */
  data: string; panelImg?: string; glow?: string; stroke?: string;
}
const ATAK: Theme = {
  id: 'atak',
  panel: 'rgba(18,18,22,.97)', strip: '#0e0e11', line: 'rgba(255,255,255,.1)',
  text2: '#b6b6c0', muted: '#8c8c98',
  blue: '#6db3ff', blueFill: '#2a6fd6', red: '#ff5a64', redFill: '#e8323c', accent: '#e8323c',
  font: 'var(--ax-display)', italic: true, scale: 1,
  data: 'var(--font-data)',
};
const LQC: Theme = {
  id: 'lqc',
  panel: 'rgba(2,11,28,.97)', strip: 'rgba(1,7,18,.78)', line: 'rgba(96,165,255,.3)',
  text2: '#bcd0ee', muted: '#86a2cc',
  blue: '#4ea1ff', blueFill: 'linear-gradient(135deg,#0a58c8 0%,#1f7ae6 55%,#3f97ff 100%)',
  red: '#ff6a8c', redFill: 'linear-gradient(135deg,#a50f3a 0%,#e5235a 60%,#ff3d6e 100%)', accent: '#2a86f0',
  // Orbitron es más ancha que Barlow Condensed (se compensa el cuerpo) y no trae
  // itálica: el navegador la inclina, como el logo de la liga.
  font: "'Orbitron', var(--ax-display)", italic: true, scale: 0.7,
  data: "'JetBrains Mono', var(--font-data)",
  panelImg: `linear-gradient(rgba(1,8,22,.46), rgba(1,8,22,.46)), url(${lqcBg}) center / cover no-repeat, #020b1c`,
  glow: '0 0 18px rgba(63,151,255,.7)', stroke: '0.03em currentColor',
};

interface CasterCfg { channel: string; team1: string; team2: string; logo1: string; logo2: string; accent: string }
/** Config del Modo caster (la guarda MainView en localStorage, mismo origen). */
function readCfg(): CasterCfg {
  const base: CasterCfg = { channel: 'lqc-2026', team1: '', team2: '', logo1: '', logo2: '', accent: '' };
  try {
    const raw = localStorage.getItem('atak.caster.cfg');
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* config corrupta → defaults */ }
  return base;
}

function TimerChip(props: { T: Theme; label: string; icon: 'dragon' | 'baron'; nextAt: number | null; alive: boolean; gameTime: number }) {
  const { T, label, icon, nextAt, alive, gameTime } = props;
  const gone = nextAt == null;
  const live = alive && !gone;
  const Icon = icon === 'dragon' ? DragonSvg : BaronSvg;
  return (
    <div
      className={live ? 'badge-glow' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px', borderRadius: 4,
        background: live ? T.accent : T.panel,
        border: `1px solid ${live ? T.accent : T.line}`,
      }}
    >
      <Icon size={13} color={live ? '#fff' : T.text2} />
      <span style={{ fontFamily: T.data, fontSize: 12.5, letterSpacing: '0.1em', fontWeight: 700, color: live ? '#fff' : T.text2 }}>{label}</span>
      <span style={{ fontFamily: T.font, fontStyle: T.italic ? 'italic' : 'normal', fontWeight: 800, fontSize: 19 * T.scale, lineHeight: 1, WebkitTextStroke: T.stroke, color: live ? '#fff' : gone ? T.muted : '#fff' }}>
        {gone ? '—' : live ? 'VIVO' : fmtClock(nextAt - gameTime)}
      </span>
    </div>
  );
}

function DragonMedals({ T, color, taken, right }: { T: Theme; color: string; taken: Array<{ type: string }>; right?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 120, justifyContent: right ? 'flex-start' : 'flex-end' }}>
      {taken.map((d, i) => (
        <span key={i} title={d.type} style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 4, background: T.panel, border: `1px solid ${T.line}`, borderBottom: `3px solid ${color}` }}>
          <DragonSvg size={12} color={dragonColor(d.type)} />
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

  const cfg = readCfg();
  const forced = new URLSearchParams(window.location.search).get('theme');
  const T = forced === 'atak' ? ATAK : forced === 'lqc' ? LQC : /^lqc/i.test(cfg.channel) ? LQC : ATAK;
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : T.accent;
  const disp = (px: number): React.CSSProperties => ({
    fontFamily: T.font, fontStyle: T.italic ? 'italic' : 'normal', fontWeight: 800,
    fontSize: px * T.scale, lineHeight: 1, letterSpacing: '0.02em', textTransform: 'uppercase',
    textShadow: T.glow, WebkitTextStroke: T.stroke,
  });

  const players: any[] = s.players || [];
  const blue = players.filter((p) => p.team === 'ORDER');
  const red = players.filter((p) => p.team !== 'ORDER');
  const sum = (arr: any[], k: string) => arr.reduce((a, p) => a + (p[k] || 0), 0);
  const taken: Array<{ team: string | null; type: string }> = o.dragon?.taken || [];
  const name1 = (cfg.team1 || 'Azul').trim().toUpperCase();
  const name2 = (cfg.team2 || 'Rojo').trim().toUpperCase();
  const fit = (name: string) => (name.length <= 13 ? 30 : Math.max(19, Math.round((30 * 13) / name.length)));

  // Team / Kills se llaman como funciones: como <Componente /> se remontarían en cada tick.
  const Team = (side: 'blue' | 'red') => {
    const isBlue = side === 'blue';
    const name = isBlue ? name1 : name2;
    const teamLogo = isBlue ? cfg.logo1 : cfg.logo2;
    const fill = isBlue ? T.blueFill : T.redFill;
    return (
      <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px 4px', flexDirection: isBlue ? 'row' : 'row-reverse' }}>
        <span style={{ ...disp(26), width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, overflow: 'hidden', background: teamLogo ? 'transparent' : fill, color: '#fff' }}>
          {teamLogo
            ? <img src={teamLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            : name.slice(0, 1)}
        </span>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: isBlue ? 'flex-start' : 'flex-end' }}>
          <span style={{ ...disp(fit(name)), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff', paddingRight: 3 }}>{name}</span>
          <span style={{ fontFamily: T.data, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', lineHeight: 1, color: isBlue ? T.blue : T.red }}>{isBlue ? 'LADO AZUL' : 'LADO ROJO'}</span>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: 6, flexDirection: isBlue ? 'row' : 'row-reverse' }}>
          <span style={{ fontFamily: T.data, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', color: T.muted }}>VISIÓN</span>
          <span style={{ fontFamily: T.data, fontWeight: 700, fontSize: T.id === 'lqc' ? 18 : 20, color: '#fff' }}>{sum(isBlue ? blue : red, 'wardScore')}</span>
        </div>
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: fill }} />
      </div>
    );
  };

  const Kills = (side: 'blue' | 'red') => (
    <div style={{ ...disp(50), textShadow: T.glow ? '0 0 18px rgba(255,255,255,.45)' : undefined, width: 88, flex: 'none', display: 'grid', placeItems: 'center', background: side === 'blue' ? T.blueFill : T.redFill, color: '#fff' }}>
      <Blip value={sum(side === 'blue' ? blue : red, 'kills')} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: 1320, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Marcador: baja desde arriba al abrir */}
      <motion.div
        initial={{ opacity: 0, y: -72 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}
        style={{
          width: '100%', height: 68, display: 'flex', alignItems: 'stretch', overflow: 'hidden',
          background: T.panelImg || T.panel, border: `1px solid ${T.line}`, borderTop: 'none', borderRadius: '0 0 10px 10px',
          boxShadow: '0 16px 34px -16px rgba(0,0,0,.85)',
        }}
      >
        {Team('blue')}
        {Kills('blue')}
        <div style={{ width: 150, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: T.strip }}>
          {T.id === 'lqc'
            ? <img src={lqcMark} alt="LQC" style={{ height: 21 }} />
            : <img src={logo} alt="ATAK.GG" style={{ height: 30 }} />}
          <span style={{ ...disp(23), color: '#fff' }}>{fmtClock(s.gameTime)}</span>
        </div>
        {Kills('red')}
        {Team('red')}
      </motion.div>

      {/* Dragones tomados + timers de objetivos */}
      <motion.div
        initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}
      >
        <DragonMedals T={T} color={T.blue} taken={taken.filter((d) => d.team === 'ORDER')} />
        <TimerChip T={{ ...T, accent }} label="DRAGÓN" icon="dragon" nextAt={o.dragon.nextAt} alive={o.dragon.alive} gameTime={s.gameTime} />
        <TimerChip T={{ ...T, accent }} label="BARÓN" icon="baron" nextAt={o.baron.nextAt} alive={o.baron.alive} gameTime={s.gameTime} />
        <DragonMedals T={T} color={T.red} taken={taken.filter((d) => d.team === 'CHAOS')} right />
      </motion.div>
    </div>
  );
}
