// electron/services/hud-objectives.ts — lector del HUD del espectador.
//
// El cliente de League en modo espectador NO emite DragonKill/HordeKill/BaronKill
// por la Live Client API. La barra superior del espectador sí los pinta: por
// equipo, de fuera hacia el centro, DRAGONES · BARÓN · LARVAS · TORRES · ORO, y
// debajo de la barra una fila con el tipo de cada dragón tomado (los del lado
// azul crecen hacia la izquierda desde el centro; los del rojo hacia la derecha).
// Este servicio captura la pantalla cada segundo (igual que el detector de
// augments de Arena), vigila los DÍGITOS de los contadores (píxeles del color del
// equipo sobre el panel opaco) y, cuando uno cambia de forma estable, emite el
// evento equivalente. El tipo de dragón se lee del icono nuevo de la fila
// inferior: clase por tono (cálido / verde / cian / blanco) y, dentro de la clase,
// la silueta más parecida a las plantillas medidas. Sin leer memoria del juego.
//
// Geometría y plantillas medidas sobre capturas reales del cliente (repeticiones
// renderizadas del LQC, 1920×1080, escala de HUD por defecto) contrastadas con
// la línea de tiempo oficial de Riot de esas partidas. Fracciones de pantalla
// para que valga a 2560×1440. Se puede sobrescribir con <userData>/hud-geom.json;
// "Guardar captura del HUD" deja un PNG para medir.
import { desktopCapturer, screen, nativeImage } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export type Side = 'blue' | 'red';
export type DragonType = 'Fire' | 'Earth' | 'Water' | 'Air' | 'Hextech' | 'Chemtech' | 'Elder';
export interface Box { x: number; y: number; w: number; h: number } // fracciones de pantalla
export interface HudGeom {
  /** Cajas de los dígitos de cada contador (sobre el panel opaco de la barra). */
  counts: Record<Side, { dragons: Box; baron: Box; grubs: Box }>;
  /** Centro (px a 1920×1080) de cada casilla de tipo de dragón, de dentro hacia afuera. */
  dragonSlots: Record<Side, Array<{ cx: number; cy: number }>>;
  /** IoU mínima entre máscaras de dígito para considerarlo el MISMO dígito. */
  sameDigit: number;
}

const px = (x: number, y: number, w: number, h: number): Box => ({ x: x / 1920, y: y / 1080, w: w / 1920, h: h / 1080 });
export const DEFAULT_GEOM: HudGeom = {
  counts: {
    blue: { dragons: px(549, 58, 26, 26), baron: px(619, 58, 26, 26), grubs: px(683, 58, 26, 26) },
    red: { grubs: px(1229, 58, 26, 26), baron: px(1300, 58, 26, 26), dragons: px(1373, 58, 26, 26) },
  },
  dragonSlots: {
    blue: [870, 852, 834, 816, 798, 780].map((cx) => ({ cx, cy: 105 })),
    red: [1060, 1078, 1096, 1114, 1132, 1150].map((cx) => ({ cx, cy: 105 })),
  },
  sameDigit: 0.6,
};

// Siluetas 15×15 (225 bits, fila a fila) de los iconos de tipo de dragón del HUD
// (hextech y nubes: promedio de 5 y 3 muestras; el resto, una muestra cada uno).
const TEMPLATE_HEX: Record<string, string> = {
  Fire: '5fc0dfb3df65fed7fddffaf7fbd6ff7f7f777ffffffebef57ff9ff7',
  Earth: 'c601f407f80fe837f93f45ffef5fdff5bfff7d3efbdd7fb977e97da',
  Chemtech: '1ffffffffffff7ffffff7dfefbbffefdeffdec3f77ff5ffef3fef4fc2',
  Hextech: '1be7d7b01ee97be6aee7fccbf1c7ffcefbdca9bca75c1c5c741dc07fc',
  Air: '1f7fffbfffb7fbdff7b7fe7ffeeff7ddf7b7dffd7dfffdf71fe0dfeff',
};
const TEMPLATES: Record<string, Uint8Array> = {};
for (const [k, hex] of Object.entries(TEMPLATE_HEX)) {
  const bits = BigInt('0x' + hex).toString(2).padStart(225, '0');
  TEMPLATES[k] = Uint8Array.from(bits, (c) => (c === '1' ? 1 : 0));
}
type HueClass = 'warm' | 'green' | 'cyan' | 'white' | 'other';
const CLASS_OF: Record<string, HueClass> = { Fire: 'warm', Earth: 'warm', Chemtech: 'green', Hextech: 'cyan', Air: 'cyan' };

export interface HudState { dragons: Record<Side, DragonType[]>; grubs: Record<Side, number>; baron: Record<Side, number> }
export interface HudEvent { name: 'DragonKill' | 'HordeKill' | 'BaronKill'; side: Side; extra: string; at: number }

/** Píxeles RGB (fila a fila) de una imagen. */
function rgbOf(img: Electron.NativeImage): { rgb: Uint8Array; w: number; h: number } {
  const s = img.getSize(); const bmp = img.toBitmap(); const n = s.width * s.height; const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { rgb[i * 3] = bmp[i * 4 + 2]; rgb[i * 3 + 1] = bmp[i * 4 + 1]; rgb[i * 3 + 2] = bmp[i * 4]; }
  return { rgb, w: s.width, h: s.height };
}
function median(a: number[]): number { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
/** Máscara "icono" de una ventana 15×15: píxeles lejos del color mediano (el fondo, mapa incluido) + color medio del icono. */
export function iconMask(rgb: Uint8Array, w: number, x0: number, y0: number): { mask: Uint8Array; n: number; hue: number; sat: number; val: number } {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) { const o = ((y0 + y) * w + x0 + x) * 3; rs.push(rgb[o]); gs.push(rgb[o + 1]); bs.push(rgb[o + 2]); }
  const mr = median(rs), mg = median(gs), mb = median(bs);
  const mask = new Uint8Array(225); let n = 0, sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < 225; i++) if (Math.abs(rs[i] - mr) + Math.abs(gs[i] - mg) + Math.abs(bs[i] - mb) > 60) { mask[i] = 1; n++; sr += rs[i]; sg += gs[i]; sb += bs[i]; }
  if (!n) return { mask, n, hue: 0, sat: 0, val: 0 };
  sr /= n; sg /= n; sb /= n;
  const max = Math.max(sr, sg, sb), min = Math.min(sr, sg, sb);
  const sat = max === 0 ? 0 : (max - min) / max;
  let hue = 0;
  if (max !== min) {
    if (max === sr) hue = ((sg - sb) / (max - min)) % 6; else if (max === sg) hue = (sb - sr) / (max - min) + 2; else hue = (sr - sg) / (max - min) + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { mask, n, hue, sat, val: max / 255 };
}
export function hueClass(c: { n: number; hue: number; sat: number; val: number }): HueClass {
  if (c.n < 40) return 'other';
  if (c.sat < 0.12 && c.val > 0.6) return 'white';
  const h = c.hue;
  if (h < 60 || h >= 340) return 'warm';
  if (h < 150) return 'green';
  if (h < 230) return 'cyan';
  return 'other';
}
function iou(a: Uint8Array, b: Uint8Array): number { let i = 0, u = 0; for (let k = 0; k < 225; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 0; }
/** Lee una casilla de tipo de dragón (ventana 23×19 centrada): tipo o null si no hay icono. */
export function readDragonSlot(rgb: Uint8Array, w: number, x0: number, y0: number): DragonType | null {
  let best: { type: DragonType; score: number } | null = null;
  for (let dy = 0; dy <= 4; dy++) for (let dx = 0; dx <= 8; dx++) {
    const c = iconMask(rgb, w, x0 + dx, y0 + dy);
    if (c.n < 90) continue;
    const hc = hueClass(c);
    if (hc === 'other') continue;
    if (hc === 'white') { if (!best || best.score < 0.5) best = { type: 'Elder', score: 0.5 }; continue; }
    if (hc === 'warm') { const t = c.hue < 29 || c.hue >= 340 ? 'Fire' : 'Earth'; const s = iou(c.mask, TEMPLATES[t]); if (!best || s > best.score) best = { type: t, score: s }; continue; }
    if (hc === 'green') { const s = iou(c.mask, TEMPLATES.Chemtech); if (!best || s > best.score) best = { type: 'Chemtech', score: s }; continue; }
    // cian: océano (muy saturado) o hextech/nubes por silueta
    if (c.sat >= 0.55) { if (!best || best.score < 0.5) best = { type: 'Water', score: 0.5 }; continue; }
    const sh = iou(c.mask, TEMPLATES.Hextech), sa = iou(c.mask, TEMPLATES.Air);
    const t: DragonType = sh >= sa ? 'Hextech' : 'Air'; const s = Math.max(sh, sa);
    if (!best || s > best.score) best = { type: t, score: s };
  }
  return best && best.score >= 0.45 ? best.type : null;
}
/** Máscara de un dígito del contador: píxeles del color del equipo. */
export function digitMask(rgb: Uint8Array, n: number, side: Side): Uint8Array {
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], b = rgb[i * 3 + 2];
    m[i] = side === 'blue' ? (b > 150 && b - r > 50 ? 1 : 0) : (r > 150 && r - b > 50 ? 1 : 0);
  }
  return m;
}
function maskIou(a: Uint8Array, b: Uint8Array): number { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 1; }

export class HudObjectives extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private geom: HudGeom = DEFAULT_GEOM;
  state: HudState = { dragons: { blue: [], red: [] }, grubs: { blue: 0, red: 0 }, baron: { blue: 0, red: 0 } };
  /** Última máscara estable de cada contador (clave "dragons.blue"…). */
  private stable = new Map<string, Uint8Array>();
  /** Lectura pendiente de confirmar en la siguiente captura. */
  private pending = new Map<string, Uint8Array>();
  private synced = false;
  lastCapture: { at: number; w: number; h: number } | null = null;
  active = false;

  constructor(private userData: string, private isLive: () => { active: boolean; gameTime: number } = () => ({ active: true, gameTime: 0 })) { super(); this.loadGeom(); }

  loadGeom() {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(this.userData, 'hud-geom.json'), 'utf8'));
      this.geom = {
        counts: { blue: { ...DEFAULT_GEOM.counts.blue, ...(j.counts?.blue || {}) }, red: { ...DEFAULT_GEOM.counts.red, ...(j.counts?.red || {}) } },
        dragonSlots: { blue: j.dragonSlots?.blue || DEFAULT_GEOM.dragonSlots.blue, red: j.dragonSlots?.red || DEFAULT_GEOM.dragonSlots.red },
        sameDigit: Number(j.sameDigit) || DEFAULT_GEOM.sameDigit,
      };
      console.log('[hud] geometría personalizada cargada');
    } catch { this.geom = DEFAULT_GEOM; }
  }

  start(intervalMs = 1000) {
    if (this.timer) return;
    this.reset();
    this.active = true;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    console.log('[hud] lector del HUD activo');
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.active = false; }
  /** Partida nueva: todo a cero; los contadores se vuelven a leer. */
  reset() {
    this.state = { dragons: { blue: [], red: [] }, grubs: { blue: 0, red: 0 }, baron: { blue: 0, red: 0 } };
    this.stable.clear(); this.pending.clear(); this.synced = false;
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
  private cropBox(shot: Electron.NativeImage, b: Box) {
    const s = shot.getSize();
    return shot.crop({ x: Math.round(b.x * s.width), y: Math.round(b.y * s.height), width: Math.max(2, Math.round(b.w * s.width)), height: Math.max(2, Math.round(b.h * s.height)) });
  }
  /** Ventana 23×19 alrededor de una casilla de dragón (escalada a la resolución real). */
  private readSlot(shot: Electron.NativeImage, slot: { cx: number; cy: number }): DragonType | null {
    const s = shot.getSize(); const k = s.width / 1920;
    const x = Math.round((slot.cx - 11) * k), y = Math.round((slot.cy - 9) * k);
    let win = shot.crop({ x, y, width: Math.round(23 * k), height: Math.round(19 * k) });
    if (k !== 1) win = win.resize({ width: 23, height: 19, quality: 'good' });
    const { rgb, w } = rgbOf(win);
    return readDragonSlot(rgb, w, 0, 0);
  }
  private readDigit(shot: Electron.NativeImage, b: Box, side: Side): Uint8Array {
    const { rgb, w, h } = rgbOf(this.cropBox(shot, b));
    return digitMask(rgb, w * h, side);
  }
  /** Dragones ya tomados por un lado según los iconos presentes (al entrar tarde). */
  private scanDragons(shot: Electron.NativeImage, side: Side): DragonType[] {
    const out: DragonType[] = [];
    for (const slot of this.geom.dragonSlots[side]) { const t = this.readSlot(shot, slot); if (!t) break; out.push(t); }
    return out;
  }

  private async tick() {
    if (this.busy) return; this.busy = true;
    try {
      const lv = this.isLive();
      if (!lv.active) { if (this.synced) this.reset(); return; } // entre partidas no se mira nada
      const shot = await this.capture(); if (!shot) return;
      const keys: Array<[string, Side, 'dragons' | 'baron' | 'grubs']> = [];
      for (const side of ['blue', 'red'] as Side[]) for (const k of ['dragons', 'baron', 'grubs'] as const) keys.push([`${k}.${side}`, side, k]);
      const cur = new Map<string, Uint8Array>();
      for (const [key, side, k] of keys) cur.set(key, this.readDigit(shot, this.geom.counts[side][k], side));
      if (!this.synced) {
        // Primera lectura con partida en curso: los contadores actuales son el punto de
        // partida (si entramos tarde, lo que ya pasó no se emite, igual que el Live Client).
        for (const [key] of keys) this.stable.set(key, cur.get(key)!);
        for (const side of ['blue', 'red'] as Side[]) this.state.dragons[side] = this.scanDragons(shot, side);
        this.synced = true;
        console.log('[hud] contadores sincronizados a', Math.round(lv.gameTime), 's; dragones vistos', JSON.stringify(this.state.dragons));
        this.emit('state', this.state);
        return;
      }
      const events: HudEvent[] = [];
      const now = Date.now();
      for (const [key, side, k] of keys) {
        const m = cur.get(key)!; const st = this.stable.get(key)!;
        if (maskIou(m, st) >= this.geom.sameDigit) { this.pending.delete(key); continue; }
        // Cambió: exigir dos capturas seguidas con el mismo dígito nuevo (descarta parpadeos y tooltips).
        const p = this.pending.get(key);
        if (!p || maskIou(p, m) < this.geom.sameDigit) { this.pending.set(key, m); continue; }
        this.pending.delete(key); this.stable.set(key, m);
        if (k === 'dragons') {
          const idx = this.state.dragons[side].length;
          const slot = this.geom.dragonSlots[side][Math.min(idx, this.geom.dragonSlots[side].length - 1)];
          const type = this.readSlot(shot, slot) || 'Fire';
          this.state.dragons[side].push(type);
          events.push({ name: 'DragonKill', side, extra: type, at: now });
        } else if (k === 'baron') { this.state.baron[side]++; events.push({ name: 'BaronKill', side, extra: '', at: now }); }
        else { this.state.grubs[side]++; events.push({ name: 'HordeKill', side, extra: '', at: now }); }
      }
      if (events.length) { this.emit('events', events); this.emit('state', this.state); }
    } catch (e: any) { console.warn('[hud] tick', e?.message); }
    finally { this.busy = false; }
  }
}

export const _internals = { iconMask, hueClass, readDragonSlot, digitMask, nativeImage, TEMPLATES };
