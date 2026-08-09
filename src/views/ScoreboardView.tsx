// src/views/ScoreboardView.tsx — Scoreboard overlay 820×460 (diseño 1c).
// Dos columnas espejo (azul/rojo) con marcador de kills; fondo transparente.
import logo from '../assets/atak-logo.png';
import { ChampIcon, fmtClock, useLive, usePatch } from './shared';

export default function ScoreboardView() {
  const live = useLive();
  const patch = usePatch();
  const s = live?.state;
  if (!s) return null; // transparente sin partida

  const blue = (s.players || []).filter((p: any) => p.team === 'ORDER');
  const red = (s.players || []).filter((p: any) => p.team !== 'ORDER');
  const sum = (arr: any[], k: string) => arr.reduce((a, p) => a + (p[k] || 0), 0);

  const kdaCell = (p: any) =>
    p.isDead
      ? <span className="mono" style={{ fontWeight: 700, fontSize: 11, textAlign: 'center', color: 'var(--crimson)' }}>{fmtClock(p.respawnTimer)}</span>
      : <span style={{ font: '600 12px var(--font-data)', textAlign: 'center', color: 'var(--text-soft)' }}>{p.kills}/{p.deaths}/{p.assists}</span>;

  const nameCell = (p: any, right?: boolean) => (
    <span style={{ minWidth: 0, textAlign: right ? 'right' : 'left' }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
      <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.championName}</span>
    </span>
  );

  const blueRow = (p: any, i: number) => (
    <div
      key={i}
      style={{
        display: 'grid', gridTemplateColumns: '30px 1fr 34px 64px 40px', gap: 8, alignItems: 'center',
        background: 'rgba(255,255,255,.04)', borderLeft: '2px solid #6f7480', padding: '7px 4px',
        opacity: p.isDead ? 0.45 : 1,
      }}
    >
      <ChampIcon patch={patch} name={p.championName} size={26} />
      {nameCell(p)}
      <span style={{ font: '500 12px var(--font-data)', textAlign: 'center', color: 'var(--text-dim)' }}>{p.level}</span>
      {kdaCell(p)}
      <span style={{ font: '500 12px var(--font-data)', textAlign: 'right', color: 'var(--text-dim)' }}>{p.creepScore}</span>
    </div>
  );

  const redRow = (p: any, i: number) => (
    <div
      key={i}
      style={{
        display: 'grid', gridTemplateColumns: '40px 64px 34px 1fr 30px', gap: 8, alignItems: 'center',
        background: 'rgba(225,36,46,.05)', borderRight: '2px solid var(--crimson)', padding: '7px 4px',
        opacity: p.isDead ? 0.45 : 1,
      }}
    >
      <span style={{ font: '500 12px var(--font-data)', color: 'var(--text-dim)' }}>{p.creepScore}</span>
      {kdaCell(p)}
      <span style={{ font: '500 12px var(--font-data)', textAlign: 'center', color: 'var(--text-dim)' }}>{p.level}</span>
      {nameCell(p, true)}
      <ChampIcon patch={patch} name={p.championName} size={26} enemy />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: '16px 20px' }}>
      <div className="panel cut cut-lg" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
        {/* Marcador */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, paddingBottom: 10 }}>
          <span className="display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.16em', color: 'var(--text-soft)' }}>LADO AZUL</span>
          <span className="metal-text-bright" style={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.05em' }}>{sum(blue, 'kills')}</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <img src={logo} alt="ATAK.GG" style={{ height: 34, filter: 'drop-shadow(0 0 6px rgba(225,36,46,.45))' }} />
            <span className="mono" style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-soft)' }}>{fmtClock(s.gameTime)}</span>
          </span>
          <span className="display" style={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.05em', color: 'var(--crimson)' }}>{sum(red, 'kills')}</span>
          <span className="display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.16em', color: 'var(--crimson)' }}>LADO ROJO</span>
        </div>
        <div className="hr" style={{ marginBottom: 8 }} />

        {/* Encabezados */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-faint)', marginBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 34px 64px 40px', gap: 8, padding: '0 4px' }}>
            <span /><span>JUGADOR</span><span style={{ textAlign: 'center' }}>NV</span><span style={{ textAlign: 'center' }}>KDA</span><span style={{ textAlign: 'right' }}>CS</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 64px 34px 1fr 30px', gap: 8, padding: '0 4px' }}>
            <span>CS</span><span style={{ textAlign: 'center' }}>KDA</span><span style={{ textAlign: 'center' }}>NV</span><span style={{ textAlign: 'right' }}>JUGADOR</span><span />
          </div>
        </div>

        {/* Filas */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5 }}>
            {blue.map(blueRow)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5 }}>
            {red.map(redRow)}
          </div>
        </div>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, paddingTop: 8, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
          <span>CS <span style={{ color: 'var(--text-soft)' }}>{sum(blue, 'creepScore')}</span></span>
          <span>VISIÓN <span style={{ color: 'var(--text-soft)' }}>{sum(blue, 'wardScore')}</span></span>
          <span style={{ color: '#3a3d46' }}>·</span>
          <span>VISIÓN <span style={{ color: 'var(--crimson-soft)' }}>{sum(red, 'wardScore')}</span></span>
          <span>CS <span style={{ color: 'var(--crimson-soft)' }}>{sum(red, 'creepScore')}</span></span>
        </div>
      </div>
    </div>
  );
}
