// src/views/hextech.tsx — componentes del kit "Arena" del companion (ver
// hextech.css; conserva los nombres Hx* del kit anterior): paneles, retratos,
// slots, segmented, barras/anillos de progreso, árbol de runas completo,
// grilla de skills e items por etapas.
// Datos de runas/items: DDragon (versión del patch) con caché en memoria.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { champIconUrl, itemIconUrl, runeIconUrl, runePathIconUrl, spellIconUrl, type PatchInfo } from './shared';
import { BarFill, EASE } from '../motion';
import './hextech.css';

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');

// ── Panel ────────────────────────────────────────────────────────────────────
export function HxPanel({ children, className, style, inner, cut, tone, corners, strong }: {
  children?: ReactNode; className?: string; style?: CSSProperties; inner?: CSSProperties;
  cut?: number; tone?: 'cyan' | 'crimson'; corners?: boolean; strong?: boolean;
}) {
  return (
    <div className={cx('hx-panel', tone, strong && 'strong', className)} style={{ ...(cut != null ? ({ '--cut': `${cut}px` } as any) : null), ...style }}>
      <div className="hx-panel-in" style={inner}>
        {corners && <><i className="hx-corner tl" /><i className="hx-corner tr" /><i className="hx-corner bl" /><i className="hx-corner br" /></>}
        {children}
      </div>
    </div>
  );
}

// ── Hexágono ─────────────────────────────────────────────────────────────────
export function HxHex({ src, size = 44, tone, letter, style, className }: {
  src?: string | null; size?: number; tone?: 'cyan' | 'crimson' | 'dim'; letter?: string; style?: CSSProperties; className?: string;
}) {
  return (
    <span className={cx('hx-hex', tone, className)} style={{ width: size, height: size, ...style }}>
      <span className="hx-hex-in" style={{ fontSize: Math.max(11, size * 0.42) }}>
        {src ? <img src={src} alt="" draggable={false} /> : (letter || '')}
      </span>
    </span>
  );
}

export const champFaceUrl = (patch: PatchInfo | null, championName: string, championId?: number): string | null =>
  championId && championId > 0
    ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`
    : champIconUrl(patch, championName);

// ── Slot de jugador ──────────────────────────────────────────────────────────
export function HxSlot({ side = 'left', local, acting, rival, enemy, onClick, title, children, className, style, art }: {
  side?: 'left' | 'right'; local?: boolean; acting?: boolean; rival?: boolean; enemy?: boolean;
  onClick?: () => void; title?: string; children?: ReactNode; className?: string; style?: CSSProperties;
  /** Splash del campeón como fondo de la card. */
  art?: string | null;
}) {
  return (
    <div
      className={cx('hx-slot', side, local && 'is-local', acting && 'is-acting', rival && 'is-rival', enemy && 'is-enemy', onClick && 'clickable no-drag', art && 'has-art', className)}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="hx-slot-in">
        {art && <span className="hx-slot-art" aria-hidden><img src={art} alt="" draggable={false} /></span>}
        {acting && <span className="hx-slot-ring" aria-hidden />}
        {children}
      </div>
    </div>
  );
}

/** Mini-columna de hechizos + keystone del slot (como el cliente). */
export function HxSlotMini({ patch, spells = [], keystoneId }: { patch: PatchInfo | null; spells?: Array<number | string>; keystoneId?: number }) {
  const urls = [...spells.map((s) => spellIconUrl(patch, s)), keystoneId ? runeIconUrl(keystoneId, patch) : null];
  if (!urls.some(Boolean)) return null;
  return (
    <span className="hx-slot-mini" aria-hidden>
      {urls.map((u, i) => (u ? <img key={i} src={u} alt="" draggable={false} /> : <span key={i} />))}
    </span>
  );
}

// ── Segmented / Tabs ─────────────────────────────────────────────────────────
export function HxSegmented<T extends string>({ value, options, onChange, className }: {
  value: T; options: Array<{ id: T; label: string; disabled?: boolean }>; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cx('hx-seg', className)} role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} disabled={o.disabled}
          className={value === o.id ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HxTabs<T extends string>({ value, options, onChange, className }: {
  value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [line, setLine] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setLine({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);
  return (
    <div className={cx('hx-tabs', className)} role="tablist" style={{ position: 'relative' }}>
      {options.map((o) => (
        <button key={o.id} ref={(el) => { refs.current[o.id] = el; }} type="button" role="tab" aria-selected={value === o.id}
          className={value === o.id ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
      {line && (
        <motion.span className="hx-tab-line" initial={false} animate={{ x: line.x, width: line.w }}
          transition={{ duration: 0.25, ease: EASE }} style={{ right: 'auto', width: line.w }} />
      )}
    </div>
  );
}

// ── Barra y anillo de progreso ───────────────────────────────────────────────
export function HxBar({ label, value, pct, color = 'var(--hx-ink)', delay = 0, height = 5 }: {
  label: string; value: string; pct: number; color?: string; delay?: number; height?: number;
}) {
  return (
    <div className="hx-bar">
      <div className="hx-bar-head">
        <span className="hx-label">{label}</span>
        <span className="hx-bar-value">{value}</span>
      </div>
      <div className="hx-bar-rail" style={{ height }}>
        <BarFill pct={pct} delay={delay} style={{ background: color }} />
      </div>
    </div>
  );
}

/** Anillo de progreso SVG: el trazo crece hasta pct (500ms) y sigue al valor.
 *  La cifra va dentro y la etiqueta debajo (legible a 11px). */
export function HxRing({ pct, size = 56, stroke = 4, color = 'var(--hx-ink)', track = 'var(--ax-sunken-2)', value, label, children }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; value?: ReactNode; label?: string; children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="hx-ringbox">
    <div className="hx-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p / 100) }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', lineHeight: 1 }}>
        {children ?? <div className="hx-ring-v" style={{ fontSize: Math.max(13, size * 0.32) }}>{value}</div>}
      </div>
    </div>
    {!children && label && <div className="hx-ring-k">{label}</div>}
    </div>
  );
}

// ── Datos DDragon (runas + items), caché por versión ─────────────────────────
export interface RuneSlot { runes: Array<{ id: number; key: string; name: string; icon: string }> }
export interface RunePath { id: number; key: string; name: string; icon: string; slots: RuneSlot[] }
const runesCache = new Map<string, Promise<RunePath[]>>();
export function useRunesReforged(patch: PatchInfo | null): RunePath[] | null {
  const [data, setData] = useState<RunePath[] | null>(null);
  const ver = patch?.version || '';
  useEffect(() => {
    if (!ver) return;
    let alive = true;
    if (!runesCache.has(ver)) {
      runesCache.set(ver, fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/es_MX/runesReforged.json`)
        .then((r) => r.json())
        .then((arr: any[]) => arr.map((p) => ({
          id: Number(p.id), key: String(p.key), name: String(p.name),
          icon: `https://ddragon.leagueoflegends.com/cdn/img/${p.icon}`,
          slots: (p.slots || []).map((s: any) => ({
            runes: (s.runes || []).map((r: any) => ({ id: Number(r.id), key: String(r.key), name: String(r.name), icon: `https://ddragon.leagueoflegends.com/cdn/img/${r.icon}` })),
          })),
        })))
        .catch(() => []));
    }
    runesCache.get(ver)!.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [ver]);
  return data;
}

export interface ItemInfo { id: number; name: string; gold: number; from: number[]; into: number[] }
const itemsCache = new Map<string, Promise<Record<number, ItemInfo>>>();
export function useItemData(patch: PatchInfo | null): Record<number, ItemInfo> | null {
  const [data, setData] = useState<Record<number, ItemInfo> | null>(null);
  const ver = patch?.version || '';
  useEffect(() => {
    if (!ver) return;
    let alive = true;
    if (!itemsCache.has(ver)) {
      itemsCache.set(ver, fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/es_MX/item.json`)
        .then((r) => r.json())
        .then((j: any) => {
          const out: Record<number, ItemInfo> = {};
          for (const [k, v] of Object.entries<any>(j?.data || {})) {
            out[Number(k)] = { id: Number(k), name: String(v?.name || ''), gold: Number(v?.gold?.total) || 0, from: (v?.from || []).map(Number), into: (v?.into || []).map(Number) };
          }
          return out;
        })
        .catch(() => ({})));
    }
    itemsCache.get(ver)!.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [ver]);
  return data;
}

// Fragmentos de estadísticas (filas del cliente) → icono CDragon.
const SHARD_ROWS: number[][] = [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]];
const SHARD_ICON: Record<number, string> = {
  5008: 'statmodsadaptiveforceicon.png', 5005: 'statmodsattackspeedicon.png', 5007: 'statmodscdrscalingicon.png',
  5010: 'statmodsmovementspeedicon.png', 5001: 'statmodshealthscalingicon.png', 5011: 'statmodshealthplusicon.png',
  5013: 'statmodstenacityicon.png', 5002: 'statmodsarmoricon.png', 5003: 'statmodsmagicresicon.magicresist_fix.png',
};
const shardIcon = (id: number) =>
  SHARD_ICON[id] ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/${SHARD_ICON[id]}` : null;

/**
 * Árbol de runas completo: ambas ramas con todas las runas, las no elegidas
 * atenuadas y las elegidas encendidas (keystone grande). Sin datos DDragon
 * cae a la lista plana de iconos.
 */
export function HxRuneTree({ patch, primaryPathId, secondaryPathId, selected, shards = [], compact }: {
  patch: PatchInfo | null; primaryPathId: number; secondaryPathId: number; selected: number[]; shards?: number[]; compact?: boolean;
}) {
  const paths = useRunesReforged(patch);
  const sel = new Set(selected);
  const shardSel = [...shards];
  const primary = paths?.find((p) => p.id === primaryPathId);
  const secondary = paths?.find((p) => p.id === secondaryPathId);
  const Rune = ({ id, icon, ks, on }: { id: number; icon?: string; ks?: boolean; on: boolean }) => (
    <span className={cx('hx-rune', ks && 'ks', on && 'on')} title={String(id)}>
      <img src={icon || runeIconUrl(id, patch) || ''} alt="" draggable={false} />
    </span>
  );
  const Path = ({ p, isPrimary, tone }: { p?: RunePath; isPrimary: boolean; tone: string }) => (
    <div className="hx-rune-path">
      <div className="hx-rune-path-head" style={{ color: tone }}>
        {p ? <img src={p.icon} alt="" /> : (runePathIconUrl(isPrimary ? primaryPathId : secondaryPathId) ? <img src={runePathIconUrl(isPrimary ? primaryPathId : secondaryPathId)!} alt="" /> : null)}
        <span>{p?.name || (isPrimary ? 'PRINCIPAL' : 'SECUNDARIA')}</span>
      </div>
      {p
        ? p.slots.slice(isPrimary ? 0 : 1).map((slot, i) => (
            <div key={i} className="hx-rune-row">
              {slot.runes.map((r) => <Rune key={r.id} id={r.id} icon={r.icon} ks={isPrimary && i === 0} on={sel.has(r.id)} />)}
            </div>
          ))
        : (
          <div className="hx-rune-row" style={{ flexWrap: 'wrap' }}>
            {selected.slice(isPrimary ? 0 : 4, isPrimary ? 4 : 6).map((id, i) => <Rune key={id} id={id} ks={isPrimary && i === 0} on />)}
          </div>
        )}
      {!isPrimary && (
        <div className="hx-shards">
          {SHARD_ROWS.flatMap((row, ri) => row.map((id) => {
            // Cada fila elige un fragmento: encendido si coincide con el elegido de esa fila.
            const on = shardSel[ri] === id;
            const url = shardIcon(id);
            return <span key={`${ri}-${id}`} className={cx('hx-rune', on && 'on')}>{url ? <img src={url} alt="" draggable={false} /> : null}</span>;
          }))}
        </div>
      )}
    </div>
  );
  return (
    <div className="hx-runes" style={compact ? { gap: 10 } : undefined}>
      <Path p={primary} isPrimary tone="var(--hx-ink)" />
      <span className="hx-runes-sep" />
      <Path p={secondary} isPrimary={false} tone="var(--hx-ink-2)" />
    </div>
  );
}

/** Grilla 4×18 de orden de skills a partir de la secuencia OP.GG (["Q","W","E",…]). */
export function HxSkillGrid({ sequence, levels = 18 }: { sequence: string[]; levels?: number }) {
  const rows = ['Q', 'W', 'E', 'R'];
  const seq = sequence.map((s) => s.toUpperCase());
  return (
    <div className="hx-skills" style={{ gridTemplateColumns: `28px repeat(${levels}, 1fr)` }}>
      <span />
      {Array.from({ length: levels }, (_, i) => <span key={i} className="lvl">{i + 1}</span>)}
      {rows.map((k) => (
        <span key={k} style={{ display: 'contents' }}>
          <span className="key">{k}</span>
          {Array.from({ length: levels }, (_, i) => {
            const on = seq[i] === k;
            return <span key={i} className={cx('tile', on && 'on', on && k === 'R' && 'r')}>{on ? k : ''}</span>;
          })}
        </span>
      ))}
    </div>
  );
}

// ── Items ────────────────────────────────────────────────────────────────────
export function HxItem({ patch, id, size = 32, core, owned, title }: { patch: PatchInfo | null; id: number; size?: number; core?: boolean; owned?: boolean; title?: string }) {
  const url = itemIconUrl(patch, id);
  return (
    <span className={cx('hx-item', size <= 24 && 'sm', core && 'core', owned && 'owned', !url && 'empty')} style={{ width: size, height: size }} title={title}>
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </span>
  );
}
export const HxArrow = ({ color = 'var(--hx-muted)' }: { color?: string }) => (
  <svg className="hx-arrow" viewBox="0 0 10 10" aria-hidden><path d="M2 5 H7 M5 2.5 L7.5 5 L5 7.5" stroke={color} strokeWidth="1.3" fill="none" /></svg>
);
export function HxItemStage({ patch, label, ids, size = 32, arrows, owned = [], core }: {
  patch: PatchInfo | null; label: string; ids: number[]; size?: number; arrows?: boolean; owned?: number[]; core?: boolean;
}) {
  if (!ids.length) return null;
  const own = new Set(owned);
  return (
    <div>
      <div className="hx-label" style={{ marginBottom: 5 }}>{label}</div>
      <div className="hx-items">
        {ids.map((id, i) => (
          <span key={`${id}-${i}`} style={{ display: 'contents' }}>
            <HxItem patch={patch} id={id} size={size} core={core && i === 0} owned={own.has(id)} />
            {arrows && i < ids.length - 1 && <HxArrow />}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Formato ──────────────────────────────────────────────────────────────────
export const fmtGold = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

// ── Build completa con variantes ─────────────────────────────────────────────
export interface HxFullBuildData { label: string; ids: number[]; names?: string[]; pickRate: number | null; winRate: number | null; play?: number }
export interface HxItemOption { id: number; name: string; pickRate: number | null; winRate: number | null }
export interface HxItemOptions { fourth: HxItemOption[]; fifth: HxItemOption[]; sixth: HxItemOption[]; last: HxItemOption[] }

/**
 * Build completa de 6 items (botas + core + 4º/5º/6º) con selector de variante
 * y alternativas por slot. `owned` marca en verde lo que ya se compró.
 */
export function HxFullBuild({ patch, builds, options, owned = [], size = 32, compact }: {
  patch: PatchInfo | null; builds: HxFullBuildData[]; options?: HxItemOptions | null; owned?: number[]; size?: number; compact?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const list = builds.filter((b) => b && b.ids?.length);
  const cur = list[Math.min(idx, Math.max(0, list.length - 1))];
  const own = new Set(owned);
  if (!cur) return null;
  const slots: Array<[string, HxItemOption[]]> = options
    ? [['4º', options.fourth], ['5º', options.fifth], ['6º', options.sixth], ['Último', options.last]].filter(([, l]) => l?.length) as Array<[string, HxItemOption[]]>
    : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {list.length > 1 && (
        <div className="hx-seg" role="tablist" style={{ alignSelf: 'flex-start' }}>
          {list.map((b, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === idx} className={i === idx ? 'is-active' : ''} onClick={() => setIdx(i)}
              title={`${b.label}${b.pickRate != null ? ` · ${b.pickRate}% de pick` : ''}${b.winRate != null ? ` · ${b.winRate}% WR` : ''}`}
              style={{ minHeight: 26, fontSize: 11.5, padding: '0 8px' }}>
              {b.label}{!compact && b.winRate != null ? <span className="hx-mono" style={{ marginLeft: 6, color: b.winRate >= 50 ? 'var(--hx-green)' : 'var(--hx-crimson)' }}>{b.winRate}%</span> : null}
            </button>
          ))}
        </div>
      )}
      <motion.div key={cur.ids.join(',')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }} className="hx-items">
        {cur.ids.map((id, i) => (
          <span key={`${id}-${i}`} style={{ display: 'contents' }}>
            <HxItem patch={patch} id={id} size={size} core={i > 0 && i <= 3} owned={own.has(id)} title={cur.names?.[i]} />
            {i < cur.ids.length - 1 && <HxArrow />}
          </span>
        ))}
      </motion.div>
      {(cur.pickRate != null || cur.play) && (
        <div className="hx-muted" style={{ fontSize: 12 }}>
          {cur.pickRate != null ? `${cur.pickRate}% la juegan` : ''}{cur.winRate != null ? ` · ${cur.winRate}% WR` : ''}{cur.play ? ` · ${cur.play.toLocaleString()} partidas` : ''}
        </div>
      )}
      {!compact && slots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="hx-label">Alternativas por slot</div>
          {slots.map(([label, opts]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="hx-label" style={{ width: 48 }}>{label}</span>
              {opts.slice(0, 4).map((o) => (
                <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={`${o.name}${o.winRate != null ? ` · ${o.winRate}% WR` : ''}`}>
                  <HxItem patch={patch} id={o.id} size={22} owned={own.has(o.id)} />
                  <span className="hx-mono hx-muted" style={{ fontSize: 11.5 }}>{o.pickRate != null ? `${o.pickRate}%` : ''}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
