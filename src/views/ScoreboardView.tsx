// src/views/ScoreboardView.tsx — Scoreboard overlay 820×460 (diseño 1c).
// Dos columnas espejo (azul/rojo) con marcador de kills; fondo transparente.
import { motion } from 'framer-motion';
import logo from '../assets/atak-logo.png';
import { Blip, EASE, Rise, Stagger, staggerParent } from '../motion';
import { ChampIcon, fmtClock, openProfile, useLive, usePatch } from './shared';

export default function ScoreboardView() {
  const live = useLive();
  const patch = usePatch();
  const s = live?.state;
  if (!s) return null; // transparente sin partida

  const blue = (s.players || []).filter((p: any) => p.team === 'ORDER');
  const red = (s.players || []).filter((p: any) => p.team !== 'ORDER');
  const sum = (arr: any[], k: string) => arr.reduce((a, p) => a + (p[k] || 0), 0);

  // Fila: entra con stagger (una vez) y se atenúa con fade al morir.
  const rowMotion = (p: any, fromX: number) => ({
    variants: {
      hidden: { opacity: 0, x: fromX },
      show: { opacity: p.isDead ? 0.45 : 1, x: 0 },
    },
    transition: { duration: 0.3, ease: EASE },
  });

  const kdaCell = (p: any) =>
    p.isDead
      ? <span className="mono" style={{ fontWeight: 700, fontSize: 14, textAlign: 'center', color: 'var(--ax-red-hi)' }}>{fmtClock(p.respawnTimer)}</span>
      : <span style={{ font: '700 15px var(--font-data)', textAlign: 'center', color: 'var(--text)' }}>{p.kills}/{p.deaths}/{p.assists}</span>;

  const nameCell = (p: any, right?: boolean) => (
    <span style={{ minWidth: 0, textAlign: right ? 'right' : 'left' }}>
      <span
        className="atak-link no-drag"
        onClick={() => openProfile(p.riotId || p.name)}
        title="Ver perfil en ATAK.GG"
        style={{ display: 'block', fontSize: 15, lineHeight: 1.2, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {p.name}
      </span>
      <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.2, letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.championName}</span>
    </span>
  );

  const blueRow = (p: any, i: number) => (
    <motion.div
      key={i}
      {...rowMotion(p, -8)}
      style={{
        display: 'grid', gridTemplateColumns: '32px 1fr 34px 64px 40px', gap: 8, alignItems: 'center',
        background: 'var(--ax-sub)', borderLeft: '3px solid var(--ax-blue)', borderRadius: 6, padding: '6px 8px 6px 7px',
      }}
    >
      <ChampIcon patch={patch} name={p.championName} size={30} />
      {nameCell(p)}
      <span style={{ font: '600 14px var(--font-data)', textAlign: 'center', color: 'var(--text-dim)' }}>{p.level}</span>
      {kdaCell(p)}
      <span style={{ font: '600 14px var(--font-data)', textAlign: 'right', color: 'var(--text-soft)' }}>{p.creepScore}</span>
    </motion.div>
  );

  const redRow = (p: any, i: number) => (
    <motion.div
      key={i}
      {...rowMotion(p, 8)}
      style={{
        display: 'grid', gridTemplateColumns: '40px 64px 34px 1fr 32px', gap: 8, alignItems: 'center',
        background: 'var(--ax-sub)', borderRight: '3px solid var(--crimson)', borderRadius: 6, padding: '6px 7px 6px 8px',
      }}
    >
      <span style={{ font: '600 14px var(--font-data)', color: 'var(--text-soft)' }}>{p.creepScore}</span>
      {kdaCell(p)}
      <span style={{ font: '600 14px var(--font-data)', textAlign: 'center', color: 'var(--text-dim)' }}>{p.level}</span>
      {nameCell(p, true)}
      <ChampIcon patch={patch} name={p.championName} size={30} />
    </motion.div>
  );

  return (
    <div style={{ position: 'fixed', inset: '16px 20px' }}>
      <Stagger className="panel" style={{ position: 'relative', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: 56, height: 3, background: 'var(--crimson)' }} />
        {/* Marcador */}
        <Rise style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 8 }}>
          <span className="display" style={{ fontWeight: 800, fontStyle: 'italic', fontSize: 22, letterSpacing: '0.02em', color: 'var(--ax-blue)' }}>LADO AZUL</span>
          <Blip className="display" style={{ fontWeight: 800, fontStyle: 'italic', fontSize: 46, lineHeight: 1, color: '#fff' }} value={sum(blue, 'kills')} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <img src={logo} alt="ATAK.GG" style={{ height: 30 }} />
            <span className="mono" style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-soft)' }}>{fmtClock(s.gameTime)}</span>
          </span>
          <Blip className="display" style={{ fontWeight: 800, fontStyle: 'italic', fontSize: 46, lineHeight: 1, color: 'var(--crimson)' }} value={sum(red, 'kills')} />
          <span className="display" style={{ fontWeight: 800, fontStyle: 'italic', fontSize: 22, letterSpacing: '0.02em', color: 'var(--ax-red-hi)' }}>LADO ROJO</span>
        </Rise>
        <div className="hr" style={{ marginBottom: 8 }} />

        {/* Encabezados */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 34px 64px 40px', gap: 8, padding: '0 8px 0 10px' }}>
            <span /><span>JUGADOR</span><span style={{ textAlign: 'center' }}>NV</span><span style={{ textAlign: 'center' }}>KDA</span><span style={{ textAlign: 'right' }}>CS</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 64px 34px 1fr 32px', gap: 8, padding: '0 10px 0 8px' }}>
            <span>CS</span><span style={{ textAlign: 'center' }}>KDA</span><span style={{ textAlign: 'center' }}>NV</span><span style={{ textAlign: 'right' }}>JUGADOR</span><span />
          </div>
        </div>

        {/* Filas */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, minHeight: 0 }}>
          <motion.div variants={staggerParent(0.04)} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5 }}>
            {blue.map(blueRow)}
          </motion.div>
          <motion.div variants={staggerParent(0.04)} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5 }}>
            {red.map(redRow)}
          </motion.div>
        </div>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, paddingTop: 8, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
          <span>CS <span style={{ color: 'var(--text-soft)' }}>{sum(blue, 'creepScore')}</span></span>
          <span>VISIÓN <span style={{ color: 'var(--text-soft)' }}>{sum(blue, 'wardScore')}</span></span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span>VISIÓN <span style={{ color: 'var(--crimson-soft)' }}>{sum(red, 'wardScore')}</span></span>
          <span>CS <span style={{ color: 'var(--crimson-soft)' }}>{sum(red, 'creepScore')}</span></span>
        </div>
      </Stagger>
    </div>
  );
}
