// src/views/ChampSelectView.tsx — Draft LoL + React Bits (TiltedCard / BounceCards).
// Sugerencias de pick en vivo entre cada pick (meta línea + comp + bans).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChampIcon,
  ItemIcon,
  RuneIcon,
  champSplashUrl,
  champLoadingUrl,
  fmtClock,
  posEs,
  usePatch,
  type PatchInfo,
  IconSword,
  IconSpark,
  IconShield,
  IconFist,
} from './shared';
import TiltedCard from '../components/TiltedCard';
import BounceCards, { type BounceCardItem } from '../components/BounceCards';

const asArray = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** Siempre 5 huecos de ban: antes, con 2 bans hechos, solo se pintaban 2. */
const padTo5 = (arr: any[]): any[] => {
  const out = arr.slice(0, 5);
  while (out.length < 5) out.push(null);
  return out;
};
const asText = (v: any): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v?.name ?? v?.id ?? '';
const asItemId = (v: any): number | null => {
  const n = typeof v === 'number' ? v : Number(v?.id ?? v?.itemId ?? v?.itemID ?? v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const asRuneId = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v?.id ?? v);
  return Number.isFinite(n) ? n : 0;
};

// El LCU manda BAN_PICK tanto en baneos como en picks: el paso se decide con el
// tipo de la acción en curso (`actionType`, que añade el main).
const PHASES = ['PLANEACIÓN', 'BANEOS', 'PICKS', 'FINAL'];

function phaseIndex(phase: string, actionType: string): number {
  const p = (phase || '').toUpperCase();
  if (!p) return -1;
  if (p === 'PLANNING') return 0;
  if (p === 'FINALIZATION' || p === 'GAME_STARTING') return 3;
  return (actionType || '').toLowerCase() === 'ban' ? 1 : 2;
}

type CompKey = 'ad' | 'ap' | 'tank' | 'engage' | 'assassin';
const COMP_META: Array<{ key: CompKey; label: string; icon: ReactNode; need: number }> = [
  { key: 'ad', label: 'AD', icon: <IconSword size={11} color="#e8a84a" />, need: 1 },
  { key: 'ap', label: 'AP', icon: <IconSpark size={11} color="#6db3ff" />, need: 1 },
  { key: 'tank', label: 'TANK', icon: <IconShield size={11} color="#8fd99e" />, need: 1 },
  { key: 'engage', label: 'ENGAGE', icon: <IconFist size={11} color="#c9cdd6" />, need: 1 },
  { key: 'assassin', label: 'ASESINO', icon: <IconSword size={11} color="#ff9aa0" />, need: 0 },
];

function classifyTags(tags: string[]): CompKey[] {
  const t = tags.map((x) => x.toLowerCase());
  const out: CompKey[] = [];
  if (t.includes('marksman') || t.includes('fighter')) out.push('ad');
  if (t.includes('mage')) out.push('ap');
  if (t.includes('tank')) out.push('tank');
  if (t.includes('support') || t.includes('tank') || t.includes('fighter')) out.push('engage');
  if (t.includes('assassin')) out.push('assassin');
  if (t.includes('assassin') && !t.includes('mage')) out.push('ad');
  return out;
}

function analyzeComp(picks: Array<{ tags?: string[]; championName?: string }>) {
  const counts: Record<CompKey, number> = { ad: 0, ap: 0, tank: 0, engage: 0, assassin: 0 };
  for (const p of picks) {
    if (!p.championName && !(p.tags && p.tags.length)) continue;
    for (const k of Array.from(new Set(classifyTags(p.tags || [])))) counts[k] += 1;
  }
  const missing = COMP_META.filter((m) => m.need > 0 && counts[m.key] < m.need).map((m) => m.label);
  return { counts, missing };
}

function PickCard({
  p, patch, side, acting, rival, onClick,
}: {
  p: any;
  patch: PatchInfo | null;
  side: 'ally' | 'enemy';
  acting?: boolean;
  /** Marcado como tu rival de línea (borde dorado). */
  rival?: boolean;
  onClick?: () => void;
}) {
  const name = p.championName || '';
  const splash = name ? champSplashUrl(patch, name) : null;
  const loading = name ? champLoadingUrl(patch, name) : null;
  const enemy = side === 'enemy';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      title={onClick && name ? `Marcar a ${name} como tu rival de línea` : undefined}
      className={onClick ? 'no-drag' : undefined}
      style={{
        cursor: onClick && name ? 'pointer' : undefined,
        display: 'flex',
        flexDirection: enemy ? 'row-reverse' : 'row',
        gap: 10,
        alignItems: 'stretch',
        padding: '4px 6px',
        height: 92,
        background: p.isLocal
          ? 'linear-gradient(90deg,rgba(225,36,46,.16),rgba(225,36,46,.04))'
          : 'rgba(10,10,14,.55)',
        border: acting
          ? '1px solid rgba(10,200,185,.75)'
          : rival
            ? '1px solid rgba(200,170,110,.85)'
            : p.isLocal
              ? '1px solid rgba(225,36,46,.45)'
              : '1px solid rgba(200,205,214,.12)',
        boxShadow: acting
          ? '0 0 14px rgba(10,200,185,.35)'
          : rival
            ? '0 0 14px rgba(200,170,110,.3)'
            : undefined,
        position: 'relative',
      }}
    >
      {rival && (
        <span style={{
          position: 'absolute', top: 3,
          left: enemy ? 5 : undefined, right: enemy ? undefined : 5,
          fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: '#c8aa6e',
        }}>
          TU RIVAL
        </span>
      )}
      <div style={{ width: 68, height: 84, flex: 'none' }}>
        <TiltedCard
          imageSrc={loading || splash}
          altText={name || 'empty'}
          captionText={name || undefined}
          containerHeight="100%"
          containerWidth="100%"
          imageHeight="100%"
          imageWidth="100%"
          scaleOnHover={1.08}
          rotateAmplitude={10}
          showTooltip={Boolean(name)}
          overlayContent={
            p.position ? (
              <div style={{
                position: 'absolute', left: 4, bottom: 4, fontSize: 8, fontWeight: 800,
                background: 'rgba(0,0,0,.75)', padding: '1px 5px', color: '#c8aa6e', letterSpacing: '0.08em',
              }}>
                {posEs(p.position).slice(0, 3)}
              </div>
            ) : null
          }
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 6px', textAlign: enemy ? 'right' : 'left' }}>
        <div className="display" style={{
          fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
          color: name ? '#fff' : 'var(--text-faint)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name || 'ESPERANDO…'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, letterSpacing: '0.1em' }}>
          {posEs(p.position || '') || '—'}
          {p.isLocal ? ' · TÚ' : ''}
        </div>
        {Array.isArray(p.tags) && p.tags[0] && (
          <div style={{ marginTop: 4 }}>
            <span className="comp-chip" style={{ padding: '2px 6px', fontSize: 9 }}>{String(p.tags[0]).toUpperCase()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BanSlot({ patch, ban, enemy }: { patch: PatchInfo | null; ban: any; enemy?: boolean }) {
  const name = asText(ban);
  return (
    <span style={{ position: 'relative', width: 36, height: 36, flex: 'none', opacity: name ? 0.85 : 0.25 }}>
      {name ? (
        <ChampIcon patch={patch} name={name} size={36} enemy={enemy} />
      ) : (
        <span style={{ width: 36, height: 36, display: 'block', background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.1)' }} />
      )}
      {name && (
        <span style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: 'var(--crimson)', fontWeight: 900, fontSize: 14, background: 'rgba(225,36,46,.12)',
        }}>✕</span>
      )}
    </span>
  );
}

const Arrow = ({ color = '#E1242E' }: { color?: string }) => (
  <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden>
    <path d="M2 5 H9 M6 1.5 L10 5 L6 8.5" stroke={color} strokeWidth="1.4" fill="none" />
  </svg>
);

export default function ChampSelectView() {
  const patch = usePatch();
  const [cs, setCs] = useState<any>(null);
  const [build, setBuild] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<Array<{
    name: string; winRate: number | null; pickRate: number | null; tier: number | null; reason: string;
    /** Winrate propio contra el rival de línea (0-100), si OP.GG tenía el dato. */
    matchupWinRate?: number | null;
    vsRival?: string;
    goodInto?: string[];
    badInto?: string[];
    covers?: string[];
  }>>([]);
  const [suggLoading, setSuggLoading] = useState(false);
  /** Ya hay sugerencias del meta pintadas; se están afinando con los matchups. */
  const [refining, setRefining] = useState(false);
  /** Rival de línea marcado a mano (clic en una card enemiga). */
  const [rivalOverride, setRivalOverride] = useState('');
  /** Resultado de la última acción sobre el cliente (hover / lock / runas). */
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const offs = [
      window.atak.onChampSelect(setCs),
      window.atak.onChampionBuild(setBuild),
      window.atak.onChampionBuildLoading((p: any) => setBuild({ loading: true, ...p })),
      window.atak.onChampionBuildError((p: any) => setBuild({ error: p?.error || 'Error al cargar la build' })),
      window.atak.onChampSelectEnded(() => {
        setCs(null); setBuild(null); setSuggestions([]); setRivalOverride(''); setFeedback(null);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // El aviso de acción se limpia solo: es un overlay, no un log.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(t);
  }, [feedback]);

  const runAction = useCallback(
    async (kind: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
      setBusy(kind);
      try {
        const r = await fn();
        setFeedback({ ok: r.ok, msg: r.ok ? okMsg : r.error || 'El cliente rechazó la acción' });
      } catch (e: any) {
        setFeedback({ ok: false, msg: e?.message || 'Error de comunicación con el cliente' });
      } finally {
        setBusy('');
      }
    },
    [],
  );

  const phase: string = cs?.phase || '';
  const idx = phaseIndex(phase, cs?.actionType || '');

  // Barra de progreso del timer. El LCU no manda la duración de la fase, así que
  // guardamos el máximo visto EN ESTA fase; antes se recalculaba en cada render
  // (max(30, secs)) y la barra se quedaba clavada al 100% en fases largas.
  const timerSecs = Number(cs?.timerSecs ?? 0);
  const timerMaxRef = useRef<{ phase: string; max: number }>({ phase: '', max: 1 });
  if (timerMaxRef.current.phase !== phase) {
    timerMaxRef.current = { phase, max: Math.max(1, timerSecs) };
  } else if (timerSecs > timerMaxRef.current.max) {
    timerMaxRef.current.max = timerSecs;
  }
  const timerPct = Math.min(100, Math.round((timerSecs / Math.max(1, timerMaxRef.current.max)) * 100));

  const runes = build?.runes;
  const items = build?.items;
  /** Contexto del duelo que devolvió el main (null si no hay rival conocido). */
  const mu = build?.matchup as
    | null
    | {
        rival: string; play: number; winRate: number | null;
        runesPlay: number; runesWinRate: number | null;
        tip: string; playStyle: string; source: 'matchup' | 'general';
        spells: { ids: number[]; names: string[] } | null;
      };
  const tips = asArray(build?.tips).map(asText).filter(Boolean);
  const skill = build?.skillOrder ?? build?.skill_order;
  const skillSeq: string[] = Array.isArray(skill) ? skill.map(asText).filter(Boolean) : [];
  const skillPrio = skillSeq.length >= 3
    ? skillSeq.slice(0, 3).map((s) => s.toUpperCase()).join(' → ')
    : '';

  const counters = build?.counters;
  const strong = asArray(counters?.strongAgainst ?? counters?.strong);
  const weak = asArray(counters?.weakAgainst ?? counters?.weak);

  const winrate = build?.winrate ?? build?.winRate ?? build?.wr;
  const wrNum = winrate != null ? Number(String(winrate).replace('%', '')) : null;
  const pickNum = build?.pickRate != null ? Number(String(build.pickRate).replace('%', '')) : null;
  const banNum = build?.banRate != null ? Number(String(build.banRate).replace('%', '')) : null;

  const name: string = asText(build?.name) || '';
  const tags: string[] = Array.isArray(build?.tags) ? build.tags : [];
  const splash = name ? champSplashUrl(patch, name) : null;
  const loadingArt = name ? champLoadingUrl(patch, name) : null;

  const team: any[] = Array.isArray(cs?.team) ? cs.team : [];
  const enemy: any[] = Array.isArray(cs?.enemy) ? cs.enemy : [];
  const allyBans: any[] = asArray(cs?.bans?.ally);
  const enemyBans: any[] = asArray(cs?.bans?.enemy);

  // Rellenar a 5 slots
  const allySlots = [...team];
  while (allySlots.length < 5) allySlots.push({ championId: 0, championName: '', position: '', tags: [] });
  const enemySlots = [...enemy];
  while (enemySlots.length < 5) enemySlots.push({ championId: 0, championName: '', position: '', tags: [] });

  const comp = useMemo(() => analyzeComp(team), [team]);
  const pathLabel = [asText(runes?.primaryPath), asText(runes?.secondaryPath)].filter(Boolean).join(' + ').toUpperCase();

  // ── Rival de línea ────────────────────────────────────────────────────────
  // En cola solo el LCU no siempre expone la posición del enemigo, así que:
  // 1) el enemigo con tu misma posición asignada, 2) el que marques con un clic.
  const myPos = String(cs?.localPlayerPosition || '');
  const autoRival = useMemo(() => {
    if (!myPos) return '';
    const hit = enemy.find(
      (p: any) => p.championName && String(p.position || '').toUpperCase() === myPos.toUpperCase(),
    );
    return hit?.championName || '';
  }, [enemy, myPos]);
  const rival = rivalOverride || autoRival;

  // Key de draft para re-fetch de sugerencias entre cada pick/ban
  const draftKey = useMemo(() => {
    const picks = [...team, ...enemy].map((p) => p.championName || p.championId || '').join(',');
    const bans = [...allyBans, ...enemyBans].map(asText).join(',');
    const missing = comp.missing.join(',');
    return `${myPos}|${rival}|${picks}|${bans}|${missing}`;
  }, [team, enemy, allyBans, enemyBans, myPos, rival, comp.missing]);

  // Sugerencias SIEMPRE durante draft (no solo al elegir campeón), ajustadas al
  // draft real: se puntúan con el winrate contra el rival y contra los enemigos
  // ya elegidos. Con debounce porque el LCU emite en cada tick del timer.
  useEffect(() => {
    if (!cs) return;
    let cancelled = false;
    const bannedNames = [...allyBans, ...enemyBans].map(asText).filter(Boolean);
    const pickedNames = [...team, ...enemy].map((p) => p.championName).filter(Boolean);
    const enemyNames = enemy.map((p: any) => p.championName).filter(Boolean);

    setSuggLoading(true);
    const base = {
      position: myPos || 'MIDDLE',
      missingRoles: comp.missing,
      bannedNames,
      pickedNames,
      enemyNames,
      rivalName: rival,
      limit: 6,
    };

    const t = setTimeout(async () => {
      // Dos fases: primero el meta de la línea (una sola llamada, casi
      // instantánea) para pintar algo ya, y luego el pase con los matchups
      // reales, que son varias llamadas al MCP y puede tardar segundos.
      try {
        const fast = await window.atak.opggPickSuggestions({ ...base, deep: false });
        if (!cancelled && Array.isArray(fast) && fast.length) {
          setSuggestions(fast);
          setSuggLoading(false);
          setRefining(true);
        }
      } catch { /* si falla, lo intenta el pase profundo */ }

      try {
        const deep = await window.atak.opggPickSuggestions({ ...base, deep: true });
        if (!cancelled && Array.isArray(deep) && deep.length) setSuggestions(deep);
      } catch {
        if (!cancelled) setSuggestions((prev) => prev);
      } finally {
        if (!cancelled) { setSuggLoading(false); setRefining(false); }
      }
    }, 600);

    return () => { cancelled = true; clearTimeout(t); };
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Campeón del jugador local (para poder volver desde una vista previa).
  const myChampName = useMemo(
    () => asText(team.find((p: any) => p.isLocal)?.championName),
    [team],
  );
  // Estamos viendo la build de una sugerencia, no la de nuestro pick.
  const previewing =
    Boolean(build?.preview) &&
    Boolean(name) &&
    name.toLowerCase() !== myChampName.toLowerCase();

  const showBuildFor = useCallback(
    (championName: string) => {
      if (!championName) return;
      void window.atak.championPreview(championName, myPos || 'MIDDLE', rival);
    },
    [myPos, rival],
  );

  // Clic en una sugerencia: la deja en hover en el cliente (reversible) y trae
  // sus runas del matchup. El lock-in va aparte, con su propio botón.
  const pickSuggestion = useCallback(
    (championName: string) => {
      showBuildFor(championName);
      void runAction('hover', () => window.atak.champSelectHover(championName), `${championName} en hover`);
    },
    [showBuildFor, runAction],
  );

  // Cuando ya tienes campeón y se conoce el rival, las runas se recalculan para
  // ESE duelo (el main cae a la build de línea si no hay muestra suficiente).
  useEffect(() => {
    if (!myChampName || !rival) return;
    void window.atak.championPreview(myChampName, myPos || 'MIDDLE', rival);
  }, [myChampName, rival, myPos]);

  const bounceItems: BounceCardItem[] = useMemo(() => {
    return suggestions.map((s) => {
      const img = champLoadingUrl(patch, s.name) || champSplashUrl(patch, s.name);
      // Si tenemos el duelo, el dato que manda es el winrate contra el rival.
      const sub = s.matchupWinRate != null
        ? `${s.matchupWinRate}% vs ${s.vsRival}`
        : s.winRate != null
          ? `T${s.tier ?? '?'} · ${s.winRate}%`
          : (s.reason || '');
      return {
        key: s.name,
        image: img,
        label: s.name,
        sublabel: sub,
        title: `${s.name} — hover en el cliente + runas del matchup${s.reason ? `\n${s.reason}` : ''}`,
        selected: name.toLowerCase() === s.name.toLowerCase(),
        onClick: () => pickSuggestion(s.name),
      };
    });
  }, [suggestions, patch, name, pickSuggestion]);

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: '#050608',
        border: '1px solid rgba(200,205,214,.2)',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Barra de arrastre (ventana movible, no always-on-top) */}
      <div className="drag" style={{
        height: 32, flex: 'none', zIndex: 5, display: 'flex', alignItems: 'center',
        padding: '0 10px 0 14px', borderBottom: '1px solid rgba(200,205,214,.12)',
        background: 'linear-gradient(180deg,#14151c,#0a0a0c)',
      }}>
        <span className="metal-text" style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.16em' }}>ATAK</span>
        <span style={{ marginLeft: 10, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          CHAMP SELECT · arrastra para mover
        </span>
        <button
          type="button"
          className="tb-btn close no-drag"
          onClick={() => window.atak.win('close')}
          style={{ marginLeft: 'auto', width: 36, height: 26 }}
          aria-label="Cerrar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>

      {/* Fondo splash cinematic */}
      {splash && (
        <div style={{ position: 'absolute', inset: 0, top: 32, pointerEvents: 'none', overflow: 'hidden' }}>
          <img
            src={splash}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%',
              opacity: 0.28, filter: 'saturate(0.9) brightness(0.55)', transform: 'scale(1.06)',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg,#050608 0%,rgba(5,6,8,.55) 28%,rgba(5,6,8,.35) 50%,rgba(5,6,8,.55) 72%,#050608 100%), linear-gradient(180deg,rgba(5,6,8,.3) 0%,#050608 100%)',
          }} />
        </div>
      )}

      {/* ── Header fases + timer ── */}
      <div style={{
        position: 'relative', zIndex: 2, flex: 'none',
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '10px 20px 8px',
        borderBottom: '1px solid rgba(200,205,214,.12)',
        background: 'rgba(5,6,8,.65)',
      }}>
        <div className="display" style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.2em', color: 'var(--crimson)' }}>
          DRAFT
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {PHASES.map((label, i) => (
            <span key={label} style={{ display: 'contents' }}>
              <span style={{
                fontSize: 10, letterSpacing: '0.14em', fontWeight: i === idx ? 700 : 500,
                color: i === idx ? '#fff' : i < idx ? 'var(--text-dim)' : 'var(--text-faint)',
                borderBottom: i === idx ? '2px solid var(--crimson)' : '2px solid transparent',
                paddingBottom: 2,
              }}>
                {label}
              </span>
              {i < PHASES.length - 1 && <span style={{ flex: 1, height: 1, background: 'var(--line)', maxWidth: 48 }} />}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, minWidth: 88 }}>
          <span className="mono badge-glow" style={{
            fontWeight: 700, fontSize: 18, color: 'var(--crimson)',
            border: '1px solid rgba(225,36,46,.5)', padding: '1px 10px',
          }}>
            {cs ? fmtClock(timerSecs) : '—'}
          </span>
          <div style={{ width: 88, height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${timerPct}%`, height: '100%',
              background: 'linear-gradient(90deg,#7d1017,#E1242E)',
              transition: 'width 0.8s linear',
            }} />
          </div>
        </div>
      </div>

      {/* ── Cuerpo 3 columnas ── */}
      <div style={{
        position: 'relative', zIndex: 1, flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '240px 1fr 240px',
        gap: 0,
      }}>
        {/* ALIADOS */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 10px',
          borderRight: '1px solid rgba(109,179,255,.18)',
          background: 'linear-gradient(90deg,rgba(109,179,255,.06),transparent)',
          minHeight: 0, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: '#6db3ff', boxShadow: '0 0 8px #6db3ff' }} />
            <span className="label" style={{ color: '#6db3ff' }}>TU EQUIPO</span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
            {padTo5(allyBans).map((b, i) => (
              <BanSlot key={i} patch={patch} ban={b} />
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0, overflow: 'auto' }}>
            {allySlots.slice(0, 5).map((p, i) => (
              <PickCard key={i} p={p} patch={patch} side="ally" acting={Boolean(p.acting)} />
            ))}
          </div>
          {/* Comp analysis */}
          <div style={{ marginTop: 4 }}>
            <div className="label" style={{ marginBottom: 5 }}>COMP</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {COMP_META.map((m) => {
                const n = comp.counts[m.key];
                const miss = m.need > 0 && n < m.need;
                const ok = n >= Math.max(1, m.need);
                return (
                  <span key={m.key} className={`comp-chip${ok ? ' ok' : ''}${miss ? ' miss' : ''}`}>
                    {m.icon}<span>{m.label}</span><span className="n">{n}</span>
                  </span>
                );
              })}
            </div>
            {comp.missing.length > 0 && (
              <div className="tip hot" style={{ marginTop: 6, fontSize: 10.5 }}>
                Falta: <strong>{comp.missing.join(' · ')}</strong>
              </div>
            )}
          </div>
        </div>

        {/* CENTRO — splash + meta */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          {/* Hero name over splash */}
          <div style={{
            flex: 'none', padding: '18px 24px 8px', textAlign: 'center',
          }}>
            <div className="metal-text-bright" style={{
              fontWeight: 800, fontSize: name ? 42 : 28, letterSpacing: '0.16em',
              textTransform: 'uppercase', lineHeight: 1.05,
              textShadow: '0 4px 24px rgba(0,0,0,.8)',
            }}>
              {name || 'ELIGE CAMPEÓN'}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              {cs?.localPlayerPosition && (
                <span style={{ fontSize: 12, letterSpacing: '0.16em', color: 'var(--text-soft)' }}>
                  {posEs(cs.localPlayerPosition)}{tags[0] ? ` · ${String(tags[0]).toUpperCase()}` : ''}
                </span>
              )}
              {build?.source === 'opgg' && (
                <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>META OP.GG</span>
              )}
              {patch?.version && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  Parche {String(patch.version).split('.').slice(0, 2).join('.')}
                </span>
              )}
            </div>

            {/* Acciones sobre el cliente — siempre a golpe de botón, nunca solas */}
            {name && (
              <div className="no-drag" style={{
                marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  disabled={busy === 'lock'}
                  onClick={() => runAction('lock', () => window.atak.champSelectLock(name), `${name} bloqueado`)}
                  style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.14em',
                    color: '#fff', background: 'linear-gradient(180deg,#a5151d,#7d1017)',
                    border: '1px solid rgba(225,36,46,.8)', padding: '7px 16px', cursor: 'pointer',
                    opacity: busy === 'lock' ? 0.6 : 1,
                  }}
                >
                  {busy === 'lock' ? 'BLOQUEANDO…' : `BLOQUEAR ${name.toUpperCase()}`}
                </button>
                <button
                  type="button"
                  disabled={busy === 'runes' || !build?.runePage}
                  title={build?.runePage ? 'Crea la página en tu cliente y la deja activa' : 'Sin página de runas disponible'}
                  onClick={() => runAction(
                    'runes',
                    () => window.atak.applyRunes(build.runePage),
                    `Runas de ${name} puestas en el cliente`,
                  )}
                  style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.14em',
                    color: build?.runePage ? '#c8aa6e' : 'var(--text-faint)',
                    background: 'rgba(200,170,110,.08)',
                    border: `1px solid ${build?.runePage ? 'rgba(200,170,110,.55)' : 'rgba(200,205,214,.18)'}`,
                    padding: '7px 16px', cursor: build?.runePage ? 'pointer' : 'not-allowed',
                    opacity: busy === 'runes' ? 0.6 : 1,
                  }}
                >
                  {busy === 'runes' ? 'APLICANDO…' : 'PONER RUNAS'}
                </button>
              </div>
            )}

            {feedback && (
              <div style={{
                marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                color: feedback.ok ? '#8fd99e' : 'var(--crimson-soft)',
              }}>
                {feedback.msg}
              </div>
            )}

            {/* Barras WR / PR / BR */}
            {(wrNum != null || pickNum != null || banNum != null) && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                marginTop: 14, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto',
              }}>
                {[
                  { k: 'WIN RATE', v: wrNum, color: '#4dbb63' },
                  { k: 'PICK RATE', v: pickNum, color: '#6db3ff' },
                  { k: 'BAN RATE', v: banNum, color: '#E1242E' },
                ].map((s) => (
                  <div key={s.k} style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 3 }}>
                      <span>{s.k}</span>
                      <span className="mono" style={{ color: '#fff' }}>{s.v != null ? `${s.v}%` : '—'}</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, s.v ?? 0)}%`, height: '100%',
                        background: s.color, boxShadow: `0 0 8px ${s.color}66`,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel meta scrolleable */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto',
            padding: '8px 20px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Sugerencias BounceCards — se actualizan entre cada pick */}
            <div className="panel no-drag" style={{ padding: '12px 14px', background: 'rgba(10,10,14,.78)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="label" style={{ color: '#c8aa6e' }}>
                  SUGERENCIAS DE PICK
                  {cs?.localPlayerPosition ? ` · ${posEs(cs.localPlayerPosition)}` : ''}
                  <span style={{ marginLeft: 8, color: 'var(--text-faint)', fontWeight: 500 }}>
                    {rival ? `· vs ${rival} · clic = hover + runas` : '· clic = hover + runas'}
                  </span>
                  {refining && (
                    <span style={{ marginLeft: 8, color: '#c8aa6e', fontWeight: 500 }}>· afinando con el matchup…</span>
                  )}
                </div>
                {previewing ? (
                  <button
                    type="button"
                    className="no-drag"
                    onClick={() => showBuildFor(myChampName)}
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      color: '#fff', background: 'rgba(225,36,46,.18)',
                      border: '1px solid rgba(225,36,46,.5)', padding: '3px 8px', cursor: 'pointer',
                    }}
                    title={`Volver a la build de ${myChampName}`}
                  >
                    VISTA PREVIA · VOLVER A {myChampName.toUpperCase()}
                  </button>
                ) : comp.missing.length > 0 ? (
                  <span style={{ fontSize: 10, color: 'var(--crimson-soft)', fontWeight: 700 }}>
                    Falta: {comp.missing.join(' · ')}
                  </span>
                ) : null}
              </div>
              {suggLoading && !bounceItems.length ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 12 }}>
                  <span className="dot" />
                  <span className="label">ANALIZANDO META…</span>
                </div>
              ) : bounceItems.length > 0 ? (
                <>
                  <BounceCards items={bounceItems} cardWidth={92} cardHeight={118} animationDelay={0.05} />
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>
                    {suggestions[0]?.reason || 'Meta OP.GG · se actualiza en cada pick/ban'}
                  </div>
                </>
              ) : (
                <div className="label" style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 8 }}>
                  Sin sugerencias (bans/picks o OP.GG offline)
                </div>
              )}
            </div>

            {/* Hero TiltedCard del campeón local cuando hay pick */}
            {name && (loadingArt || splash) && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <TiltedCard
                  imageSrc={loadingArt || splash}
                  altText={name}
                  captionText={name}
                  containerHeight={160}
                  containerWidth={120}
                  imageHeight={160}
                  imageWidth={120}
                  scaleOnHover={1.1}
                  rotateAmplitude={14}
                  overlayContent={
                    <div style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 6px 6px',
                      background: 'linear-gradient(transparent,rgba(0,0,0,.9))', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '0.08em' }}>{name}</div>
                    </div>
                  }
                />
              </div>
            )}

            {build?.loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <span className="dot" />
                <span className="label">CARGANDO META OP.GG…</span>
              </div>
            )}
            {build?.error && <div className="tip hot" style={{ color: 'var(--crimson-soft)' }}>{String(build.error)}</div>}
            {!build && !name && (
              <div className="label" style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                ELIGE UN CAMPEÓN PARA VER RUNAS Y BUILD · las sugerencias ya están arriba
              </div>
            )}

            {/* Runas */}
            {runes && (
              <div className="panel" style={{ padding: '12px 14px', background: 'rgba(10,10,14,.72)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div className="label">
                    {mu?.source === 'matchup' ? `RUNAS VS ${String(mu.rival).toUpperCase()}` : 'RUNAS'}
                    {pathLabel ? ` · ${pathLabel}` : ''}
                  </div>
                  {mu && (
                    <span style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                      {mu.source === 'matchup'
                        ? `${mu.runesPlay} partidas del duelo${mu.runesWinRate != null ? ` · ${mu.runesWinRate}% WR` : ''}`
                        : `sin muestra vs ${mu.rival} · meta de línea`}
                    </span>
                  )}
                </div>

                {/* Tip del duelo (OP.GG solo lo publica en inglés) */}
                {mu?.tip && (
                  <div className="tip hot" style={{ marginBottom: 8, fontSize: 10.5, lineHeight: 1.4 }}>
                    <span style={{ color: '#c8aa6e', fontWeight: 800, marginRight: 6 }}>VS {String(mu.rival).toUpperCase()} (EN)</span>
                    {mu.tip}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <RuneIcon
                      id={asRuneId(runes.keystone)}
                      patch={patch}
                      size={56}
                      keystone
                      hot
                      preferSrc={typeof runes.keystone?.icon === 'string' ? runes.keystone.icon : null}
                      title={asText(runes.keystone)}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-soft)', maxWidth: 90, textAlign: 'center' }}>
                      {asText(runes.keystone)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {asArray(runes.primary).map((r, i) => (
                        <RuneIcon key={i} id={asRuneId(r)} patch={patch} size={26} hot={i === 0}
                          preferSrc={typeof r?.icon === 'string' ? r.icon : null} title={asText(r)} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>SEC</span>
                      {asArray(runes.secondary).map((r, i) => (
                        <RuneIcon key={i} id={asRuneId(r)} patch={patch} size={22}
                          preferSrc={typeof r?.icon === 'string' ? r.icon : null} title={asText(r)} />
                      ))}
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.1em', marginLeft: 6 }}>FRAG</span>
                      {asArray(runes.shards).map((sh, i) => (
                        <RuneIcon key={i} id={asRuneId(sh)} patch={patch} size={18}
                          preferSrc={typeof sh?.icon === 'string' ? sh.icon : null} title={asText(sh)} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Build + skills en fila */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
              {items && (asArray(items.starter).length > 0 || asArray(items.core).length > 0) && (
                <div className="panel" style={{ padding: '12px 14px', background: 'rgba(10,10,14,.72)' }}>
                  <div className="label" style={{ marginBottom: 8 }}>BUILD RECOMENDADA</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {asArray(items.starter).map((it, i) => {
                      const id = asItemId(it);
                      return id ? <ItemIcon key={`s${i}`} patch={patch} id={id} size={32} /> : null;
                    })}
                    {asArray(items.starter).length > 0 && asArray(items.core).length > 0 && <Arrow />}
                    {asArray(items.core).map((it, i) => {
                      const id = asItemId(it);
                      return id ? <ItemIcon key={`c${i}`} patch={patch} id={id} size={32} /> : null;
                    })}
                    {asArray(items.boots).length > 0 && <Arrow color="#9ba0ab" />}
                    {asArray(items.boots).map((it, i) => {
                      const id = asItemId(it);
                      return id ? <ItemIcon key={`b${i}`} patch={patch} id={id} size={32} /> : null;
                    })}
                  </div>
                </div>
              )}
              {(skillSeq.length > 0 || skillPrio) && (
                <div className="panel" style={{ padding: '12px 14px', background: 'rgba(10,10,14,.72)' }}>
                  <div className="label" style={{ marginBottom: 8 }}>
                    SKILLS{skillPrio ? ` · ${skillPrio}` : ''}
                  </div>
                  {skillSeq.length > 3 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(15, skillSeq.length)},1fr)`, gap: 2 }}>
                      {skillSeq.slice(0, 15).map((k, i) => {
                        const K = k.toUpperCase();
                        return <span key={i} className={`sk${K === 'R' ? ' r' : K === skillSeq[0]?.toUpperCase() ? ' q' : ''}`}>{K}</span>;
                      })}
                    </div>
                  ) : skillSeq.length > 0 ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {skillSeq.map((k, i) => (
                        <span key={i} style={{ display: 'contents' }}>
                          <span className={`sk${i === 0 ? ' q' : ''}`} style={{ width: 24, height: 24 }}>{k.toUpperCase()}</span>
                          {i < skillSeq.length - 1 && <Arrow color="#9ba0ab" />}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Counters */}
            {(strong.length > 0 || weak.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="panel" style={{ padding: '10px 12px', background: 'rgba(10,10,14,.72)' }}>
                  <div className="label" style={{ marginBottom: 6, color: '#8fd99e' }}>FAVORABLE</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {strong.slice(0, 5).map((c, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <ChampIcon patch={patch} name={asText(c)} size={34} style={{ boxShadow: '0 0 0 1px #4d6b52' }} />
                        {typeof c?.winRate === 'number' && (
                          <div className="mono" style={{ fontSize: 9, color: '#8fd99e', marginTop: 2 }}>{c.winRate}%</div>
                        )}
                      </div>
                    ))}
                    {!strong.length && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>}
                  </div>
                </div>
                <div className="panel" style={{ padding: '10px 12px', background: 'rgba(10,10,14,.72)' }}>
                  <div className="label" style={{ marginBottom: 6, color: 'var(--crimson)' }}>DÉBIL CONTRA</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {weak.slice(0, 5).map((c, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <ChampIcon patch={patch} name={asText(c)} size={34} enemy style={{ boxShadow: '0 0 0 1px #E1242E' }} />
                        {typeof c?.winRate === 'number' && (
                          <div className="mono" style={{ fontSize: 9, color: 'var(--crimson-soft)', marginTop: 2 }}>{c.winRate}%</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tips */}
            {tips.length > 0 && (
              <div className="panel" style={{ padding: '10px 12px', background: 'rgba(10,10,14,.72)' }}>
                <div className="label" style={{ marginBottom: 6 }}>CONSEJOS ATAK</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {tips.map((t, i) => (
                    <div key={i} className={`tip${i === 0 ? ' hot' : ''}`}>{t}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ENEMIGOS */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 10px',
          borderLeft: '1px solid rgba(225,36,46,.22)',
          background: 'linear-gradient(270deg,rgba(225,36,46,.07),transparent)',
          minHeight: 0, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, justifyContent: 'flex-end' }}>
            <span className="label" style={{ color: 'var(--crimson)' }}>ENEMIGO</span>
            <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: 'var(--crimson)', boxShadow: '0 0 8px var(--crimson)' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {padTo5(enemyBans).map((b, i) => (
              <BanSlot key={i} patch={patch} ban={b} enemy />
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0, overflow: 'auto' }}>
            {enemySlots.slice(0, 5).map((p, i) => (
              <PickCard
                key={i}
                p={p}
                patch={patch}
                side="enemy"
                acting={Boolean(p.acting)}
                rival={Boolean(p.championName) && p.championName === rival}
                onClick={p.championName ? () => setRivalOverride(
                  rivalOverride === p.championName ? '' : p.championName,
                ) : undefined}
              />
            ))}
          </div>
          <div style={{ marginTop: 4, textAlign: 'right' }}>
            <div className="label" style={{ marginBottom: 5 }}>
              {rival ? `RIVAL: ${rival.toUpperCase()}` : 'CLIC EN UN ENEMIGO = TU RIVAL'}
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {enemy.filter((p) => p.championId).map((p, i) => (
                <ChampIcon key={i} patch={patch} name={p.championName} size={28} enemy />
              ))}
              {!enemy.some((p) => p.championId) && (
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Aún ocultos</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
