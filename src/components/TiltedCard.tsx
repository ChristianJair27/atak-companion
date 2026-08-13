// TiltedCard — adaptado de React Bits (https://reactbits.dev/components/tilted-card)
// 3D tilt al hover/mouse. Sin Tailwind: estilos ATAK.
import { useRef, useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const spring = { damping: 28, stiffness: 360, mass: 0.45 };

export interface TiltedCardProps {
  imageSrc?: string | null;
  altText?: string;
  captionText?: string;
  containerHeight?: string | number;
  containerWidth?: string | number;
  imageHeight?: string | number;
  imageWidth?: string | number;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  showMobileWarning?: boolean;
  showTooltip?: boolean;
  overlayContent?: ReactNode;
  displayOverlayContent?: boolean;
  style?: CSSProperties;
  className?: string;
  /** Contenido custom en lugar de imageSrc (p.ej. ChampIcon). */
  children?: ReactNode;
}

export default function TiltedCard({
  imageSrc,
  altText = 'card',
  captionText = '',
  containerHeight = '100%',
  containerWidth = '100%',
  imageHeight = '100%',
  imageWidth = '100%',
  scaleOnHover = 1.06,
  rotateAmplitude = 12,
  showTooltip = true,
  overlayContent = null,
  displayOverlayContent = true,
  style,
  className,
  children,
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), spring);
  const rotateY = useSpring(useMotionValue(0), spring);
  const scale = useSpring(1, spring);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, { stiffness: 280, damping: 24, mass: 0.6 });
  const [lastY, setLastY] = useState(0);

  function handleMove(e: MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    const rX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rY = (offsetX / (rect.width / 2)) * rotateAmplitude;
    rotateX.set(rX);
    rotateY.set(rY);
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
    const vY = offsetY - lastY;
    rotateFigcaption.set(-vY * 0.5);
    setLastY(offsetY);
  }

  function handleEnter() {
    scale.set(scaleOnHover);
    opacity.set(1);
  }

  function handleLeave() {
    opacity.set(0);
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    rotateFigcaption.set(0);
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        height: containerHeight,
        width: containerWidth,
        perspective: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        ...style,
      }}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <motion.div
        style={{
          width: imageWidth,
          height: imageHeight,
          rotateX,
          rotateY,
          scale,
          position: 'relative',
          transformStyle: 'preserve-3d',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'linear-gradient(145deg, #1a1c24, #0c0d12)',
          border: '1px solid rgba(200,170,110,.25)',
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        }}
      >
        {children ? (
          <div style={{ width: '100%', height: '100%' }}>{children}</div>
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt={altText}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
              display: 'block',
              willChange: 'transform',
              transform: 'translateZ(0)',
            }}
            draggable={false}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.15)', fontSize: 22 }}>⬡</div>
        )}

        {displayOverlayContent && overlayContent && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, transform: 'translateZ(24px)', pointerEvents: 'none' }}>
            {overlayContent}
          </div>
        )}
      </motion.div>

      {showTooltip && captionText && (
        <motion.div
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            left: 0,
            top: 0,
            x,
            y,
            opacity,
            rotate: rotateFigcaption,
            zIndex: 3,
            background: 'rgba(10,10,12,.9)',
            color: '#c8aa6e',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid rgba(200,170,110,.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {captionText}
        </motion.div>
      )}
    </div>
  );
}
