// electron/services/hud-objectives.ts — lector del HUD del espectador.
//
// El cliente de League en modo espectador NO emite DragonKill/HordeKill/
// HeraldKill/BaronKill por la Live Client API (comprobado con partidas enteras).
// La barra superior del espectador sí los PINTA: iconos de dragón por tipo,
// contador de larvas, heraldo y barón de cada equipo. Este servicio captura la
// pantalla del caster cada pocos segundos (igual que el detector de augments de
// Arena), lee esa barra por color y por cambio de píxeles, y emite eventos
// equivalentes a los del Live Client. Sin leer memoria del juego, sin OCR
// pesado: solo captura de pantalla, que Vanguard no toca.
//
// Geometría: fracciones de pantalla (1920×1080 de referencia). Se puede
// sobrescribir con <userData>/hud-geom.json sin recompilar, y "Guardar captura
// del HUD" deja un PNG para calibrarla. Detección:
//  - dragones: por casilla, saturación alta = icono presente; el tono (hue)
//    decide el tipo (infernal/montaña/océano/nubes/hextech/químico); el anciano
//    se reconoce por su brillo blanco-azul.
//  - larvas: cuando el número cambia de forma estable (2 lecturas seguidas) se
//    cuenta UNA larva más (solo suben).
//  - heraldo/barón: icono que pasa de apagado a encendido = objetivo tomado.
// Cada cambio debe repetirse en 2 capturas seguidas para descartar parpadeos.
import { desktopCapturer, screen, nativeImage } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export type Side = 'blue' | 'red';
export type DragonType = 'Fire' | 'Earth' | 'Water' | 'Air' | 'Hextech' | 'Chemtech' | 'Elder';
export interface Box { x: number; y: number; w: number; h: number } // fracciones de pantalla
export interface HudGeom {
  /** Casillas de dragón de cada lado, de la más cercana al centro hacia afuera. */
  dragons: Record<Side, Box[]>;
  /** Número de larvas (el dígito junto al icono). */
  grubs: Record<Side, Box>;
  herald: Record<Side, Box>;
  baron: Record<Side, Box>;
  /** Umbral de saturación (0-1) para "hay icono". */
  satOn: number;
}

// Medido sobre capturas del stream LQC a 1920×1080 (HUD del espectador por
// defecto): fila de dragones a y≈72 px, azul de x≈773 hacia la izquierda del
// centro y rojo espejado. Larvas/heraldo/barón van con la misma fila: se
// afinan con la captura de calibración.
const px = (x: number, y: number, w: number, h: number): Box => ({ x: x / 1920, y: y / 1080, w: w / 1920, h: h / 1080 });
export const DEFAULT_GEOM: HudGeom = {
  dragons: {
    blue: [px(766, 64, 16, 16), px(785, 64, 16, 16), px(804, 64, 16, 16), px(823, 64, 16, 16)],
    red: [px(1138, 64, 16, 16), px(1119, 64, 16, 16), px(1100, 64, 16, 16), px(1081, 64, 16, 16)],
  },
  grubs: { blue: px(730, 62, 22, 20), red: px(1168, 62, 22, 20) },
  herald: { blue: px(700, 64, 16, 16), red: px(1204, 64, 16, 16) },
  baron: { blue: px(670, 64, 16, 16), red: px(1234, 64, 16, 16) },
  satOn: 0.35,
};

export interface HudState { dragons: Record<Side, DragonType[]>; grubs: Record<Side, number>; herald: Record<Side, boolean>; baron: Record<Side, number> }
export interface HudEvent { name: 'DragonKill' | 'HordeKill' | 'HeraldKill' | 'BaronKill'; side: Side; extra: string; at: number }

type Px = { r: number; g: number; b: number };
function stats(img: Electron.NativeImage): { mean: Px; sat: number; hue: number; bright: number; vec: Float32Array } {
  const small = img.resize({ width: 8, height: 8, quality: 'good' });
  const bmp = small.toBitmap(); // BGRA
  let r = 0, g = 0, b = 0; const n = 64; const vec = new Float32Array(n);
  for (let i = 0; i < n; i++) { const o = i * 4; b += bmp[o]; g += bmp[o + 1]; r += bmp[o + 2]; vec[i] = 0.114 * bmp[o] + 0.587 * bmp[o + 1] + 0.299 * bmp[o + 2]; }
  r /= n; g /= n; b /= n;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = ((g - b) / (max - min)) % 6;
    else if (max === g) hue = (b - r) / (max - min) + 2;
    else hue = (r - g) / (max - min) + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { mean: { r, g, b }, sat, hue, bright: max / 255, vec };
}
function diff(a: Float32Array, b: Float32Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length / 255; }

/** Tipo de dragón por tono del icono (los iconos del HUD son monocromos por elemento). */
export function dragonFromColor(s: { sat: number; hue: number; bright: number }): DragonType | null {
  if (s.sat < 0.2 && s.bright > 0.75) return 'Elder';      // blanco-azul brillante
  if (s.sat < 0.2) return s.bright > 0.55 ? 'Air' : null;  // nubes: gris claro
  const h = s.hue;
  if (h < 22 || h >= 345) return 'Fire';                   // rojo-naranja
  if (h < 48) return 'Earth';                              // ámbar/marrón
  if (h < 150) return 'Chemtech';                          // verde
  if (h < 200) return 'Water';                             // turquesa
  if (h < 260) return 'Hextech';                           // azul-cian/violeta
  return 'Fire';
}

export class HudObjectives extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private geom: HudGeom = DEFAULT_GEOM;
  state: HudState = { dragons: { blue: [], red: [] }, grubs: { blue: 0, red: 0 }, herald: { blue: false, red: false }, baron: { blue: 0, red: 0 } };
  private pending: { key: string; n: number } | null = null;
  // Fondo "vacío" de cada casilla (la barra del espectador lleva tinte azul/rojo
  // por equipo, así que la saturación sola no sirve): se toma al empezar la
  // partida y un icono = la casilla se aleja de su fondo.
  private baseline: Map<string, Float32Array> | null = null;
  private baselineAt = 0;
  private grubVec: Record<Side, Float32Array | null> = { blue: null, red: null };
  private baronOn: Record<Side, boolean> = { blue: false, red: false };
  lastCapture: { at: number; w: number; h: number } | null = null;
  active = false;
  lateStart = false;

  /** `isLive` dice si hay partida en curso y su reloj: sin partida no se captura nada. */
  constructor(private userData: string, private isLive: () => { active: boolean; gameTime: number } = () => ({ active: true, gameTime: 0 })) { super(); this.loadGeom(); }

  loadGeom() {
    try {
      const raw = fs.readFileSync(path.join(this.userData, 'hud-geom.json'), 'utf8');
      const j = JSON.parse(raw);
      this.geom = { ...DEFAULT_GEOM, ...j, dragons: { ...DEFAULT_GEOM.dragons, ...(j.dragons || {}) }, grubs: { ...DEFAULT_GEOM.grubs, ...(j.grubs || {}) }, herald: { ...DEFAULT_GEOM.herald, ...(j.herald || {}) }, baron: { ...DEFAULT_GEOM.baron, ...(j.baron || {}) } };
      console.log('[hud] geometría personalizada cargada');
    } catch { this.geom = DEFAULT_GEOM; }
  }

  start(intervalMs = 2500) {
    if (this.timer) return;
    this.reset();
    this.active = true;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    console.log('[hud] lector del HUD activo');
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.active = false; }
  /** Partida nueva: todo a cero y se vuelve a tomar el fondo de las casillas. */
  reset() {
    this.state = { dragons: { blue: [], red: [] }, grubs: { blue: 0, red: 0 }, herald: { blue: false, red: false }, baron: { blue: 0, red: 0 } };
    this.pending = null; this.baseline = null; this.baselineAt = 0; this.lateStart = false;
    this.grubVec = { blue: null, red: null }; this.baronOn = { blue: false, red: false };
  }

  /** Captura completa a disco (PNG) para calibrar la geometría. */
  async saveCapture(): Promise<string> {
    const shot = await this.capture();
    if (!shot) throw new Error('No se pudo capturar la pantalla');
    const file = path.join(this.userData, 'hud-capture.png');
    fs.writeFileSync(file, shot.toPNG());
    return file;
  }

  private async capture(): Promise<Electron.NativeImage | null> {
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    const shot = sources[0]?.thumbnail;
    if (!shot || shot.isEmpty()) return null;
    const s = shot.getSize(); this.lastCapture = { at: Date.now(), w: s.width, h: s.height };
    return shot;
  }
  private crop(shot: Electron.NativeImage, b: Box) {
    const s = shot.getSize();
    return shot.crop({ x: Math.round(b.x * s.width), y: Math.round(b.y * s.height), width: Math.max(2, Math.round(b.w * s.width)), height: Math.max(2, Math.round(b.h * s.height)) });
  }

  /** Color RGB de 8×8 px como vector (para comparar con el fondo). */
  private rgbVec(img: Electron.NativeImage): Float32Array {
    const bmp = img.resize({ width: 8, height: 8, quality: 'good' }).toBitmap();
    const v = new Float32Array(64 * 3);
    for (let i = 0; i < 64; i++) { const o = i * 4; v[i * 3] = bmp[o + 2]; v[i * 3 + 1] = bmp[o + 1]; v[i * 3 + 2] = bmp[o]; }
    return v;
  }
  private static rgbDiff(a: Float32Array, b: Float32Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length / 255; }
  /** Color medio de los píxeles que cambiaron respecto al fondo (= el icono), en HSV. */
  private static iconColor(cur: Float32Array, base: Float32Array): { sat: number; hue: number; bright: number } {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < 64; i++) {
      const d = Math.abs(cur[i * 3] - base[i * 3]) + Math.abs(cur[i * 3 + 1] - base[i * 3 + 1]) + Math.abs(cur[i * 3 + 2] - base[i * 3 + 2]);
      if (d > 60) { r += cur[i * 3]; g += cur[i * 3 + 1]; b += cur[i * 3 + 2]; n++; }
    }
    if (!n) return { sat: 0, hue: 0, bright: 0 };
    r /= n; g /= n; b /= n;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    let hue = 0;
    if (max !== min) {
      if (max === r) hue = ((g - b) / (max - min)) % 6; else if (max === g) hue = (b - r) / (max - min) + 2; else hue = (r - g) / (max - min) + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return { sat, hue, bright: max / 255 };
  }

  private slots(): Array<[string, Box]> {
    const g = this.geom; const out: Array<[string, Box]> = [];
    for (const side of ['blue', 'red'] as Side[]) {
      g.dragons[side].forEach((b, i) => out.push([`d.${side}.${i}`, b]));
      out.push([`g.${side}`, g.grubs[side]], [`h.${side}`, g.herald[side]], [`b.${side}`, g.baron[side]]);
    }
    return out;
  }

  private async tick() {
    if (this.busy) return; this.busy = true;
    try {
      const lv = this.isLive();
      if (!lv.active) { if (this.baseline) this.reset(); return; } // entre partidas no se mira nada
      const shot = await this.capture(); if (!shot) return;
      const cur = new Map<string, Float32Array>();
      for (const [k, b] of this.slots()) cur.set(k, this.rgbVec(this.crop(shot, b)));
      if (!this.baseline) {
        // Primer tick con partida en curso: el fondo. Si entramos tarde (ya hay
        // objetivos), lo que ya esté pintado se queda como fondo y solo se
        // detecta lo que venga después (igual que el Live Client).
        this.baseline = cur; this.baselineAt = lv.gameTime; this.lateStart = lv.gameTime > 240;
        console.log('[hud] fondo de casillas tomado a', Math.round(lv.gameTime), 's');
        return;
      }
      const base = this.baseline;
      const thr = 0.10;
      const read = { dragons: { blue: [] as DragonType[], red: [] as DragonType[] }, herald: { blue: false, red: false }, baron: { blue: false, red: false }, grubs: { blue: false, red: false } };
      for (const side of ['blue', 'red'] as Side[]) {
        for (let i = 0; i < this.geom.dragons[side].length; i++) {
          const k = `d.${side}.${i}`; const c = cur.get(k)!; const b = base.get(k)!;
          if (HudObjectives.rgbDiff(c, b) < thr) break; // se llenan de dentro hacia afuera
          read.dragons[side].push(dragonFromColor(HudObjectives.iconColor(c, b)) || 'Fire');
        }
        read.herald[side] = HudObjectives.rgbDiff(cur.get(`h.${side}`)!, base.get(`h.${side}`)!) >= thr;
        read.baron[side] = HudObjectives.rgbDiff(cur.get(`b.${side}`)!, base.get(`b.${side}`)!) >= thr;
        const gv = this.grubVec[side] || base.get(`g.${side}`)!;
        read.grubs[side] = HudObjectives.rgbDiff(cur.get(`g.${side}`)!, gv) >= thr;
      }
      // Exige dos capturas iguales seguidas antes de aceptar un cambio (parpadeos, tooltips).
      const key = JSON.stringify(read);
      if (!this.pending || this.pending.key !== key) { this.pending = { key, n: 1 }; return; }
      if (this.pending.n >= 2) return; // ya aplicado
      this.pending.n = 2;
      const events: HudEvent[] = [];
      const now = Date.now();
      for (const side of ['blue', 'red'] as Side[]) {
        const prev = this.state.dragons[side];
        if (read.dragons[side].length > prev.length) for (const t of read.dragons[side].slice(prev.length)) events.push({ name: 'DragonKill', side, extra: t, at: now });
        if (read.dragons[side].length >= prev.length) this.state.dragons[side] = read.dragons[side];
        if (read.grubs[side]) { this.state.grubs[side]++; events.push({ name: 'HordeKill', side, extra: '', at: now }); this.grubVec[side] = cur.get(`g.${side}`)!; }
        if (read.herald[side] && !this.state.herald[side]) { this.state.herald[side] = true; events.push({ name: 'HeraldKill', side, extra: '', at: now }); }
        if (read.baron[side] && !this.baronOn[side]) { this.state.baron[side]++; events.push({ name: 'BaronKill', side, extra: '', at: now }); }
        this.baronOn[side] = read.baron[side];
      }
      if (events.length) { this.emit('events', events); this.emit('state', this.state); }
    } catch (e: any) { console.warn('[hud] tick', e?.message); }
    finally { this.busy = false; }
  }
}

export const _internals = { stats, dragonFromColor, nativeImage };
