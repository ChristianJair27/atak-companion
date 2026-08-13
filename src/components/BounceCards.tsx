// BounceCards — adaptado de React Bits (https://reactbits.dev/components/bounce-cards)
// Cards que entran con bounce + hover lift. Usado para sugerencias de pick.
//
// OJO (bug corregido): antes esto usaba `animate={useAnimation()}` junto con
// `whileHover`. Framer Motion no puede leer valores de un AnimationControls, así
// que al SALIR del hover revertía a los valores de `initial` — scale 0 — y la
// card desaparecía. Con un target declarativo en `animate` el hover vuelve a su
// sitio. La rotación también vive ahora en el motion value `rotate` y no en un
// `transform` de CSS, que Motion pisaba de todas formas.
import { type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface BounceCardItem {
  key: string;
  /** URL de imagen o nodo custom */
  image?: string | null;
  content?: ReactNode;
  label?: string;
  sublabel?: string;
  title?: string;
  selected?: boolean;
  onClick?: () => void;
}

export interface BounceCardsProps {
  items: BounceCardItem[];
  className?: string;
  style?: CSSProperties;
  /** Ancho de cada card */
  cardWidth?: number;
  cardHeight?: number;
  /** Rotación en grados por índice (se cicla). */
  rotations?: number[];
  /** Desplazamiento vertical de reposo por índice, en px (se cicla). */
  lifts?: number[];
  animationDelay?: number;
  animationStagger?: number;
  enableHover?: boolean;
}

const DEFAULT_ROTATIONS = [4, -3, 2.5, -2, 3, -4];
const DEFAULT_LIFTS = [4, 0, 2, 6, 1, 3];

export default function BounceCards({
  items,
  className,
  style,
  cardWidth = 88,
  cardHeight = 112,
  rotations = DEFAULT_ROTATIONS,
  lifts = DEFAULT_LIFTS,
  animationDelay = 0.08,
  animationStagger = 0.07,
  enableHover = true,
}: BounceCardsProps) {
  if (!items.length) return null;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 10,
        flexWrap: 'wrap',
        position: 'relative',
        // El hover levanta y escala la card: sin este colchón el panel la corta.
        padding: '14px 2px 4px',
        ...style,
      }}
    >
      {items.map((item, i) => {
        const rot = rotations.length ? rotations[i % rotations.length] : 0;
        const rest = lifts.length ? lifts[i % lifts.length] : 0;
        const clickable = Boolean(item.onClick);
        const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
          if (!clickable) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.onClick?.();
          }
        };
        return (
          <motion.div
            key={item.key}
            title={item.title || item.label || undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={clickable ? Boolean(item.selected) : undefined}
            onKeyDown={onKeyDown}
            initial={{ scale: 0, opacity: 0, y: 28 + rest, rotate: rot }}
            animate={{ scale: 1, opacity: 1, y: rest, rotate: rot }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 18,
              delay: i * animationStagger + animationDelay,
            }}
            whileHover={
              enableHover
                ? {
                    scale: 1.12,
                    y: rest - 10,
                    rotate: 0,
                    zIndex: 5,
                    // Sin este transition propio, el hover heredaría el delay del
                    // stagger de entrada y la última card tardaría en reaccionar.
                    transition: { type: 'spring', stiffness: 400, damping: 26, delay: 0 },
                  }
                : undefined
            }
            whileTap={clickable ? { scale: 1.04 } : undefined}
            style={{
              width: cardWidth,
              height: cardHeight,
              transformOrigin: 'center bottom',
              borderRadius: 10,
              overflow: 'hidden',
              cursor: clickable ? 'pointer' : 'default',
              position: 'relative',
              background: 'linear-gradient(160deg, #1c1e28, #0a0b10)',
              border: item.selected
                ? '1px solid rgba(225,36,46,.9)'
                : '1px solid rgba(200,170,110,.35)',
              boxShadow: item.selected
                ? '0 10px 22px rgba(0,0,0,.5), 0 0 16px rgba(225,36,46,.45)'
                : '0 10px 22px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.3)',
              flex: 'none',
            }}
            onClick={item.onClick}
          >
            {item.content ? (
              item.content
            ) : item.image ? (
              <img
                src={item.image}
                alt={item.label || ''}
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
              />
            ) : null}

            {(item.label || item.sublabel) && (
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '16px 5px 5px',
                background: 'linear-gradient(transparent, rgba(0,0,0,.92))',
                pointerEvents: 'none',
              }}>
                {item.label && (
                  <div style={{
                    fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.04em',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
                  }}>
                    {item.label}
                  </div>
                )}
                {item.sublabel && (
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: '#c8aa6e', textAlign: 'center', marginTop: 1,
                  }}>
                    {item.sublabel}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
