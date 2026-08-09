// src/views/ChampSelectView.tsx — Selección de campeón 380×640 (diseño 1b).
// Tolerante al formato del payload champion-build: renderiza solo lo que venga.
import { useEffect, useState, type ReactNode } from 'react';
import { ChampIcon, champIconUrl, fmtClock, itemIconUrl, posEs, usePatch, type PatchInfo } from './shared';

const asArray = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const asText = (v: any): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v?.name ?? v?.id ?? '';
const asItemId = (v: any): number | null => {
  const n = typeof v === 'number' ? v : Number(v?.id ?? v?.itemId ?? v?.itemID ?? v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function Sep() {
  return <div className="hr hr-soft" />;
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="label" style={{ letterSpacing: '0.2em', marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}

function RuneDot({ label, hot, size = 20 }: { label: string; hot?: boolean; size?: number }) {
  return (
    <span
      title={label}
      style={{
        width: size, height: size, borderRadius: '50%', background: '#1e2026', flex: 'none',
        boxShadow: `0 0 0 1px ${hot ? '#E1242E' : '#6f7480'}`,
        display: 'grid', placeItems: 'center',
        font: `700 ${Math.round(size * 0.42)}px var(--font-data)`,
        color: hot ? '#ff9aa0' : '#c9cdd6',
      }}
    >
      {(label || '?').charAt(0).toUpperCase()}
    </span>
  );
}

function ItemBox({ patch, item, core }: { patch: PatchInfo | null; item: any; core?: boolean }) {
  const id = asItemId(item);
  const url = id != null ? itemIconUrl(patch, id) : null;
  const name = asText(item);
  return (
    <span className={`item${core ? ' core' : ''}`} style={{ width: 26, height: 26 }} title={name || String(id ?? '')}>
      {url ? <img src={url} alt={name} /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

const Arrow = ({ color = '#E1242E' }: { color?: string }) => (
  <svg width="12" height="10" viewBox="0 0 12 10">
    <path d="M2 5 H9 M6 1.5 L10 5 L6 8.5" stroke={color} strokeWidth="1.4" fill="none" />
  </svg>
);

const PHASES: Array<{ label: string; match: string[] }> = [
  { label: 'PLANEACIÓN', match: ['PLANNING'] },
  { label: 'BANEOS', match: ['BAN_PICK_BAN'] },
  { label: 'PICKS', match: ['BAN_PICK'] },
  { label: 'FINAL', match: ['FINALIZATION', 'GAME_STARTING'] },
];

export default function ChampSelectView() {
  const patch = usePatch();
  const [cs, setCs] = useState<any>(null);
  const [build, setBuild] = useState<any>(null);
  useEffect(() => {
    const offs = [
      window.atak.onChampSelect(setCs),
      window.atak.onChampionBuild(setBuild),
      window.atak.onChampionBuildLoading((p: any) => setBuild({ loading: true, ...p })),
      window.atak.onChampionBuildError((p: any) => setBuild({ error: p?.error || 'Error al cargar la build' })),
      window.atak.onChampSelectEnded(() => { setCs(null); setBuild(null); }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const phase: string = cs?.phase || '';
  const activePhase = PHASES.findIndex((p) => p.match.includes(phase));
  const idx = activePhase >= 0 ? activePhase : phase ? 2 : -1;

  const runes = build?.runes;
  const items = build?.items;
  const tips = asArray(build?.tips).map(asText).filter(Boolean);
  const skill = build?.skillOrder;
  const skillSeq: string[] = Array.isArray(skill) ? skill.map(asText).filter(Boolean) : [];
  const skillPrio = typeof skill === 'string' ? skill : '';
  const counters = build?.counters;
  const strong = asArray(counters?.strongAgainst ?? counters?.strong ?? build?.strongAgainst).map(asText).filter(Boolean);
  const weak = asArray(counters?.weakAgainst ?? counters?.weak ?? build?.weakAgainst).map(asText).filter(Boolean);
  const winrate = build?.winrate ?? build?.winRate ?? build?.wr;
  const wrTxt = winrate != null && winrate !== '' ? `WR ${String(winrate).replace('%', '')}%` : null;
  const name: string = asText(build?.name) || '';
  const heroIcon = name ? champIconUrl(patch, name) : null;

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden', background: '#0A0A0C',
        border: '1px solid rgba(200,205,214,.18)', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Barra de fases */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px 7px', borderBottom: '1px solid rgba(200,205,214,.14)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {PHASES.map((p, i) => (
            <span key={p.label} style={{ display: 'contents' }}>
              <span
                style={{
                  fontSize: 9.5, letterSpacing: '0.1em',
                  color: i === idx ? '#fff' : 'var(--text-faint)',
                  borderBottom: i === idx ? '2px solid var(--crimson)' : 'none',
                  paddingBottom: i === idx ? 1 : 0,
                }}
              >
                {p.label}
              </span>
              {i < PHASES.length - 1 && <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />}
            </span>
          ))}
        </div>
        <span
          className="mono badge-glow"
          style={{ marginLeft: 10, fontWeight: 700, fontSize: 13, color: 'var(--crimson)', border: '1px solid rgba(225,36,46,.5)', padding: '1px 7px' }}
        >
          {cs ? fmtClock(cs.timerSecs ?? 0) : '—'}
        </span>
      </div>

      {/* Hero del campeón */}
      <div style={{ position: 'relative', height: 104, background: 'linear-gradient(100deg,#2c0d11 0%,#160a0c 55%,#0A0A0C 100%)', overflow: 'hidden', flex: 'none' }}>
        <div style={{ position: 'absolute', right: -30, top: -40, width: 200, height: 200, background: 'radial-gradient(circle,rgba(225,36,46,.28),transparent 65%)' }} />
        {heroIcon ? (
          <img
            src={heroIcon}
            alt=""
            style={{ position: 'absolute', right: -10, top: -10, width: 130, height: 130, objectFit: 'cover', opacity: 0.28, maskImage: 'linear-gradient(120deg,transparent 5%,#000 45%)', WebkitMaskImage: 'linear-gradient(120deg,transparent 5%,#000 45%)' }}
          />
        ) : (
          <div className="display" style={{ position: 'absolute', right: 14, top: 12, fontWeight: 800, fontSize: 76, color: 'rgba(255,255,255,.06)', lineHeight: 1 }}>
            {(name || 'A').charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ position: 'absolute', left: 14, bottom: 12 }}>
          <div className="metal-text-bright" style={{ fontWeight: 700, fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {name || 'ELIGE CAMPEÓN'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
            {cs?.localPlayerPosition && (
              <span style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--text-soft)' }}>{posEs(cs.localPlayerPosition)}</span>
            )}
            {wrTxt && <span className="badge badge-silver skew" style={{ '--skew': '5px', fontSize: 11, padding: '1px 8px' } as any}>{wrTxt}</span>}
            {patch?.version && <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>Parche {patch.version}</span>}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 }} className="hr-red" />
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, overflow: 'hidden auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {build?.loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" />
            <span className="label">CARGANDO BUILD{name ? ` DE ${name.toUpperCase()}` : ''}…</span>
          </div>
        )}
        {build?.error && (
          <div className="tip hot" style={{ color: 'var(--crimson-soft)' }}>{String(build.error)}</div>
        )}
        {!build && (
          <div className="label" style={{ color: 'var(--text-faint)' }}>
            SELECCIONA UN CAMPEÓN PARA VER RUNAS, BUILD Y CONSEJOS.
          </div>
        )}

        {/* Runas */}
        {runes && (
          <>
            <Section
              title={`RUNAS${runes.primaryPath ? ` · ${String(asText(runes.primaryPath)).toUpperCase()}` : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  title={asText(runes.keystone)}
                  style={{
                    width: 44, height: 44, borderRadius: '50%', flex: 'none',
                    background: 'radial-gradient(circle at 35% 30%,#3a1216,#12080a)',
                    display: 'grid', placeItems: 'center',
                    boxShadow: '0 0 0 2px #9ba0ab, 0 0 12px rgba(225,36,46,.5)',
                    font: '700 17px var(--font-display)', color: 'var(--crimson)',
                  }}
                >
                  {(asText(runes.keystone) || 'R').charAt(0).toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {asArray(runes.primary).map((r, i) => <RuneDot key={i} label={asText(r)} hot={i === 0} />)}
                  </div>
                  {asArray(runes.secondary).length > 0 && (
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>SEC</span>
                      {asArray(runes.secondary).map((r, i) => <RuneDot key={i} label={asText(r)} size={16} />)}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[asText(runes.keystone), ...asArray(runes.primary).map(asText)].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              {asArray(runes.shards).length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>FRAGMENTOS</span>
                  {asArray(runes.shards).map((sh, i) => (
                    <span key={i} style={{ fontSize: 10, color: 'var(--text-soft)', background: 'rgba(255,255,255,.06)', padding: '1px 7px' }}>
                      {asText(sh)}
                    </span>
                  ))}
                </div>
              )}
            </Section>
            <Sep />
          </>
        )}

        {/* Build recomendada */}
        {items && (asArray(items.starter).length > 0 || asArray(items.core).length > 0 || asArray(items.boots).length > 0) && (
          <>
            <Section title="BUILD RECOMENDADA">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {asArray(items.starter).map((it, i) => <ItemBox key={`s${i}`} patch={patch} item={it} />)}
                {asArray(items.starter).length > 0 && asArray(items.core).length > 0 && <Arrow />}
                {asArray(items.core).map((it, i) => <ItemBox key={`c${i}`} patch={patch} item={it} core />)}
                {asArray(items.boots).length > 0 && <Arrow color="#9ba0ab" />}
                {asArray(items.boots).map((it, i) => <ItemBox key={`b${i}`} patch={patch} item={it} />)}
              </div>
              <div style={{ display: 'flex', marginTop: 4, fontSize: 9.5, color: 'var(--text-faint)', letterSpacing: '0.06em', justifyContent: 'space-between' }}>
                <span>{asArray(items.starter).length > 0 ? 'INICIO' : ''}</span>
                <span>{asArray(items.core).length > 0 ? 'NÚCLEO' : ''}</span>
                <span>{asArray(items.boots).length > 0 ? 'BOTAS' : ''}</span>
              </div>
            </Section>
            <Sep />
          </>
        )}

        {/* Orden de habilidades */}
        {(skillSeq.length > 0 || skillPrio) && (
          <>
            <Section title={`ORDEN DE HABILIDADES${skillPrio ? ` · ${skillPrio}` : ''}`}>
              {skillSeq.length > 3 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(18, skillSeq.length)},1fr)`, gap: 2 }}>
                  {skillSeq.slice(0, 18).map((k, i) => {
                    const K = k.toUpperCase();
                    return <span key={i} className={`sk${K === 'R' ? ' r' : K === skillSeq[0]?.toUpperCase() ? ' q' : ''}`}>{K}</span>;
                  })}
                </div>
              ) : skillSeq.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {skillSeq.map((k, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      <span className={`sk${i === 0 ? ' q' : ''}`} style={{ width: 22 }}>{k.toUpperCase()}</span>
                      {i < skillSeq.length - 1 && <Arrow color="#9ba0ab" />}
                    </span>
                  ))}
                </div>
              ) : null}
            </Section>
            <Sep />
          </>
        )}

        {/* Counters */}
        {(strong.length > 0 || weak.length > 0) && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-dim)', marginBottom: 4 }}>FUERTE CONTRA</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {strong.map((c, i) => (
                    <ChampIcon key={i} patch={patch} name={c} size={22} style={{ boxShadow: '0 0 0 1px #4d6b52' }} />
                  ))}
                </div>
              </div>
              <div style={{ width: 1, background: 'linear-gradient(180deg,transparent,#6f7480,transparent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--crimson)', marginBottom: 4 }}>DÉBIL CONTRA</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {weak.map((c, i) => (
                    <ChampIcon key={i} patch={patch} name={c} size={22} enemy style={{ boxShadow: '0 0 0 1px #E1242E' }} />
                  ))}
                </div>
              </div>
            </div>
            <Sep />
          </>
        )}

        {/* Consejos */}
        {tips.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="label" style={{ letterSpacing: '0.2em' }}>CONSEJOS</div>
            {tips.map((t, i) => (
              <div key={i} className={`tip${i === 0 ? ' hot' : ''}`}>{t}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
