// Detector visual de la oferta de augments (ARAM) — estilo Blitz/Porofessor.
// El Live Client de Riot NO expone qué 3 augments te ofrece el juego, así que
// se identifican por VISIÓN: captura de pantalla → recorte del icono de cada
// card → comparación contra los iconos reales de CDragon (huella 16×16 en
// escala de grises). Con el match, el overlay pinta tier + pick% sobre la card.
import { desktopCapturer, screen, nativeImage } from 'electron';
import { EventEmitter } from 'node:events';
import type { AugmentBoardEntry } from './opgg.js';

const HASH_SIZE = 16;
/** Distancia máxima (0-1) para aceptar un match; calibrable con capturas reales. */
const MATCH_THRESHOLD = 0.22;
/** El mejor match debe ganarle al segundo por este margen (evita falsos). */
const MATCH_MARGIN = 0.03;

// Geometría RELATIVA de las 3 cards de augments (fracciones del tamaño de
// pantalla, medidas para el layout estándar 16:9). El icono grande vive en la
// parte alta de cada card. CALIBRABLE con un screenshot del usuario.
export const CARD_GEOM = {
  xs: [0.335, 0.5, 0.665],  // centros horizontales de las 3 cards
  iconY: 0.365,             // centro vertical del icono
  iconSize: 0.105,          // lado del icono como fracción de la ALTURA
  badgeY: 0.245,            // dónde flota el badge (sobre la card)
};

function grayVector(img: Electron.NativeImage): Float32Array | null {
  const resized = img.resize({ width: HASH_SIZE, height: HASH_SIZE, quality: 'good' });
  const bmp = resized.toBitmap(); // BGRA
  if (!bmp || bmp.length < HASH_SIZE * HASH_SIZE * 4) return null;
  const v = new Float32Array(HASH_SIZE * HASH_SIZE);
  let mean = 0;
  for (let i = 0; i < v.length; i++) {
    const o = i * 4;
    const g = 0.114 * bmp[o] + 0.587 * bmp[o + 1] + 0.299 * bmp[o + 2];
    v[i] = g;
    mean += g;
  }
  mean /= v.length;
  // Normalización (media 0, norma 1) → robusto a brillo/oscurecido del picker.
  let norm = 0;
  for (let i = 0; i < v.length; i++) { v[i] -= mean; norm += v[i] * v[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function dist(a: Float32Array, b: Float32Array): number {
  // 1 - correlación (0 = idéntico, ~1 = nada que ver).
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return (1 - dot) / 2;
}

export interface OfferMatch {
  slot: number;           // 0..2 (izquierda→derecha)
  x: number; y: number;   // fracciones de pantalla para posicionar el badge
  augment: AugmentBoardEntry;
  score: number;          // distancia del match (menor = más seguro)
}

export class AugmentDetector extends EventEmitter {
  private hashes = new Map<number, { vec: Float32Array; entry: AugmentBoardEntry }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private lastKey = '';

  /** Pre-computa las huellas de los iconos del pool (una vez por partida). */
  async prepare(board: AugmentBoardEntry[]): Promise<number> {
    this.hashes.clear();
    const withIcon = board.filter((a) => a.icon);
    await Promise.all(withIcon.map(async (entry) => {
      try {
        const res = await fetch(entry.icon);
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        const img = nativeImage.createFromBuffer(buf);
        if (img.isEmpty()) return;
        const vec = grayVector(img);
        if (vec) this.hashes.set(entry.id, { vec, entry });
      } catch { /* icono caído: ese augment no se podrá identificar */ }
    }));
    return this.hashes.size;
  }

  start(intervalMs = 1800) {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastKey = '';
    this.emit('offers', null);
  }

  private async tick() {
    if (this.busy || !this.hashes.size) return;
    this.busy = true;
    try {
      const { width, height } = screen.getPrimaryDisplay().size;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });
      const shot = sources[0]?.thumbnail;
      if (!shot || shot.isEmpty()) return;
      const size = shot.getSize();

      const iconPx = Math.round(CARD_GEOM.iconSize * size.height);
      const matches: OfferMatch[] = [];
      for (let slot = 0; slot < CARD_GEOM.xs.length; slot++) {
        const cx = Math.round(CARD_GEOM.xs[slot] * size.width);
        const cy = Math.round(CARD_GEOM.iconY * size.height);
        const crop = shot.crop({
          x: Math.max(0, cx - iconPx / 2),
          y: Math.max(0, cy - iconPx / 2),
          width: iconPx,
          height: iconPx,
        });
        const vec = grayVector(crop);
        if (!vec) continue;
        let best: { d: number; entry: AugmentBoardEntry } | null = null;
        let second = Infinity;
        for (const { vec: hv, entry } of this.hashes.values()) {
          const d = dist(vec, hv);
          if (!best || d < best.d) { second = best?.d ?? Infinity; best = { d, entry }; }
          else if (d < second) second = d;
        }
        if (best && best.d <= MATCH_THRESHOLD && second - best.d >= MATCH_MARGIN) {
          matches.push({
            slot,
            x: CARD_GEOM.xs[slot],
            y: CARD_GEOM.badgeY,
            augment: best.entry,
            score: Math.round(best.d * 1000) / 1000,
          });
        }
      }

      // Oferta real = al menos 2 cards identificadas a la vez (1 sola puede
      // ser un falso positivo del HUD). Solo emitir cuando CAMBIA.
      const key = matches.length >= 2 ? matches.map((m) => `${m.slot}:${m.augment.id}`).join('|') : '';
      if (key !== this.lastKey) {
        this.lastKey = key;
        this.emit('offers', key ? matches : null);
      }
    } catch { /* captura falló: reintenta en el siguiente tick */ }
    finally { this.busy = false; }
  }
}
