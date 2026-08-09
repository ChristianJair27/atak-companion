// src/views/HudView.tsx — HUD in-game 360×640 (diseño 1a).
// Overlay flotante: fondo transparente fuera del panel angular.
import type { CSSProperties } from 'react';
import { ChampIcon, fmtClock, fmtK, modeEs, ObjChip, posEs, useLive, usePatch } from './shared';

export default function HudView() {
  const live = useLive();
  const patch = usePatch();
  const s = live?.state;
  const o = live?.objectives;

  if (!s) {
    return (
      <div style={{ position: 'fixed', inset: '10px 10px auto 12px' }}>
        <div className="panel cut" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" />
          <span className="label">ESPERANDO PARTIDA…</span>
        </div>
      </div>
    );
  }

  const me = s.me;
  const mePlayer = (s.players || []).find((p: any) => p.isMe) || null;
  const myTeam: string = mePlayer?.team || 'ORDER';
  const allies = (s.players || []).filter((p: any) => p.team === myTeam);
  const enemies = (s.players || []).filter((p: any) => p.team !== myTeam);
  const sumK = (arr: any[]) => arr.reduce((a, p) => a + (p.kills || 0), 0);
  const cst = me?.championStats;
  const kdaRatio = me ? (me.deaths > 0 ? (me.kills + me.assists) / me.deaths : me.kills + me.assists) : 0;
  const csMin = me && s.gameTime > 0 ? (me.creepScore / (s.gameTime / 60)).toFixed(1) : '0.0';

  const row = (p: any, enemy: boolean, i: number) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: p.isDead ? 0.45 : 1 }}>
      {!enemy && <ChampIcon patch={patch} name={p.championName} size={16} />}
      {enemy && (
        p.isDead
          ? <span className="mono" style={{ fontWeight: 700, fontSize: 10, color: '#E1242E' }}>{fmtClock(p.respawnTimer)}</span>
          : <span style={{ font: '600 10px var(--font-data)', color: 'var(--text-soft)' }}>{p.kills}/{p.deaths}/{p.assists}</span>
      )}
      <span style={{ flex: 1, fontSize: 10.5, color: 'var(--text)', textAlign: enemy ? 'right' : 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.championName || p.name}
      </span>
      {!enemy && (
        p.isDead
          ? <span className="mono" style={{ fontWeight: 700, fontSize: 10, color: '#E1242E' }}>{fmtClock(p.respawnTimer)}</span>
          : <span style={{ font: '600 10px var(--font-data)', color: 'var(--text-soft)' }}>{p.kills}/{p.deaths}/{p.assists}</span>
      )}
      {enemy && <ChampIcon patch={patch} name={p.championName} size={16} enemy />}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: '10px 10px 10px 12px' }}>
      <div
        className="panel cut"
        style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 8 }}
      >
        <div className="hr" style={{ margin: '-4px -6px 0' }} />

        {/* Reloj + modo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="mono" style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.04em' }}>{fmtClock(s.gameTime)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" />
            <span
              className="skew"
              style={{ '--skew': '6px', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--text-soft)', border: '1px solid rgba(200,205,214,.3)', padding: '2px 8px' } as CSSProperties}
            >
              {modeEs(s.gameMode)}
            </span>
          </div>
        </div>

        {/* Card del campeón */}
        {me && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 'none' }}>
              <ChampIcon
                patch={patch}
                name={me.championName}
                size={52}
                round
                style={{ boxShadow: '0 0 0 2px #0a0a0c, 0 0 0 4px #9ba0ab, inset 0 0 12px rgba(225,36,46,.35)' }}
              />
              <span
                style={{
                  position: 'absolute', bottom: -3, right: -3, width: 18, height: 18,
                  background: 'linear-gradient(180deg,#f5f6f8,#8b8f9a)', color: '#0a0a0c',
                  font: '700 10px var(--font-data)', display: 'grid', placeItems: 'center',
                  clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
                }}
              >
                {me.level}
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="display" style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {me.championName}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
                  {mePlayer?.position ? `${posEs(mePlayer.position)} · TÚ` : 'TÚ'}
                </span>
              </div>
              {cst && (
                <>
                  <div className="bar" style={{ height: 7 }}>
                    <i style={{ width: `${cst.maxHp > 0 ? Math.min(100, (cst.hp / cst.maxHp) * 100) : 0}%` }} />
                    <span className="bar-txt">{cst.hp}/{cst.maxHp}</span>
                  </div>
                  <div className="bar silver" style={{ height: 5 }}>
                    <i style={{ width: `${cst.maxResource > 0 ? Math.min(100, (cst.resource / cst.maxResource) * 100) : 0}%` }} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* KDA grande */}
        {me && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, padding: '2px 0' }}>
            <span className="metal-text-bright" style={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.06em' }}>
              {me.kills} / {me.deaths} / {me.assists}
            </span>
            <span style={{ fontSize: 12, color: 'var(--crimson)', fontWeight: 600, letterSpacing: '0.08em' }}>
              KDA {kdaRatio.toFixed(1)}
            </span>
          </div>
        )}

        {/* Chips de estadística */}
        {me && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5 }}>
            <div className="stat-chip"><div className="v">{me.creepScore}</div><div className="k">CS</div></div>
            <div className="stat-chip"><div className="v">{csMin}</div><div className="k">CS/MIN</div></div>
            <div className="stat-chip"><div className="v">{fmtK(me.gold)}</div><div className="k">ORO</div></div>
            <div className="stat-chip"><div className="v">{me.visionScore}</div><div className="k">VISIÓN</div></div>
            <div className="stat-chip"><div className="v" style={{ color: 'var(--crimson)' }}>{me.killParticipation}%</div><div className="k">PART.</div></div>
          </div>
        )}

        {/* Mini-grid combate */}
        {cst && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
            <div className="kv"><span className="k">AD</span><span className="v">{cst.ad}</span></div>
            <div className="kv"><span className="k">AP</span><span className="v">{cst.ap}</span></div>
            <div className="kv"><span className="k">ARM</span><span className="v">{cst.armor}</span></div>
            <div className="kv"><span className="k">RM</span><span className="v">{cst.mr}</span></div>
          </div>
        )}

        {/* Timers de objetivos */}
        {o && (
          <div style={{ display: 'flex', gap: 6 }}>
            <ObjChip label="DRAGÓN" icon="dragon" nextAt={o.dragon.nextAt} alive={o.dragon.alive} gameTime={s.gameTime} />
            <ObjChip label="HERALDO" icon="herald" nextAt={o.herald.nextAt} alive={o.herald.alive} gameTime={s.gameTime} />
            <ObjChip label="BARÓN" icon="baron" nextAt={o.baron.nextAt} alive={o.baron.alive} gameTime={s.gameTime} />
          </div>
        )}

        {/* Aliados / Enemigos */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 3 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-dim)', borderBottom: '1px solid rgba(200,205,214,.2)', paddingBottom: 2 }}>
              ALIADOS · <span style={{ color: 'var(--text-soft)' }}>{sumK(allies)}</span>
            </div>
            {allies.map((p: any, i: number) => row(p, false, i))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 3 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--crimson)', borderBottom: '1px solid rgba(225,36,46,.35)', paddingBottom: 2, textAlign: 'right' }}>
              {sumK(enemies)} · ENEMIGOS
            </div>
            {enemies.map((p: any, i: number) => row(p, true, i))}
          </div>
        </div>
      </div>
    </div>
  );
}
