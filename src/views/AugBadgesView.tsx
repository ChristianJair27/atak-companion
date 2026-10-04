// Barras flotantes SOBRE las cards de augments de League (ARAM / Arena).
// Al detectarse la oferta (visión por iconos en el main), cada card recibe
// encima una barra de progreso con el % de pickeo de la comunidad para TU
// campeón y la sinergia (tier OP.GG con ese campeón). La ventana es fullscreen,
// transparente y deja pasar los clics: el jugador elige la card del juego.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EASE } from '../motion';

type Offer = {
  slot: number;
  x: number; y: number; // fracciones de pantalla
  augment: {
    id: number; name: string; tier: number;
    pickRate: number; performance: number; rarity: number;
  };
};
type Payload = { matches: Offer[]; championName: string } | Offer[] | null;

// Sinergia con el campeón = tier OP.GG del augment PARA ese campeón (1 = OP).
const SYNERGY = [
  { min: 0, label: 'SINERGIA ALTA', color: '#3ddc97' },
  { min: 3, label: 'BUENA SINERGIA', color: '#6db3ff' },
  { min: 4, label: 'SINERGIA MEDIA', color: '#f5a524' },
  { min: 5, label: 'SINERGIA BAJA', color: '#ff6b76' },
];
const synergyOf = (tier: number) => {
  if (!tier) return { label: 'SIN DATOS', color: '#8c8c98' };
  let out = SYNERGY[0];
  for (const s of SYNERGY) if (tier >= s.min) out = s;
  return out;
};
const RARITY = ['PLATA', 'ORO', 'PRISMÁTICO'];

export default function AugBadgesView() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [champion, setChampion] = useState('');
  const reduce = useReducedMotion();
  useEffect(() => window.atak.onAugOffers((p: Payload) => {
    if (!p) { setOffers(null); return; }
    if (Array.isArray(p)) { setOffers(p); return; }
    setOffers(p.matches);
    setChampion(p.championName || '');
  }), []);

  // Mejor pick: menor tier con tu campeón; empate → más pickeado.
  const bestSlot = useMemo(() => {
    if (!offers?.length) return -1;
    const sorted = [...offers].sort((a, b) =>
      (a.augment.tier || 9) - (b.augment.tier || 9) || b.augment.pickRate - a.augment.pickRate);
    return sorted[0].slot;
  }, [offers]);
  const maxPick = Math.max(1, ...(offers ?? []).map((o) => o.augment.pickRate));

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', fontFamily: 'var(--ax-data)' }}>
      <AnimatePresence>
        {(offers ?? []).map((o) => {
          const syn = synergyOf(o.augment.tier);
          const isBest = o.slot === bestSlot;
          const pick = Math.max(0, Math.min(100, o.augment.pickRate));
          return (
            <motion.div
              key={`${o.slot}-${o.augment.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE, delay: o.slot * 0.08 } }}
              exit={{ opacity: 0, y: 6, transition: { duration: 0.15, ease: EASE } }}
              style={{
                position: 'absolute',
                left: `${o.x * 100}%`,
                top: `${o.y * 100}%`,
                transform: 'translate(-50%, -100%)',
                width: 'min(300px, 22vw)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              {isBest && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.5 } }}
                  style={{
                    padding: '2px 9px', borderRadius: 4, background: '#c8aa6e',
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#17130a',
                  }}
                >
                  RECOMENDADO
                </motion.span>
              )}
              <div style={{
                width: '100%',
                padding: '10px 12px 12px', borderRadius: 10,
                background: 'rgba(18,18,22,0.96)',
                border: `1px solid ${isBest ? '#c8aa6e' : 'rgba(255,255,255,0.14)'}`,
                boxShadow: '0 12px 28px -10px rgba(0,0,0,0.85)',
                color: '#f5f5f6',
              }}>
                {/* Nombre + rareza */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--ax-display)', fontSize: 19, lineHeight: 1.1, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.augment.name}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#8c8c98', flex: 'none' }}>
                    {RARITY[o.augment.rarity] ?? ''}
                  </span>
                </div>

                {/* Sinergia con el campeón en uso */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11.5, letterSpacing: '0.08em', color: syn.color, fontWeight: 700 }}>
                    {syn.label}{champion ? ` · ${champion.toUpperCase()}` : ''}
                  </span>
                  {o.augment.performance > 0 && (
                    <span style={{ fontSize: 11.5, color: '#b6b6c0', fontVariantNumeric: 'tabular-nums' }}>
                      rendimiento {o.augment.performance}
                    </span>
                  )}
                </div>

                {/* Barra de % de pickeo (ancho relativo al 100%; brillo relativo a la oferta) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <span style={{ flex: 1, height: 6, borderRadius: 2, background: '#272730', overflow: 'hidden' }}>
                    <motion.i
                      style={{ display: 'block', height: '100%', borderRadius: 2, background: syn.color, opacity: 0.55 + 0.45 * (pick / maxPick) }}
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${Math.max(pick, 2)}%` }}
                      transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: 0.15 + o.slot * 0.08 }}
                    />
                  </span>
                  <span style={{ fontFamily: 'var(--ax-display)', fontSize: 22, lineHeight: 1, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'right' }}>
                    {pick > 0 ? `${pick}%` : '<1%'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#8c8c98', marginTop: 3 }}>
                  de pickeo de la comunidad{champion ? ` con ${champion}` : ''}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
