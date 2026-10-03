// src/motion.tsx — lenguaje de movimiento común de todas las vistas.
// Reglas: solo opacity / transform / width; easing único; nada de bounce.
// prefers-reduced-motion: App envuelve todo en <MotionConfig reducedMotion="user">
// (framer anula transform y deja opacity); lo que anima width o números se
// corta aquí a mano con useReducedMotion.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animate, motion, useReducedMotion, type Variants } from 'framer-motion';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Bloque que sube 8px y aparece (hijo de <Stagger> o suelto con initial/animate). */
export const rise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25, ease: EASE } },
};

/** Variants de contenedor: reparte la entrada de los hijos con stagger. */
export const staggerParent = (step = 0.04, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

/** Panel de tab / sección intercambiable (usar dentro de <AnimatePresence mode="wait">). */
export const swap = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: EASE } },
};

type BoxProps = { children?: ReactNode; className?: string; style?: CSSProperties };

/** Contenedor que anima la entrada de sus <Rise> hijos una sola vez al montar. */
export function Stagger({ children, className, style, step = 0.04, delay = 0 }: BoxProps & { step?: number; delay?: number }) {
  return (
    <motion.div className={className} style={style} variants={staggerParent(step, delay)} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

/** Hijo de <Stagger>. Fuera de un Stagger pasa `solo` para que se anime por su cuenta. */
export function Rise({ children, className, style, solo, delay = 0 }: BoxProps & { solo?: boolean; delay?: number }) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={delay ? { hidden: rise.hidden, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay } } } : rise}
      {...(solo ? { initial: 'hidden', animate: 'show' } : null)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Relleno de barra: width de 0 al valor en 500ms al montar; después sigue al
 * valor sin reiniciarse (re-render con el mismo pct no reanima).
 */
export function BarFill({ pct, className, style, duration = 0.5, delay = 0 }: {
  pct: number; className?: string; style?: CSSProperties; duration?: number; delay?: number;
}) {
  const reduce = useReducedMotion();
  const w = `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <motion.i
      className={className}
      style={{ display: 'block', height: '100%', ...style }}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: w }}
      transition={reduce ? { duration: 0 } : { duration, ease: EASE, delay }}
    />
  );
}

/** Número que cuenta hasta su valor cuando cambia (tabular-nums para que no baile). */
export function Ticker({ value, format = (n) => String(Math.round(n)), duration = 0.5, className, style }: {
  value: number; format?: (n: number) => string; duration?: number; className?: string; style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || from.current === value) { from.current = value; setShown(value); return; }
    const ctl = animate(from.current, value, {
      duration, ease: EASE,
      onUpdate: (v) => setShown(v),
      onComplete: () => { from.current = value; },
    });
    return () => { from.current = value; ctl.stop(); };
  }, [value, duration, reduce]);
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{format(shown)}</span>;
}

/**
 * Texto que entra carácter a carácter (stagger 40ms, 4px, blur 2px que se limpia).
 * Cambia `id` para volver a animar (p.ej. al enfocar otro jugador).
 */
export function Digits({ id, parts, className, style }: {
  id: string | number;
  parts: Array<{ text: string; color?: string }>;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  let n = 0;
  return (
    <span key={id} className={className} style={{ display: 'inline-flex', fontVariantNumeric: 'tabular-nums', ...style }} aria-label={parts.map((p) => p.text).join('')}>
      {parts.map((p, pi) =>
        Array.from(p.text).map((ch, ci) => {
          const i = n++;
          return (
            <motion.span
              key={`${pi}-${ci}`}
              aria-hidden
              style={{ display: 'inline-block', color: p.color, whiteSpace: 'pre' }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.25, ease: EASE, delay: reduce ? 0 : i * 0.04 }}
            >
              {ch}
            </motion.span>
          );
        }),
      )}
    </span>
  );
}

/** Valor que hace un parpadeo corto (fade + 4px) cada vez que cambia. Para marcadores en vivo. */
export function Blip({ value, className, style }: { value: string | number; className?: string; style?: CSSProperties }) {
  return (
    <motion.span
      key={String(value)}
      className={className}
      style={{ display: 'inline-block', fontVariantNumeric: 'tabular-nums', ...style }}
      initial={{ opacity: 0.2, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      {value}
    </motion.span>
  );
}
