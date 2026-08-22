// Badges flotantes SOBRE las cards de augments de League (ARAM) — estilo
// Blitz: al detectarse la oferta (visión por iconos en el main), cada card
// recibe su chip con TIER + % de pickeo de la comunidad para tu campeón.
// La ventana es fullscreen, transparente y deja pasar los clics: el jugador
// selecciona la card del juego normalmente.
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Offer = {
  slot: number;
  x: number; y: number; // fracciones de pantalla
  augment: {
    id: number; name: string; tier: number;
    pickRate: number; performance: number; rarity: number;
  };
};

const TIER_STYLES = [
  { label: 'S', color: '#ffd25e' },
  { label: 'A', color: '#4dbb63' },
  { label: 'B', color: '#6db3ff' },
  { label: 'C', color: '#c9cdd6' },
  { label: 'D', color: '#ff5a64' },
];
const RARITY_RING = ['rgba(192,199,210,0.6)', 'rgba(255,210,94,0.75)', 'rgba(210,140,255,0.85)'];

export default function AugBadgesView() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  useEffect(() => window.atak.onAugOffers((o: Offer[] | null) => setOffers(o)), []);

  // Tier relativo entre lo ofrecido + el pool: usar el tier crudo ordenado
  // (menor = mejor). Con solo 3 cards, mapear por orden global estándar 3/4/5.
  const tierStyleOf = useMemo(() => {
    const present = [...new Set((offers ?? []).map((o) => o.augment.tier).filter((t) => t > 0))].sort((a, b) => a - b);
    return (tier: number) => {
      const i = present.indexOf(tier);
      return TIER_STYLES[i >= 0 ? Math.min(i, TIER_STYLES.length - 1) : TIER_STYLES.length - 1];
    };
  }, [offers]);

  // Mejor pick recomendado: menor tier; empate → más pickeado.
  const bestSlot = useMemo(() => {
    if (!offers?.length) return -1;
    const sorted = [...offers].sort((a, b) =>
      (a.augment.tier || 9) - (b.augment.tier || 9) || b.augment.pickRate - a.augment.pickRate);
    return sorted[0].slot;
  }, [offers]);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <AnimatePresence>
        {(offers ?? []).map((o) => {
          const t = tierStyleOf(o.augment.tier);
          const isBest = o.slot === bestSlot;
          return (
            <motion.div
              key={`${o.slot}-${o.augment.id}`}
              initial={{ opacity: 0, y: 14, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 26, delay: o.slot * 0.06 } }}
              exit={{ opacity: 0, y: 8, scale: 0.95, transition: { duration: 0.18 } }}
              style={{
                position: 'absolute',
                left: `${o.x * 100}%`,
                top: `${o.y * 100}%`,
                transform: 'translate(-50%, -100%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              {isBest && (
                <span style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
                  color: '#ffd25e', textShadow: '0 0 12px rgba(255,210,94,0.8)',
                }}>
                  ★ RECOMENDADO
                </span>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 12,
                background: 'rgba(8,8,11,0.92)',
                border: `1.5px solid ${isBest ? 'rgba(255,210,94,0.65)' : RARITY_RING[o.augment.rarity] ?? RARITY_RING[0]}`,
                boxShadow: isBest
                  ? '0 6px 24px rgba(0,0,0,0.6), 0 0 24px rgba(255,210,94,0.25)'
                  : '0 6px 24px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center',
                  font: '800 12px var(--font-data, monospace)', color: t.color,
                  background: `${t.color}22`, border: `1px solid ${t.color}66`,
                }}>
                  {t.label}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.augment.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
                    {o.augment.pickRate > 0 ? `${o.augment.pickRate}% de la comunidad` : 'poco pickeado'}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
