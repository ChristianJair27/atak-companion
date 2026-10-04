// Panel de augments de ARAM (F7) — estilo Blitz/Porofessor: cuando el juego
// te ofrece las cards de augments, este panel lateral muestra el TIER de cada
// augment CON tu campeón y el % de pickeo de la comunidad (OP.GG), con icono
// y rareza reales (CDragon). Ordenado de mejor a peor; buscador incluido.
import { useEffect, useMemo, useRef, useState } from 'react';

type Aug = {
  id: number; name: string; desc: string;
  tier: number; pickRate: number; performance: number;
  rarity: number; icon: string;
};

// El tier de OP.GG es RELATIVO por campeón (para ARAM suele usar 3/4/5):
// el mejor grupo presente se etiqueta S, el siguiente A, etc.
const TIER_STYLES = [
  { label: 'S', color: '#f0d891', bg: 'rgba(240,216,145,0.14)' },
  { label: 'A', color: '#3ddc97', bg: 'rgba(61,220,151,0.14)' },
  { label: 'B', color: '#6db3ff', bg: 'rgba(109,179,255,0.14)' },
  { label: 'C', color: '#b6b6c0', bg: 'rgba(182,182,192,0.12)' },
  { label: 'D', color: '#ff6b76', bg: 'rgba(255,107,118,0.12)' },
];
const RARITY_RING = ['rgba(215,217,222,0.6)', 'rgba(240,216,145,0.8)', 'rgba(210,140,255,0.85)']; // plata/oro/prismático
const RARITY_NAME = ['Plata', 'Oro', 'Prismático'];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function AugmentsView() {
  const [data, setData] = useState<{ ok: boolean; championName: string | null; augments: Aug[] } | null>(null);
  const [query, setQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<number | null>(null);
  const retryRef = useRef(0);

  const load = () => {
    window.atak.aramAugments()
      .then((d: any) => {
        setData(d);
        // El Live Client tarda unos segundos en dar el campeón al inicio.
        if (!d?.ok && retryRef.current < 5) {
          retryRef.current += 1;
          setTimeout(load, 3000);
        }
      })
      .catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const augments = data?.augments ?? [];
  // Mapeo relativo tier OP.GG → S/A/B…: el menor valor presente es S.
  const tierStyleOf = useMemo(() => {
    const present = [...new Set(augments.filter((a) => a.tier > 0).map((a) => a.tier))].sort((x, y) => x - y);
    const m = new Map<number, typeof TIER_STYLES[number]>();
    present.forEach((t, i) => m.set(t, TIER_STYLES[Math.min(i, TIER_STYLES.length - 1)]));
    return (tier: number) => m.get(tier) ?? { label: '·', color: 'var(--text-faint)', bg: 'transparent' };
  }, [augments]);
  const visible = useMemo(() => {
    const q = norm(query.trim());
    return augments.filter((a) =>
      (rarityFilter == null || a.rarity === rarityFilter)
      && (!q || norm(a.name).includes(q)),
    );
  }, [augments, query, rarityFilter]);

  return (
    <div
      className="panel"
      style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        position: 'relative', background: 'rgba(18,18,22,0.96)', overflow: 'hidden',
      }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, zIndex: 1, width: 44, height: 3, background: 'var(--crimson)' }} />
      {/* Header — zona de drag */}
      <div
        className="drag"
        style={{
          display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 14px 9px',
          borderBottom: '1px solid var(--ax-line)', flexShrink: 0,
          background: 'var(--ax-strip)',
          WebkitAppRegion: 'drag',
        } as any}
      >
        <span className="display" style={{ fontWeight: 800, fontStyle: 'italic', fontSize: 20, lineHeight: 1, letterSpacing: '0.02em', color: '#fff' }}>
          AUGMENTS · ARAM
        </span>
        {data?.championName && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)' }}>{data.championName}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>F7</span>
        <button
          className="no-drag"
          onClick={() => window.atak.win('hide')}
          style={{
            background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, padding: '4px 6px', alignSelf: 'center', WebkitAppRegion: 'no-drag',
          } as any}
          title="Ocultar (F7 para reabrir)"
        >
          ✕
        </button>
      </div>

      {/* Filtros */}
      <div className="no-drag" style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, alignItems: 'center' } as any}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar augment…"
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, height: 32, padding: '0 10px', fontSize: 13.5, fontFamily: 'var(--font-data)',
            background: 'var(--ax-strip)', border: '1px solid var(--ax-line)',
            borderRadius: 6, color: '#fff', outline: 'none',
          }}
        />
        {[null, 0, 1, 2].map((r) => (
          <button
            key={String(r)}
            onClick={() => setRarityFilter(r as number | null)}
            title={r == null ? 'Todas las rarezas' : RARITY_NAME[r as number]}
            style={{
              minWidth: 28, height: 28, borderRadius: 4, cursor: 'pointer', flexShrink: 0, padding: '0 6px',
              border: `1.5px solid ${r == null ? 'rgba(255,255,255,0.35)' : RARITY_RING[r as number]}`,
              background: rarityFilter === r ? 'rgba(255,255,255,0.16)' : 'transparent',
              color: '#fff', fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 700,
            }}
          >
            {r == null ? 'TODO' : ['P', 'O', 'PR'][r as number]}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 10px' }}>
        {!data ? (
          <p style={{ padding: 14, margin: 0, fontSize: 13.5, color: 'var(--text-soft)' }}>Cargando augments…</p>
        ) : !data.ok && !augments.length ? (
          <p style={{ padding: 14, margin: 0, fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.5 }}>
            Esperando datos del campeón… Este panel muestra tiers y pick rate de augments
            de <b>ARAM</b> para tu campeón (se llena al iniciar la partida).
          </p>
        ) : (
          <div className="anim-stagger">
            {visible.map((a) => {
              const t = tierStyleOf(a.tier);
              return (
                <div
                  key={a.id}
                  className="eog-row"
                  title={a.desc}
                  style={{
                    display: 'grid', gridTemplateColumns: '34px 1fr 28px 46px',
                    gap: 8, alignItems: 'center', padding: '6px 8px 6px 6px',
                    background: 'var(--ax-sub)',
                    borderLeft: `3px solid ${RARITY_RING[a.rarity] ?? RARITY_RING[0]}`,
                    borderRadius: 6, marginBottom: 4,
                  }}
                >
                  {a.icon ? (
                    <img
                      src={a.icon} alt="" loading="lazy"
                      style={{
                        width: 30, height: 30, borderRadius: 4, objectFit: 'cover',
                        background: 'rgba(0,0,0,0.4)',
                      }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                  ) : (
                    <span style={{ width: 30, height: 30, borderRadius: 4, background: 'var(--ax-sunken)' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, lineHeight: 1.2, fontWeight: 600, color: '#fff',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {a.name}
                    </div>
                    {/* Barra de popularidad — el ancho ES el pick rate */}
                    <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'var(--ax-sunken-2)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, a.pickRate)}%`, height: '100%',
                        background: t.color,
                      }} />
                    </div>
                  </div>
                  <span style={{
                    justifySelf: 'center', width: 26, height: 26, borderRadius: 4,
                    display: 'grid', placeItems: 'center',
                    font: '700 16px var(--font-display)', color: t.color, background: t.bg,
                    border: `1px solid ${t.color}55`,
                  }}>
                    {t.label}
                  </span>
                  <span style={{
                    textAlign: 'right', font: '700 13.5px var(--font-data)', color: 'var(--text)',
                  }}>
                    {a.pickRate > 0 ? `${a.pickRate}%` : '—'}
                  </span>
                </div>
              );
            })}
            {visible.length === 0 && (
              <p style={{ padding: 12, margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Sin resultados para ese filtro.</p>
            )}
          </div>
        )}
      </div>

      {/* Pie */}
      <div style={{
        padding: '7px 12px', borderTop: '1px solid var(--ax-line)', flexShrink: 0,
        fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-dim)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>TIER + % PICKEO CON TU CAMPEÓN · OP.GG</span>
        <span>borde = rareza</span>
      </div>
    </div>
  );
}
