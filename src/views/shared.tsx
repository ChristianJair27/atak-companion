// src/views/shared.tsx — hooks y piezas comunes de las 6 vistas.
// Todo el wiring de datos reales (window.atak) vive aquí o en cada vista;
// los componentes visuales siguen el sistema de src/styles.css.
import { useEffect, useState, type CSSProperties } from 'react';

// ── Formato ──────────────────────────────────────────────────────────────────
export const fmtClock = (t: number): string => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtK = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export const norm = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const modeEs = (m: string): string =>
  (
    {
      CLASSIC: 'GRIETA DEL INVOCADOR',
      ARAM: 'ARAM',
      URF: 'URF',
      ARURF: 'URF',
      PRACTICETOOL: 'HERRAMIENTA DE PRÁCTICA',
      TUTORIAL: 'TUTORIAL',
      CHERRY: 'ARENA',
      NEXUSBLITZ: 'NEXUS BLITZ',
    } as Record<string, string>
  )[(m || '').toUpperCase()] || (m || '').toUpperCase() || 'EN VIVO';

export const posEs = (p: string): string =>
  (
    {
      TOP: 'TOP',
      JUNGLE: 'JUNGLA',
      MIDDLE: 'MID',
      MID: 'MID',
      BOTTOM: 'BOT',
      BOT: 'BOT',
      UTILITY: 'SOPORTE',
      SUPPORT: 'SOPORTE',
    } as Record<string, string>
  )[(p || '').toUpperCase()] || (p || '').toUpperCase();

export const phaseEs = (p: string): string =>
  (
    {
      None: 'Inactivo',
      Lobby: 'En lobby',
      Matchmaking: 'Buscando partida',
      ReadyCheck: 'Partida encontrada',
      ChampSelect: 'Selección de campeón',
      GameStart: 'Iniciando partida',
      InProgress: 'En partida',
      WaitingForStats: 'Esperando estadísticas',
      PreEndOfGame: 'Fin de partida',
      EndOfGame: 'Fin de partida',
    } as Record<string, string>
  )[p] || p || '—';

// ── Hooks de datos reales ────────────────────────────────────────────────────
export function useLive(): any {
  const [live, setLive] = useState<any>(null);
  useEffect(() => window.atak.onLive(setLive), []);
  return live;
}

export function useStatus(intervalMs = 2000): any {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      window.atak
        .status()
        .then((s: any) => { if (alive) setStatus(s); })
        .catch(() => {});
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return status;
}

export interface PatchInfo {
  version: string;
  /** nombre normalizado ("kaisa", "leesin") o id DDragon → key numérico */
  keyByName: Record<string, number>;
  byKey: Record<number, { id: string; name: string }>;
}

export function usePatch(): PatchInfo | null {
  const [patch, setPatch] = useState<PatchInfo | null>(null);
  useEffect(() => {
    let alive = true;
    window.atak
      .patchData()
      .then((d: any) => {
        if (!alive || !d?.champById) return;
        const keyByName: Record<string, number> = {};
        const byKey: Record<number, { id: string; name: string }> = {};
        for (const [key, c] of Object.entries<any>(d.champById)) {
          const k = Number(key);
          byKey[k] = { id: String(c?.id ?? ''), name: String(c?.name ?? '') };
          if (c?.name) keyByName[norm(String(c.name))] = k;
          if (c?.id) keyByName[norm(String(c.id))] = k;
        }
        setPatch({ version: String(d.version || ''), keyByName, byKey });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return patch;
}

// ── Iconos (CommunityDragon / DDragon) ───────────────────────────────────────
export const champIconUrl = (patch: PatchInfo | null, championName: string): string | null => {
  const key = patch?.keyByName[norm(championName)];
  return key != null
    ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${key}.png`
    : null;
};

export const itemIconUrl = (patch: PatchInfo | null, itemId: number): string | null =>
  patch?.version ? `https://ddragon.leagueoflegends.com/cdn/${patch.version}/img/item/${itemId}.png` : null;

export function ChampIcon(props: {
  patch: PatchInfo | null;
  name: string;
  size?: number;
  enemy?: boolean;
  round?: boolean;
  style?: CSSProperties;
}) {
  const { patch, name, size = 26, enemy, round, style } = props;
  const url = champIconUrl(patch, name);
  return (
    <span
      className={`champ${enemy ? ' enemy' : ''}${round ? ' round' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)), ...style }}
      title={name}
    >
      {url ? <img src={url} alt={name} /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

// ── Iconos SVG de objetivos ──────────────────────────────────────────────────
export const DragonSvg = ({ size = 12, color = '#E1242E' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 12 12">
    <path d="M6 0 L11 6 L6 12 L1 6 Z" fill={color} />
  </svg>
);

export const HeraldSvg = ({ size = 12, color = '#8b8f9a' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 12 12">
    <circle cx="6" cy="6" r="5" fill="none" stroke={color} strokeWidth="1.5" />
    <circle cx="6" cy="6" r="2" fill={color} />
  </svg>
);

export const BaronSvg = ({ size = 12, color = '#8b8f9a' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 12 12">
    <path d="M1 9 L3 3 L6 7 L9 3 L11 9 Z" fill={color} />
  </svg>
);

// ── Chip de objetivo con cuenta regresiva ────────────────────────────────────
export function ObjChip(props: {
  label: string;
  icon: 'dragon' | 'herald' | 'baron';
  nextAt: number | null;
  alive: boolean;
  gameTime: number;
}) {
  const { label, icon, nextAt, alive, gameTime } = props;
  const gone = nextAt == null;
  const live = alive && !gone;
  const cls = `obj-chip skew${live ? ' live' : ''}${gone ? ' off' : ''}`;
  const iconColor = live ? '#E1242E' : '#8b8f9a';
  const Icon = icon === 'dragon' ? DragonSvg : icon === 'herald' ? HeraldSvg : BaronSvg;
  return (
    <div className={cls} style={{ flex: 1 }}>
      <Icon color={iconColor} />
      <div>
        <div className="k">{live ? `${label} · VIVO` : label}</div>
        <div className="v">{gone ? '—' : live ? 'AHORA' : fmtClock(nextAt - gameTime)}</div>
      </div>
    </div>
  );
}

// ── Colores por tipo de dragón (medallones del caster) ───────────────────────
const DRAGON_COLORS: Record<string, string> = {
  fire: '#ff6b3d',
  water: '#4fd1ff',
  earth: '#c8aa6e',
  air: '#b9e8ff',
  hextech: '#6bd0ff',
  chemtech: '#8aff7a',
  elder: '#7fd4ff',
};

export const dragonColor = (type: string): string => {
  const s = (type || '').toLowerCase();
  for (const k of Object.keys(DRAGON_COLORS)) if (s.includes(k)) return DRAGON_COLORS[k];
  return '#9ba0ab';
};
