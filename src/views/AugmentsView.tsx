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
  { label: 'S', color: '#ffd25e', bg: 'rgba(255,210,94,0.14)' },
  { label: 'A', color: '#4dbb63', bg: 'rgba(77,187,99,0.14)' },
  { label: 'B', color: '#6db3ff', bg: 'rgba(109,179,255,0.14)' },
  { label: 'C', color: '#c9cdd6', bg: 'rgba(201,205,214,0.12)' },
  { label: 'D', color: '#ff5a64', bg: 'rgba(255,90,100,0.12)' },
];
const RARITY_RING = ['rgba(192,199,210,0.55)', 'rgba(255,210,94,0.7)', 'rgba(210,140,255,0.8)']; // plata/oro/prismático
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
        background: 'rgba(10,10,12,0.94)', border: '1px solid rgba(200,205,214,0.14)',
        borderRadius: 14, overflow: 'hidden',
      }}
    >
      {/* Header — zona de drag */}
      <div
        className="drag"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderBottom: '1px solid rgba(200,205,214,0.1)', flexShrink: 0,
          background: 'linear-gradient(180deg, rgba(225,36,46,0.10), transparent)',
          WebkitAppRegion: 'drag',
        } as any}
      >
        <span className="display" style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.14em', color: '#fff' }}>
          AUGMENTS · ARAM
        </span>
        {data?.championName && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{data.championName}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>F7</span>
        <button
          className="no-drag"
          onClick={() => window.atak.win('hide')}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, padding: '2px 4px', WebkitAppRegion: 'no-drag',
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
            flex: 1, height: 28, padding: '0 10px', fontSize: 11.5,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,205,214,0.16)',
            borderRadius: 8, color: '#fff', outline: 'none',
          }}
        />
        {[null, 0, 1, 2].map((r) => (
          <button
            key={String(r)}
            onClick={() => setRarityFilter(r as number | null)}
            title={r == null ? 'Todas las rarezas' : RARITY_NAME[r as number]}
            style={{
              width: 24, height: 24, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
              border: `1.5px solid ${r == null ? 'rgba(255,255,255,0.35)' : RARITY_RING[r as number]}`,
              background: rarityFilter === r ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: '#fff', fontSize: 9, fontWeight: 800,
            }}
          >
            {r == null ? '✦' : ['P', 'O', 'PR'][r as number]}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 10px' }}>
        {!data ? (
          <p style={{ padding: 14, fontSize: 12, color: 'var(--text-dim)' }}>Cargando augments…</p>
        ) : !data.ok && !augments.length ? (
          <p style={{ padding: 14, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
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
                    display: 'grid', gridTemplateColumns: '34px 1fr 30px 52px',
                    gap: 8, alignItems: 'center', padding: '6px 6px',
                    background: 'rgba(255,255,255,0.028)',
                    borderLeft: `2px solid ${RARITY_RING[a.rarity] ?? RARITY_RING[0]}`,
                    borderRadius: 6, marginBottom: 4,
                  }}
                >
                  {a.icon ? (
                    <img
                      src={a.icon} alt="" loading="lazy"
                      style={{
                        width: 30, height: 30, borderRadius: 7, objectFit: 'cover',
                        boxShadow: `0 0 0 1.5px ${RARITY_RING[a.rarity] ?? RARITY_RING[0]}`,
                        background: 'rgba(0,0,0,0.4)',
                      }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                  ) : (
                    <span style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.06)' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 11.5, fontWeight: 700, color: '#fff',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {a.name}
                    </div>
                    {/* Barra de popularidad — el ancho ES el pick rate */}
                    <div style={{ marginTop: 3, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, a.pickRate)}%`, height: '100%',
                        background: `linear-gradient(90deg, ${t.color}88, ${t.color})`,
                      }} />
                    </div>
                  </div>
                  <span style={{
                    justifySelf: 'center', width: 22, height: 22, borderRadius: 6,
                    display: 'grid', placeItems: 'center',
                    font: '800 11px var(--font-data)', color: t.color, background: t.bg,
                    border: `1px solid ${t.color}55`,
                  }}>
                    {t.label}
                  </span>
                  <span style={{
                    textAlign: 'right', font: '700 11px var(--font-data)', color: 'var(--text-soft)',
                  }}>
                    {a.pickRate > 0 ? `${a.pickRate}%` : '—'}
                  </span>
                </div>
              );
            })}
            {visible.length === 0 && (
              <p style={{ padding: 12, fontSize: 11.5, color: 'var(--text-faint)' }}>Sin resultados para ese filtro.</p>
            )}
          </div>
        )}
      </div>

      {/* Pie */}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid rgba(200,205,214,0.08)', flexShrink: 0,
        fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-faint)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>TIER + % PICKEO CON TU CAMPEÓN · OP.GG</span>
        <span>borde = rareza</span>
      </div>
    </div>
  );
}
