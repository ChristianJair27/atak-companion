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

/** Abre el perfil ATAK.GG del jugador (frontend real embebido en la app). */
export const openProfile = (riotId?: string | null) => {
  const rid = String(riotId || '').trim();
  if (rid.includes('#')) window.atak.openProfile(rid);
};

/** Abre la página de campeón del frontend (slug DDragon, p.ej. "MissFortune"). */
export const openChampionPage = (slug?: string | null) => {
  if (slug) window.atak.openAtak(`/champion/${encodeURIComponent(slug)}`);
};

/** Nombre de campeón mostrado ("Miss Fortune") → slug DDragon ("MissFortune"). */
export const champSlug = (patch: PatchInfo | null, championName?: string | null): string | null => {
  if (!patch || !championName) return null;
  const key = patch.keyByName[norm(championName)];
  return key != null ? patch.byKey[key]?.id ?? null : null;
};

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
  byKey: Record<number, { id: string; name: string; tags: string[] }>;
  /** id de runa → URL DDragon/CDragon */
  runeIconById: Record<number, string>;
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
        const byKey: Record<number, { id: string; name: string; tags: string[] }> = {};
        for (const [key, c] of Object.entries<any>(d.champById)) {
          const k = Number(key);
          byKey[k] = {
            id: String(c?.id ?? ''),
            name: String(c?.name ?? ''),
            tags: Array.isArray(c?.tags) ? c.tags.map(String) : [],
          };
          if (c?.name) keyByName[norm(String(c.name))] = k;
          if (c?.id) keyByName[norm(String(c.id))] = k;
        }
        setPatch({
          version: String(d.version || ''),
          keyByName,
          byKey,
          runeIconById: (d.runeIconById as Record<number, string>) || {},
        });
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

export const champSplashUrl = (patch: PatchInfo | null, championName: string, skin = 0): string | null => {
  const id = patch?.keyByName[norm(championName)];
  const slug = id != null ? patch?.byKey[id]?.id : null;
  return slug
    ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${slug}_${skin}.jpg`
    : null;
};

export const champLoadingUrl = (patch: PatchInfo | null, championName: string, skin = 0): string | null => {
  const id = patch?.keyByName[norm(championName)];
  const slug = id != null ? patch?.byKey[id]?.id : null;
  return slug
    ? `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${slug}_${skin}.jpg`
    : null;
};

export const itemIconUrl = (patch: PatchInfo | null, itemId: number): string | null =>
  itemId > 0 && patch?.version
    ? `https://ddragon.leagueoflegends.com/cdn/${patch.version}/img/item/${itemId}.png`
    : null;

/** Live Client: displayName localizado, raw "SummonerFlash", o tip string. */
const SPELL_NAME_BY_LABEL: Record<string, string> = {
  flash: 'SummonerFlash', destello: 'SummonerFlash',
  ignite: 'SummonerDot', quemadura: 'SummonerDot',
  heal: 'SummonerHeal', curar: 'SummonerHeal', curacion: 'SummonerHeal',
  teleport: 'SummonerTeleport', teletransportacion: 'SummonerTeleport',
  smite: 'SummonerSmite', castigo: 'SummonerSmite',
  exhaust: 'SummonerExhaust', agotar: 'SummonerExhaust',
  barrier: 'SummonerBarrier', barrera: 'SummonerBarrier',
  cleanse: 'SummonerBoost', purificar: 'SummonerBoost',
  ghost: 'SummonerHaste', fantasma: 'SummonerHaste',
  clarity: 'SummonerMana', claridad: 'SummonerMana',
  mark: 'SummonerSnowball', snowball: 'SummonerSnowball', bola: 'SummonerSnowball',
};

const SPELL_ID_TO_NAME: Record<number, string> = {
  1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash', 6: 'SummonerHaste',
  7: 'SummonerHeal', 11: 'SummonerSmite', 12: 'SummonerTeleport', 13: 'SummonerMana',
  14: 'SummonerDot', 21: 'SummonerBarrier', 32: 'SummonerSnowball',
};

export const spellIconUrl = (patch: PatchInfo | null, spell: number | string): string | null => {
  // No exigir patch.version para fallar en silencio: usar latest si falta.
  const ver = patch?.version || '15.1.1';
  if (spell === 0 || spell == null || spell === '') return null;
  let name = '';
  if (typeof spell === 'number') {
    name = SPELL_ID_TO_NAME[spell] || '';
  } else {
    const s = String(spell);
    const m = s.match(/Summoner(?!Spell)[A-Za-z]+/);
    if (m) name = m[0];
    else if (s.startsWith('Summoner')) name = s.replace(/_Description.*$/, '').split('_')[0] || s;
    if (!name.startsWith('Summoner')) name = SPELL_NAME_BY_LABEL[norm(s)] || '';
  }
  return name ? `https://ddragon.leagueoflegends.com/cdn/${ver}/img/spell/${name}.png` : null;
};

const KEYSTONE_PATHS: Record<number, string> = {
  8005: 'Precision/PressTheAttack/PressTheAttack',
  8008: 'Precision/LethalTempo/LethalTempoTemp',
  8021: 'Precision/FleetFootwork/FleetFootwork',
  8010: 'Precision/Conqueror/Conqueror',
  8112: 'Domination/Electrocute/Electrocute',
  8124: 'Domination/Predator/Predator',
  8128: 'Domination/DarkHarvest/DarkHarvest',
  9923: 'Domination/HailOfBlades/HailOfBlades',
  8214: 'Sorcery/SummonAery/SummonAery',
  8229: 'Sorcery/ArcaneComet/ArcaneComet',
  8230: 'Sorcery/PhaseRush/PhaseRush',
  8437: 'Resolve/GraspOfTheUndying/GraspOfTheUndying',
  8439: 'Resolve/VeteranAftershock/VeteranAftershock',
  8465: 'Resolve/Guardian/Guardian',
  8351: 'Inspiration/GlacialAugment/GlacialAugment',
  8360: 'Inspiration/UnsealedSpellbook/UnsealedSpellbook',
  8369: 'Inspiration/FirstStrike/FirstStrike',
};

const RUNE_PATH_FILES: Record<number, string> = {
  8000: '7201_precision',
  8100: '7200_domination',
  8200: '7202_sorcery',
  8300: '7203_whimsy',
  8400: '7204_resolve',
};

export const keystoneIconUrl = (id: number): string | null => {
  const p = KEYSTONE_PATHS[id];
  return p ? `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${p}.png` : null;
};

/** Generic perk icon: patch map → keystone map → CDragon. */
export const runeIconUrl = (id: number, patch?: PatchInfo | null): string | null => {
  if (!id) return null;
  if (patch?.runeIconById?.[id]) return patch.runeIconById[id];
  const ks = keystoneIconUrl(id);
  if (ks) return ks;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/runesreforged/perk/${id}.png`;
};

export const runePathIconUrl = (styleId: number): string | null => {
  const file = RUNE_PATH_FILES[styleId];
  return file
    ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${file}.png`
    : null;
};

/** Emblemas de rango: varias rutas CDragon + OP.GG (la de static-assets a menudo 404). */
export const rankEmblemUrl = (tier?: string | null): string | null => {
  if (!tier) return null;
  const t = String(tier).toLowerCase().replace(/\s+/g, '');
  if (!t || t === 'none' || t === 'unranked') return null;
  // Mini-crest CDragon (estable) + medallón OP.GG
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/ranked-mini-crests/${t}.png`;
};

export const rankEmblemFallbacks = (tier?: string | null): string[] => {
  if (!tier) return [];
  const t = String(tier).toLowerCase().replace(/\s+/g, '');
  if (!t || t === 'none' || t === 'unranked') return [];
  return [
    `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/ranked-mini-crests/${t}.png`,
    `https://opgg-static.akamaized.net/images/medals_new/${t}.png`,
    `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${t}.png`,
    `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/${t}.png`,
  ];
};

export function ItemIcon(props: {
  patch: PatchInfo | null;
  id: number;
  size?: number;
  trinket?: boolean;
  empty?: boolean;
}) {
  const { patch, id, size = 28, trinket, empty } = props;
  const url = !empty && id > 0 ? itemIconUrl(patch, id) : null;
  return (
    <span
      title={id > 0 ? String(id) : ''}
      style={{
        width: size, height: size, flex: 'none', display: 'inline-block',
        borderRadius: 5, overflow: 'hidden',
        border: `1px solid ${trinket ? 'rgba(200,170,110,.35)' : 'rgba(200,205,214,.18)'}`,
        background: 'rgba(255,255,255,.04)', opacity: empty || !id ? 0.15 : 1,
      }}
    >
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
    </span>
  );
}

export function SpellIcon(props: { patch: PatchInfo | null; spell: number | string; size?: number }) {
  const { patch, spell, size = 20 } = props;
  const url = spellIconUrl(patch, spell);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  return (
    <span
      title={String(spell || '')}
      style={{
        width: size, height: size, flex: 'none', borderRadius: 4, overflow: 'hidden',
        border: '1px solid rgba(200,205,214,.22)', background: '#12131a',
        display: 'inline-grid', placeItems: 'center',
      }}
    >
      {url && !broken ? (
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setBroken(true)}
        />
      ) : (
        <span style={{ fontSize: Math.max(7, size * 0.38), fontWeight: 800, color: 'var(--text-dim)' }}>
          {String(spell || '?').replace(/Summoner/i, '').slice(0, 2).toUpperCase() || '?'}
        </span>
      )}
    </span>
  );
}

export const TIER_ES: Record<string, string> = {
  IRON: 'Hierro', BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro', PLATINUM: 'Platino', EMERALD: 'Esmeralda',
  DIAMOND: 'Diamante', MASTER: 'Maestro', GRANDMASTER: 'Gran Maestro', CHALLENGER: 'Retador',
};
export const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
/** "Esmeralda II · 64 LP" a partir de un snapshot de ranked (null → "Sin rango"). */
export const rankLabel = (r?: { tier?: string | null; division?: string | number | null; lp?: number | null } | null): string => {
  if (!r?.tier) return 'Sin rango';
  const t = String(r.tier).toUpperCase();
  const div = r.division && String(r.division) !== 'NA' && String(r.division) !== 'null' ? ` ${r.division}` : '';
  return `${TIER_ES[t] || r.tier}${div}${r.lp != null ? ` · ${r.lp} LP` : ''}`;
};
export const TIER_COLOR: Record<string, string> = {
  IRON: '#8a8a8a', BRONZE: '#a97142', SILVER: '#b8c4c4', GOLD: '#e8c063',
  PLATINUM: '#4fd1c5', EMERALD: '#2ecc71', DIAMOND: '#7fb8ff',
  MASTER: '#c084fc', GRANDMASTER: '#ef4444', CHALLENGER: '#facc15',
};

export function RankBadge(props: {
  tier?: string | null;
  division?: number | string | null;
  lp?: number | null;
  size?: number;
  /** Preferir medallón OP.GG si viene del perfil. */
  emblemUrl?: string | null;
}) {
  const { tier, division, lp, size = 28, emblemUrl } = props;
  const fallbacks = rankEmblemFallbacks(tier);
  const sources = [emblemUrl, ...fallbacks].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const [src, setSrc] = useState<string | null>(sources[0] || null);
  useEffect(() => {
    setIdx(0);
    setSrc(sources[0] || null);
  }, [tier, emblemUrl]);

  if (!tier) {
    return <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>UNRANKED</span>;
  }
  const color = TIER_COLOR[String(tier).toUpperCase()] || 'var(--text-soft)';
  const divLabel =
    division != null && String(division) !== '0' && String(division) !== 'null'
      ? ` ${division}`
      : '';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {src ? (
        <img
          src={src}
          alt={String(tier)}
          style={{ width: size, height: size, objectFit: 'contain', flex: 'none', filter: 'drop-shadow(0 0 6px rgba(0,0,0,.5))' }}
          onError={() => {
            const next = idx + 1;
            if (next < sources.length) {
              setIdx(next);
              setSrc(sources[next]);
            } else {
              setSrc(null);
            }
          }}
        />
      ) : (
        <span style={{
          width: size, height: size, borderRadius: '50%', flex: 'none',
          background: `radial-gradient(circle at 35% 30%, ${color}55, #0a0a0c)`,
          border: `1px solid ${color}`, display: 'grid', placeItems: 'center',
          fontSize: Math.max(8, size * 0.28), fontWeight: 800, color,
        }}>
          {String(tier).slice(0, 1)}
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: Math.max(11, size * 0.38), fontWeight: 800,
          color, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {tier}{divLabel}
        </span>
        {lp != null && (
          <span style={{ fontSize: Math.max(10, size * 0.32), color: 'var(--text-dim)', fontWeight: 600 }}>
            {lp} LP
          </span>
        )}
      </span>
    </span>
  );
}

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

/** Icono de runa con fallbacks (URL OP.GG/backend → DDragon map → keystone → CDragon). */
export function RuneIcon(props: {
  id: number;
  patch?: PatchInfo | null;
  size?: number;
  title?: string;
  hot?: boolean;
  keystone?: boolean;
  preferSrc?: string | null;
}) {
  const { id, patch, size = 22, title, hot, keystone, preferSrc } = props;
  const [src, setSrc] = useState<string | null>(() => preferSrc || runeIconUrl(id, patch));
  useEffect(() => {
    setSrc(preferSrc || runeIconUrl(id, patch));
  }, [id, patch, preferSrc]);
  const dim = keystone ? size : size;
  if (!id || !src) {
    return (
      <span
        title={title}
        style={{
          width: dim, height: dim, borderRadius: keystone ? '50%' : 4,
          background: 'rgba(255,255,255,.05)',
          border: `1px solid ${hot ? 'var(--crimson)' : 'rgba(255,255,255,.1)'}`,
          display: 'inline-block', flex: 'none',
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={title || ''}
      title={title}
      width={dim}
      height={dim}
      style={{
        width: dim, height: dim, flex: 'none', objectFit: 'cover',
        borderRadius: keystone ? '50%' : 4,
        border: `1px solid ${hot || keystone ? 'rgba(225,36,46,.55)' : 'rgba(200,205,214,.18)'}`,
        background: '#0a0a0c',
        boxShadow: keystone ? '0 0 12px rgba(225,36,46,.45)' : undefined,
      }}
      onError={() => setSrc(null)}
    />
  );
}

/** Barra de daño con riel fijo (evita que se amontone el % del flex). */
export function DmgBar(props: {
  value: number;
  max: number;
  label?: string;
  height?: number;
  showValue?: boolean;
}) {
  const { value, max, label, height = 8, showValue = true } = props;
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="dmg-track" title={label || undefined}>
      <div className="dmg-track-rail" style={{ height }}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className="dmg-track-val mono">{fmtK(value)}</span>
      )}
    </div>
  );
}

// ── Iconos UI (SVG, sin dependencias) ────────────────────────────────────────
export const IconSword = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M13.5 1.5 L9 6 L8 5 L12.5.5 L13.5 1.5 Z" fill={color} opacity=".9" />
    <path d="M8.5 5.5 L3 11 L2 14 L5 13 L10.5 7.5 L8.5 5.5 Z" stroke={color} strokeWidth="1.2" fill="none" />
    <path d="M3 11 L5 13" stroke={color} strokeWidth="1.2" />
  </svg>
);
export const IconGold = ({ size = 12, color = '#c8aa6e' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.3" />
    <path d="M8 5 V11 M6 6.5 H9.5 C10.3 6.5 10.8 7.2 10.8 8 S10.3 9.5 9.5 9.5 H6" stroke={color} strokeWidth="1.2" />
  </svg>
);
export const IconEye = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M1.5 8 C3 4.5 5.5 3 8 3 S13 4.5 14.5 8 C13 11.5 10.5 13 8 13 S3 11.5 1.5 8 Z" stroke={color} strokeWidth="1.2" />
    <circle cx="8" cy="8" r="2.2" fill={color} />
  </svg>
);
export const IconMinion = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="5.5" r="2.5" stroke={color} strokeWidth="1.2" />
    <path d="M4 13 C4 10 5.5 8.5 8 8.5 S12 10 12 13" stroke={color} strokeWidth="1.2" fill="none" />
  </svg>
);
export const IconShield = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5 L13 3.5 V8 C13 11.5 10.5 13.5 8 14.5 C5.5 13.5 3 11.5 3 8 V3.5 L8 1.5 Z" stroke={color} strokeWidth="1.2" fill="none" />
  </svg>
);
export const IconSpark = ({ size = 12, color = '#6db3ff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M9 1 L4 9 H8 L7 15 L12 7 H8 L9 1 Z" fill={color} />
  </svg>
);
export const IconFist = ({ size = 12, color = '#e8a84a' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="3" y="6" width="10" height="7" rx="2" stroke={color} strokeWidth="1.2" />
    <path d="M5 6 V4.5 C5 3.1 6 2.5 7 2.5 H9 C10 2.5 11 3.1 11 4.5 V6" stroke={color} strokeWidth="1.2" />
  </svg>
);

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
