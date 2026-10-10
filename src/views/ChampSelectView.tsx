// src/views/ChampSelectView.tsx — Champ select con el kit "Arena" (hextech.css,
// el lenguaje del sitio ATAK.GG) y la densidad de Blitz: campeón 3D en el centro, árbol de
// runas completo, grilla de skills, items por etapas y sugerencias de pick en
// vivo. Datos reales: LCU (draft) + OP.GG (build/matchup/sugerencias).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChampIcon,
  champSlug,
  champSplashUrl,
  champLoadingUrl,
  fmtClock,
  norm,
  openChampionPage,
  posEs,
  spellIconUrl,
  usePatch,
  TIER_COLOR,
  TIER_ES,
  type PatchInfo,
  IconSword,
  IconSpark,
  IconShield,
  IconFist,
} from './shared';
import BounceCards, { type BounceCardItem } from '../components/BounceCards';
import ChampionDance from './ChampionDance';
import DraftAiPanel, { type DraftAiRequest } from './DraftAiPanel';
import { EASE, rise, staggerParent, swap, Blip } from '../motion';
import {
  HxArrow, HxBar, HxFullBuild, HxHex, HxItemStage, HxPanel, HxRuneTree, HxSkillGrid, HxSlot, HxSlotMini, HxTabs, champFaceUrl,
} from './hextech';
import './champselect-motion.css';

// ── Presets de movimiento ────────────────────────────────────────────────────
const xfade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.15, delay: 0.1, ease: EASE } },
};
const pop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE } },
};
const slideCol = (fromX: number) => ({
  hidden: { opacity: 0, x: fromX },
  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE, staggerChildren: 0.07, delayChildren: 0.1 } },
});
const slideCard = (fromX: number) => ({
  hidden: { opacity: 0, x: fromX },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
});
const centerCol = {
  hidden: { opacity: 0, scale: 0.985 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
};
// Título: entra deslizando (solo transform + opacity).
const title = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, x: 10, transition: { duration: 0.18, ease: EASE } },
};
const PHASES = ['PLANEACIÓN', 'BANEOS', 'PICKS', 'FINAL'];
const PHASE_TITLES = ['PLANEACIÓN', 'FASE DE BANEOS', 'FASE DE PICKS', 'DRAFT CERRADO'];

// ── Helpers de datos ─────────────────────────────────────────────────────────
const asArray = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const padTo5 = (arr: any[]): any[] => { const out = arr.slice(0, 5); while (out.length < 5) out.push(null); return out; };
const asText = (v: any): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v?.name ?? v?.id ?? '');
const asItemId = (v: any): number => { const n = typeof v === 'number' ? v : Number(v?.id ?? v?.itemId ?? v?.itemID ?? v); return Number.isFinite(n) && n > 0 ? n : 0; };
const asRuneId = (v: any): number => { const n = typeof v === 'number' ? v : Number(v?.id ?? v); return Number.isFinite(n) ? n : 0; };

// Clases DDragon → español (las etiquetas salían en inglés).
const TAG_ES: Record<string, string> = {
  fighter: 'LUCHADOR', tank: 'TANQUE', mage: 'MAGO', assassin: 'ASESINO', marksman: 'TIRADOR', support: 'APOYO',
};
const tagEs = (t: any): string => TAG_ES[String(t || '').toLowerCase()] || String(t || '').toUpperCase();
const fmtPts = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

// Meta OP.GG del campeón en su rol (tier/WR) para el chip de cada slot.
type ChampMeta = { winRate: number | null; pickRate: number | null; banRate: number | null; tier: number | null; rank: number | null } | null;
const metaCache = new Map<string, Promise<ChampMeta>>();
function useChampMeta(championName: string, position: string): ChampMeta {
  const [meta, setMeta] = useState<ChampMeta>(null);
  useEffect(() => {
    if (!championName) { setMeta(null); return; }
    const key = `${championName}|${position}`;
    if (!metaCache.has(key)) {
      metaCache.set(key, window.atak.champMeta(championName, position).catch(() => null));
    }
    let alive = true;
    metaCache.get(key)!.then((m) => { if (alive) setMeta(m); });
    return () => { alive = false; };
  }, [championName, position]);
  return meta;
}

function phaseIndex(phase: string, actionType: string): number {
  const p = (phase || '').toUpperCase();
  if (!p) return -1;
  if (p === 'PLANNING') return 0;
  if (p === 'FINALIZATION' || p === 'GAME_STARTING') return 3;
  return (actionType || '').toLowerCase() === 'ban' ? 1 : 2;
}

type CompKey = 'ad' | 'ap' | 'tank' | 'engage' | 'assassin';
const COMP_META: Array<{ key: CompKey; label: string; icon: ReactNode; need: number }> = [
  { key: 'ad', label: 'AD', icon: <IconSword size={11} color="currentColor" />, need: 1 },
  { key: 'ap', label: 'AP', icon: <IconSpark size={11} color="currentColor" />, need: 1 },
  { key: 'tank', label: 'TANK', icon: <IconShield size={11} color="currentColor" />, need: 1 },
  { key: 'engage', label: 'ENGAGE', icon: <IconFist size={11} color="currentColor" />, need: 1 },
  { key: 'assassin', label: 'ASESINO', icon: <IconSword size={11} color="currentColor" />, need: 0 },
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

// ── Piezas ───────────────────────────────────────────────────────────────────
function PlayerSlot({ p, patch, side, rival, onClick }: {
  p: any; patch: PatchInfo | null; side: 'left' | 'right'; rival?: boolean; onClick?: () => void;
}) {
  const name: string = p.championName || '';
  const face = name ? champFaceUrl(patch, name, p.championId) : null;
  const art = name ? champSplashUrl(patch, name) : null;
  const meta = useChampMeta(name, p.position || '');
  const rank = p.rank && p.rank.tier ? p.rank : null;
  const tierKey = rank ? String(rank.tier).toUpperCase() : '';
  const spells: number[] = Array.isArray(p.spells) ? p.spells.filter(Boolean) : [];
  const right = side === 'right';
  return (
    <motion.div variants={slideCard(right ? 16 : -16)}>
      <HxSlot
        side={side}
        local={Boolean(p.isLocal)}
        acting={Boolean(p.acting)}
        rival={rival}
        enemy={right}
        onClick={onClick}
        art={art}
        title={onClick && name ? `Marcar a ${name} como tu rival de línea` : undefined}
      >
        {spells.length > 0 && <HxSlotMini patch={patch} spells={spells} />}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={name || 'empty'} {...xfade} style={{ display: 'inline-flex' }}>
            <HxHex src={face} size={44} tone={name ? (p.acting ? 'cyan' : p.isLocal ? 'crimson' : undefined) : 'dim'} letter="?" />
          </motion.span>
        </AnimatePresence>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <motion.div key={name || 'empty'} className="hx-slot-name" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
            style={{ color: name ? '#fff' : 'var(--hx-faint)' }}>
            {name || 'ESPERANDO…'}
          </motion.div>
          <div className="hx-slot-sub" style={{ marginTop: 0 }}>
            {p.summonerName ? <span style={{ color: 'var(--hx-ink)', textTransform: 'none', letterSpacing: '0.01em' }}>{p.summonerName}</span> : null}
            {p.summonerName ? ' · ' : ''}{posEs(p.position || '') || (p.summonerName ? '' : '—')}
            {Array.isArray(p.tags) && p.tags[0] ? ` · ${tagEs(p.tags[0])}` : ''}{p.isLocal ? ' · TÚ' : ''}{rival ? ' · TU RIVAL' : ''}
          </div>
          {(rank || p.mastery || (name && meta)) && (
            <div className="cs-slot-pills" style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: right ? 'flex-end' : 'flex-start', marginTop: 1 }}>
              {rank && (
                <span className="hx-pill" style={{ ['--c' as any]: TIER_COLOR[tierKey] || 'var(--hx-ink-2)', textTransform: 'none' }}>
                  {TIER_ES[tierKey] || rank.tier}{rank.division && rank.division !== 'NA' ? ` ${rank.division}` : ''} · {rank.lp} LP
                </span>
              )}
              {p.mastery && p.mastery.points > 0 && (
                <span className="hx-pill gold" title={`${p.mastery.points.toLocaleString()} puntos de maestría`}>M{p.mastery.level} · {fmtPts(p.mastery.points)}</span>
              )}
              {name && meta && (meta.tier != null || meta.winRate != null) && (
                <span className={`hx-pill${meta.winRate != null && meta.winRate >= 50 ? ' ok' : meta.winRate != null ? ' miss' : ''}`} title="Tier y win rate del campeón en este rol (OP.GG)">
                  {meta.tier != null ? `T${meta.tier}` : ''}{meta.tier != null && meta.winRate != null ? ' · ' : ''}{meta.winRate != null ? `${meta.winRate}%` : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </HxSlot>
    </motion.div>
  );
}

function BanSquare({ patch, ban }: { patch: PatchInfo | null; ban: any }) {
  const name = asText(ban);
  const face = name ? champFaceUrl(patch, name, Number(ban?.id) || 0) : null;
  return (
    <span className="hx-ban" style={{ opacity: name ? 1 : 0.45 }}>
      {name && (
        <motion.span key={name} {...pop} style={{ display: 'block', width: '100%', height: '100%' }}>
          {face && <img src={face} alt={name} draggable={false} />}
          <motion.i initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease: EASE, delay: 0.12 } }}>✕</motion.i>
        </motion.span>
      )}
    </span>
  );
}

type Tab = 'picks' | 'builds';

export default function ChampSelectView() {
  const patch = usePatch();
  const [cs, setCs] = useState<any>(null);
  const [build, setBuild] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('picks');
  const [suggestions, setSuggestions] = useState<Array<{
    name: string; winRate: number | null; pickRate: number | null; tier: number | null; reason: string;
    matchupWinRate?: number | null; vsRival?: string; goodInto?: string[]; badInto?: string[]; covers?: string[];
    myWinRate?: number | null; myGames?: number; aiRank?: number; aiReason?: string;
  }>>([]);
  const [aiInfo, setAiInfo] = useState<{ provider: string; model: string } | null>(null);
  // Auto-hover: el companion deja en hover el mejor pick y lo cambia cuando el draft
  // cambia (counter del rival, huecos de comp). Auto-lock: confirma cuando quedan
  // pocos segundos de TU turno. Se apagan en cuanto eliges a mano otro campeón.
  const [autoHover, setAutoHover] = useState<boolean>(() => { try { return localStorage.getItem('atak.cs.autohover') !== '0'; } catch { return true; } });
  const [autoLock, setAutoLock] = useState<boolean>(() => { try { return localStorage.getItem('atak.cs.autolock') === '1'; } catch { return false; } });
  const autoHoveredRef = useRef<string>('');
  const manualRef = useRef(false);
  const lastAutoAtRef = useRef(0);
  const lockedRef = useRef(false);
  useEffect(() => { try { localStorage.setItem('atak.cs.autohover', autoHover ? '1' : '0'); } catch { /* */ } if (autoHover) manualRef.current = false; }, [autoHover]);
  useEffect(() => { try { localStorage.setItem('atak.cs.autolock', autoLock ? '1' : '0'); } catch { /* */ } }, [autoLock]);
  const [suggLoading, setSuggLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [rivalOverride, setRivalOverride] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const offs = [
      window.atak.onChampSelect(setCs),
      window.atak.onChampionBuild(setBuild),
      window.atak.onChampionBuildLoading((p: any) => setBuild({ loading: true, ...p })),
      window.atak.onChampionBuildError((p: any) => setBuild({ error: p?.error || 'Error al cargar la build' })),
      window.atak.onChampSelectEnded(() => {
        setCs(null); setBuild(null); setSuggestions([]); setRivalOverride(''); setFeedback(null); setAiInfo(null);
        autoHoveredRef.current = ''; manualRef.current = false; lockedRef.current = false;
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

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

  // ── Fase / timer ──────────────────────────────────────────────────────────
  const phase: string = cs?.phase || '';
  const idx = phaseIndex(phase, cs?.actionType || '');
  const [chapter, setChapter] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const lastIdx = useRef(-1);
  useEffect(() => {
    if (idx < 0 || idx === lastIdx.current) return;
    lastIdx.current = idx;
    setChapter(PHASE_TITLES[idx] || null);
    if (idx === 3) setFlash((n) => n + 1);
    const t = setTimeout(() => setChapter(null), 1400);
    return () => clearTimeout(t);
  }, [idx]);

  const timerSecs = Number(cs?.timerSecs ?? 0);
  const timerMaxRef = useRef<{ phase: string; max: number }>({ phase: '', max: 1 });
  if (timerMaxRef.current.phase !== phase) timerMaxRef.current = { phase, max: Math.max(1, timerSecs) };
  else if (timerSecs > timerMaxRef.current.max) timerMaxRef.current.max = timerSecs;
  const timerPct = Math.min(100, Math.round((timerSecs / Math.max(1, timerMaxRef.current.max)) * 100));

  // ── Build (OP.GG) ─────────────────────────────────────────────────────────
  const runes = build?.runes;
  const items = build?.items;
  const mu = build?.matchup as
    | null
    | { rival: string; play: number; winRate: number | null; runesPlay: number; runesWinRate: number | null; tip: string; playStyle: string; source: 'matchup' | 'general'; spells: { ids: number[]; names: string[] } | null };
  const tips = asArray(build?.tips).map(asText).filter(Boolean);
  const skill = build?.skillOrder ?? build?.skill_order;
  const skillSeq: string[] = Array.isArray(skill) ? skill.map(asText).filter(Boolean) : [];
  const skillPrio = skillSeq.length >= 3 ? skillSeq.slice(0, 3).map((s) => s.toUpperCase()).join(' → ') : '';
  const counters = build?.counters;
  const strong = asArray(counters?.strongAgainst ?? counters?.strong);
  const weak = asArray(counters?.weakAgainst ?? counters?.weak);
  const pctOf = (v: any): number | null => (v != null ? Number(String(v).replace('%', '')) : null);
  const wrNum = pctOf(build?.winrate ?? build?.winRate ?? build?.wr);
  const pickNum = pctOf(build?.pickRate);
  const banNum = pctOf(build?.banRate);

  const name: string = asText(build?.name) || '';
  const tags: string[] = Array.isArray(build?.tags) ? build.tags : [];
  const nameKey = patch?.keyByName[norm(name)] ?? 0;
  const splash = name ? champSplashUrl(patch, name) : null;
  const metaKey = build?.loading ? 'loading' : build?.error ? 'error' : name ? `build:${name}` : 'empty';

  const team: any[] = Array.isArray(cs?.team) ? cs.team : [];
  const enemy: any[] = Array.isArray(cs?.enemy) ? cs.enemy : [];
  const allyBans: any[] = asArray(cs?.bans?.ally);
  const enemyBans: any[] = asArray(cs?.bans?.enemy);
  const allySlots = [...team]; while (allySlots.length < 5) allySlots.push({ championId: 0, championName: '', position: '', tags: [] });
  const enemySlots = [...enemy]; while (enemySlots.length < 5) enemySlots.push({ championId: 0, championName: '', position: '', tags: [] });
  const comp = useMemo(() => analyzeComp(team), [team]);

  const bgSplash = useMemo(() => {
    if (splash) return splash;
    const all = [...team, ...enemy].filter((p: any) => p?.championName);
    const last = all[all.length - 1];
    return last ? champSplashUrl(patch, last.championName) : null;
  }, [splash, team, enemy, patch]);

  // ── Rival de línea ────────────────────────────────────────────────────────
  const myPos = String(cs?.localPlayerPosition || '');
  const autoRival = useMemo(() => {
    if (!myPos) return '';
    const hit = enemy.find((p: any) => p.championName && String(p.position || '').toUpperCase() === myPos.toUpperCase());
    return hit?.championName || '';
  }, [enemy, myPos]);
  const rival = rivalOverride || autoRival;

  const draftKey = useMemo(() => {
    const picks = [...team, ...enemy].map((p) => p.championName || p.championId || '').join(',');
    const bans = [...allyBans, ...enemyBans].map(asText).join(',');
    return `${myPos}|${rival}|${picks}|${bans}|${comp.missing.join(',')}`;
  }, [team, enemy, allyBans, enemyBans, myPos, rival, comp.missing]);

  // Sugerencias siempre durante el draft, con debounce (el LCU emite por tick).
  useEffect(() => {
    if (!cs) return;
    let cancelled = false;
    const bannedNames = [...allyBans, ...enemyBans].map(asText).filter(Boolean);
    const pickedNames = [...team, ...enemy].map((p) => p.championName).filter(Boolean);
    const enemyNames = enemy.map((p: any) => p.championName).filter(Boolean);
    setSuggLoading(true);
    const base = { position: myPos || 'MIDDLE', missingRoles: comp.missing, bannedNames, pickedNames, enemyNames, rivalName: rival, limit: 6 };
    const t = setTimeout(async () => {
      try {
        const fast = await window.atak.opggPickSuggestions({ ...base, deep: false });
        if (!cancelled && Array.isArray(fast) && fast.length) { setSuggestions(fast); setSuggLoading(false); setRefining(true); }
      } catch { /* lo intenta el pase profundo */ }
      let deepList: any[] = [];
      try {
        const deep = await window.atak.opggPickSuggestions({ ...base, deep: true });
        if (!cancelled && Array.isArray(deep) && deep.length) { deepList = deep; setSuggestions(deep); }
      } catch { /* conserva las rápidas */ }
      finally { if (!cancelled) { setSuggLoading(false); setRefining(false); } }
      // Tercer pase: la IA (si hay Claude u Ollama local) reordena los mejores y explica.
      if (cancelled || deepList.length < 2) return;
      try {
        const ai = await window.atak.pickAiRerank({
          position: myPos || 'MIDDLE', missing: comp.missing, rival: rival || undefined,
          allies: team.filter((p: any) => p.championName && !p.isLocal).map((p: any) => p.championName),
          enemies: enemyNames,
          candidates: deepList.map((s: any) => ({ name: s.name, winRate: s.winRate, tier: s.tier, matchupWinRate: s.matchupWinRate ?? null, goodInto: s.goodInto || [], badInto: s.badInto || [], covers: s.covers || [], myWinRate: s.myWinRate ?? null, myGames: s.myGames || 0 })),
        });
        if (cancelled || !ai?.order?.length) return;
        const rank = new Map(ai.order.map((o, i) => [o.name, { i: i + 1, why: o.why }]));
        const merged = deepList.map((s: any) => ({ ...s, aiRank: rank.get(s.name)?.i, aiReason: rank.get(s.name)?.why }))
          .sort((a: any, b: any) => (a.aiRank ?? 99) - (b.aiRank ?? 99) || b.score - a.score);
        setSuggestions(merged); setAiInfo({ provider: ai.provider, model: ai.model });
      } catch { /* sin IA: orden estadístico */ }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const myPick = useMemo(() => team.find((p: any) => p.isLocal) || null, [team]);
  const myChampName = asText(myPick?.championName);
  const previewing = Boolean(build?.preview) && Boolean(name) && name.toLowerCase() !== myChampName.toLowerCase();

  const showBuildFor = useCallback((championName: string) => {
    if (championName) void window.atak.championPreview(championName, myPos || 'MIDDLE', rival);
  }, [myPos, rival]);
  const pickSuggestion = useCallback((championName: string) => {
    // Clic del usuario: a partir de aquí el auto-hover no le pisa la elección.
    manualRef.current = true; autoHoveredRef.current = '';
    showBuildFor(championName);
    void runAction('hover', () => window.atak.champSelectHover(championName), `${championName} en hover`);
  }, [showBuildFor, runAction]);

  // ── Auto-hover / auto-lock ────────────────────────────────────────────────
  const myPickState = (cs?.myPick || null) as null | { pending: boolean; inProgress: boolean; locked: boolean };
  const top = suggestions[0]?.name || '';
  useEffect(() => {
    if (!cs || !autoHover || !top || !myPickState?.pending || myPickState.locked) return;
    if (phase === 'FINALIZATION') return;
    // Si el jugador puso otro campeón a mano, se respeta hasta que reactive el auto.
    if (myChampName && autoHoveredRef.current && myChampName.toLowerCase() !== autoHoveredRef.current.toLowerCase()) manualRef.current = true;
    if (manualRef.current) return;
    if (myChampName.toLowerCase() === top.toLowerCase()) return;
    if (Date.now() - lastAutoAtRef.current < 1500) return;
    lastAutoAtRef.current = Date.now();
    void (async () => {
      const r = await window.atak.champSelectHover(top).catch(() => ({ ok: false }));
      if (r.ok) { autoHoveredRef.current = top; showBuildFor(top); setFeedback({ ok: true, msg: `Auto: ${top} en hover` }); }
    })();
  }, [cs, autoHover, top, myChampName, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cs || !autoLock || !top || !myPickState?.inProgress || myPickState.locked || lockedRef.current) return;
    if (manualRef.current || !myChampName || myChampName.toLowerCase() !== top.toLowerCase()) return;
    if (timerSecs > 4 || timerSecs <= 0) return;
    lockedRef.current = true;
    void runAction('lock', () => window.atak.champSelectLock(top), `Auto: ${top} confirmado`);
  }, [cs, autoLock, top, myChampName, timerSecs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!myChampName || !rival) return;
    void window.atak.championPreview(myChampName, myPos || 'MIDDLE', rival);
  }, [myChampName, rival, myPos]);

  // Con campeón propio, la pestaña BUILDS es la útil; sin campeón, las sugerencias.
  useEffect(() => { if (name && !build?.preview) setTab('builds'); }, [name, build?.preview]);

  const bounceItems: BounceCardItem[] = useMemo(() => suggestions.map((s) => {
    const sub = s.matchupWinRate != null ? `${s.matchupWinRate}% vs ${s.vsRival}` : s.winRate != null ? `T${s.tier ?? '?'} · ${s.winRate}%` : (s.reason || '');
    return {
      key: s.name,
      image: champLoadingUrl(patch, s.name) || champSplashUrl(patch, s.name),
      label: s.name,
      sublabel: sub,
      title: `${s.name} — hover en el cliente + runas del matchup${s.reason ? `\n${s.reason}` : ''}`,
      selected: name.toLowerCase() === s.name.toLowerCase(),
      onClick: () => pickSuggestion(s.name),
    };
  }), [suggestions, patch, name, pickSuggestion]);

  const runeIds: number[] = Array.isArray(runes?.rune_ids) ? runes.rune_ids.map(asRuneId) : [
    asRuneId(runes?.keystone), ...asArray(runes?.primary).map(asRuneId), ...asArray(runes?.secondary).map(asRuneId), ...asArray(runes?.shards).map(asRuneId),
  ].filter(Boolean);
  const starterIds = asArray(items?.starter).map(asItemId).filter(Boolean);
  const coreIds = asArray(items?.core).map(asItemId).filter(Boolean);
  const bootsIds = asArray(items?.boots).map(asItemId).filter(Boolean);
  const spellIds: number[] = Array.isArray(mu?.spells?.ids) && mu!.spells!.ids.length ? mu!.spells!.ids : (Array.isArray(build?.spells) ? build.spells : []);
  const fullBuilds: any[] = Array.isArray(build?.fullBuilds) ? build.fullBuilds : [];
  const itemOptions = build?.itemOptions ?? null;

  // Petición para ATAK Coach: tu campeón (o la vista previa) + el draft real.
  const aiRequest: DraftAiRequest | null = useMemo(() => {
    if (!name) return null;
    const side = (p: any) => ({ championName: String(p.championName || ''), championId: Number(p.championId) || 0, position: String(p.position || ''), tags: Array.isArray(p.tags) ? p.tags : [] });
    return {
      me: { championName: name, championId: nameKey, position: myPos, tags },
      position: myPos || 'MIDDLE',
      allies: team.filter((p: any) => p.championName && !p.isLocal).map(side),
      enemies: enemy.filter((p: any) => p.championName).map(side),
      rival: rival || undefined,
    };
  }, [name, nameKey, myPos, tags, team, enemy, rival]);

  const Counter = ({ c, bad }: { c: any; bad?: boolean }) => (
    <div className="no-drag" onClick={() => openChampionPage(champSlug(patch, asText(c)))} title={`${asText(c)} — ver en ATAK.GG`} style={{ textAlign: 'center', cursor: 'pointer' }}>
      <HxHex src={champFaceUrl(patch, asText(c), Number(c?.id) || 0)} size={38} tone={bad ? 'crimson' : undefined} />
      {typeof c?.winRate === 'number' && (
        <div className="hx-mono" style={{ fontSize: 12, fontWeight: 700, color: bad ? 'var(--hx-neg)' : 'var(--hx-green)', marginTop: 3 }}>{c.winRate}%</div>
      )}
    </div>
  );

  return (
    <div className="hx hx-stage" style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'inset 0 0 0 1px var(--hx-line)' }}>
      {/* Fondo: splash con Ken Burns + crossfade */}
      <AnimatePresence>
        {bgSplash && (
          <motion.div key={bgSplash} {...xfade} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <motion.img src={bgSplash} alt="" initial={{ scale: 1.14 }} animate={{ scale: 1.06 }} transition={{ duration: 14, ease: 'linear' }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', opacity: name ? 0.5 : 0.34, filter: 'saturate(0.95) brightness(0.7)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(10,10,12,.7) 0%,rgba(10,10,12,.35) 30%,rgba(10,10,12,.25) 50%,rgba(10,10,12,.35) 70%,rgba(10,10,12,.7) 100%), linear-gradient(180deg,rgba(10,10,12,.2) 0%,rgba(10,10,12,.65) 65%,#0a0a0c 100%)' }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="hx-vignette" />

      {/* Rótulo de capítulo + flash de cierre */}
      <AnimatePresence>
        {chapter && (
          <motion.div key={chapter} {...title} className="hx-chrome cs-chapter">
            {chapter}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flash > 0 && (
          <motion.div key={flash} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0], transition: { duration: 0.9, ease: 'easeOut', times: [0, 0.2, 1] } }} exit={{ opacity: 0 }}
            onAnimationComplete={() => setFlash(0)} style={{ position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none', background: 'var(--hx-crimson)' }} />
        )}
      </AnimatePresence>

      {/* ── Barra superior (arrastrable) ── */}
      <motion.header className="hx-topbar cs-sweep" variants={rise} initial="hidden" animate="show" style={{ position: 'relative', zIndex: 5 }}>
        <span className="hx-wordmark">ATAK<em>.GG</em></span>
        <HxTabs<Tab> className="no-drag" value={tab} onChange={setTab} options={[{ id: 'picks', label: 'Sugerencias de pick' }, { id: 'builds', label: 'Builds' }]} />
        <span className="hx-muted" style={{ fontSize: 13 }}>
          {cs ? (timerSecs > 0 ? `${timerSecs} segundos restantes…` : 'esperando al cliente…') : 'sin champ select'}
        </span>
        <span style={{ flex: 1 }} />
        {myPos && <span className="hx-pill">{posEs(myPos)}</span>}
        <button type="button" className="hx-icon-btn close" onClick={() => window.atak.win('close')} aria-label="Cerrar">
          <svg width="11" height="11" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.3" /></svg>
        </button>
      </motion.header>

      {/* ── Fases + bans + timer ── */}
      <motion.div variants={rise} initial="hidden" animate="show" style={{ position: 'relative', zIndex: 4, display: 'grid', gridTemplateColumns: '300px 1fr 300px', alignItems: 'center', gap: 12, padding: '8px 12px 0' }}>
        <div style={{ display: 'flex', gap: 4 }}>{padTo5(allyBans).map((b, i) => <BanSquare key={i} patch={patch} ban={b} />)}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          {PHASES.map((label, i) => (
            <span key={label} style={{ display: 'contents' }}>
              <span className={`cs-phase${i === idx ? ' on' : i < idx ? ' done' : ''}`}>
                {label}
                {i === idx && <motion.span layoutId="cs-phase-underline" transition={{ duration: 0.3, ease: EASE }} className="cs-phase-line" />}
              </span>
              {i < PHASES.length - 1 && <span className="cs-phase-gap" />}
            </span>
          ))}
          <span style={{ width: 1, height: 22, background: 'var(--hx-line)', margin: '0 6px' }} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span className={'cs-timer' + (cs && timerSecs > 0 && timerSecs <= 10 ? ' cs-timer-urgent' : '')}>
              {cs ? (timerSecs <= 10 ? <Blip value={fmtClock(timerSecs)} /> : fmtClock(timerSecs)) : '—'}
            </span>
            <span className="cs-timer-rail">
              <span className="cs-timer-fill" style={{ display: 'block', width: `${timerPct}%` }} />
            </span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>{padTo5(enemyBans).map((b, i) => <BanSquare key={i} patch={patch} ban={b} />)}</div>
      </motion.div>

      {/* ── Cuerpo 3 columnas ── */}
      <motion.main variants={staggerParent(0.04, 0.04)} initial="hidden" animate="show" style={{ position: 'relative', zIndex: 3, flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '300px 1fr 300px', gap: 12, padding: 12 }}>
        {/* ALIADOS */}
        <motion.aside variants={slideCol(-32)} style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, overflow: 'hidden' }}>
          <div className="cs-side">
            <i />
            <span className="hx-label blue">Tu equipo</span>
          </div>
          {allySlots.slice(0, 5).map((p, i) => <PlayerSlot key={p.cellId ?? `empty-${i}`} p={p} patch={patch} side="left" />)}
          <HxPanel style={{ marginTop: 'auto' }} inner={{ padding: '8px 10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span className="hx-label" style={{ marginRight: 4 }}>Comp</span>
              {COMP_META.map((m) => {
                const n = comp.counts[m.key];
                const miss = m.need > 0 && n < m.need;
                return <span key={m.key} className={`hx-pill${n >= Math.max(1, m.need) ? ' ok' : ''}${miss ? ' miss' : ''}`}>{m.icon}<span>{m.label}</span><Blip className="n" value={n} /></span>;
              })}
            </div>
            {comp.missing.length > 0 && <div style={{ marginTop: 5, fontSize: 12, color: 'var(--hx-neg)' }}>Falta: <b>{comp.missing.join(' · ')}</b></div>}
          </HxPanel>
        </motion.aside>

        {/* CENTRO */}
        <motion.section variants={centerCol} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, minWidth: 0 }}>
          {/* Hero: campeón 3D + nombre + stats + acciones */}
          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 16, alignItems: 'stretch', flex: 'none' }}>
            <div className="hx-champ" style={{ height: 250 }}>
              <div className="hx-champ-in">
                <AnimatePresence initial={false}>
                  {name && nameKey ? (
                    <motion.div key={name} {...xfade} style={{ position: 'absolute', inset: 0 }}>
                      <ChampionDance patch={patch} championName={name} championId={nameKey} height="100%" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, background: 'transparent', height: '100%' }} />
                    </motion.div>
                  ) : (
                    <motion.div key="empty" {...xfade} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                      <HxHex size={84} tone="dim" letter="?" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <span className="glow" />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, minWidth: 0 }}>
              <div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={name || 'none'} {...title} className="hx-chrome cs-hero-title" style={{ fontSize: name ? 60 : 44 }}>
                    {name || 'Elige campeón'}
                  </motion.div>
                </AnimatePresence>
                <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {myPos && <span className="hx-label" style={{ color: 'var(--hx-ink)' }}>{posEs(myPos)}{tags[0] ? ` · ${tagEs(tags[0])}` : ''}</span>}
                  {build?.source === 'opgg' && <span className="hx-label">Meta OP.GG</span>}
                  {patch?.version && <span className="hx-label">Parche {String(patch.version).split('.').slice(0, 2).join('.')}</span>}
                  {previewing && <span className="hx-pill">Vista previa</span>}
                </div>
              </div>
              {(wrNum != null || pickNum != null || banNum != null) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 460 }}>
                  {[{ k: 'Win rate', v: wrNum, c: 'var(--hx-green)' }, { k: 'Pick rate', v: pickNum, c: 'var(--hx-blue)' }, { k: 'Ban rate', v: banNum, c: 'var(--hx-crimson)' }].map((s, i) => (
                    <span key={`${name}-${s.k}`} style={{ display: 'contents' }}>
                      <HxBar label={s.k} value={s.v != null ? `${s.v}%` : '—'} pct={Number.isFinite(s.v as number) ? (s.v as number) : 0} color={s.c} delay={i * 0.05} />
                    </span>
                  ))}
                </div>
              )}
              {name && (
                <div className="no-drag" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="hx-btn primary" disabled={busy === 'lock'} onClick={() => runAction('lock', () => window.atak.champSelectLock(name), `${name} bloqueado`)}>
                    {busy === 'lock' ? 'Bloqueando…' : `Bloquear ${name}`}
                  </button>
                  <button type="button" className="hx-btn" disabled={busy === 'runes' || !build?.runePage} title={build?.runePage ? 'Crea la página en tu cliente y la deja activa' : 'Sin página de runas disponible'}
                    onClick={() => runAction('runes', () => window.atak.applyRunes(build.runePage), `Runas de ${name} puestas en el cliente`)}>
                    {busy === 'runes' ? 'Aplicando…' : 'Poner runas'}
                  </button>
                  {previewing && (
                    <button type="button" className="hx-btn ghost" onClick={() => showBuildFor(myChampName)} title={`Volver a la build de ${myChampName}`}>Volver a {myChampName}</button>
                  )}
                  <AnimatePresence>
                    {feedback && (
                      <motion.span key="fb" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', color: feedback.ok ? 'var(--hx-green)' : 'var(--hx-neg)' }}>
                        {feedback.msg}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Contenido de la pestaña */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: 2 }}>
            <AnimatePresence mode="wait" initial={false}>
              {tab === 'picks' ? (
                <motion.div key="picks" {...swap} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <HxPanel corners className="no-drag">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span className="hx-label head">
                        Sugerencias de pick{myPos ? ` · ${posEs(myPos)}` : ''}
                        <span className="hx-faint" style={{ marginLeft: 8, fontWeight: 500 }}>{rival ? `· vs ${rival} · clic = hover + runas` : '· clic = hover + runas'}</span>
                        {refining && <span className="hx-faint" style={{ marginLeft: 8, fontWeight: 500 }}>· afinando con el matchup…</span>}
                      </span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button type="button" className={`hx-pill${autoHover ? ' ok' : ''}`} onClick={() => setAutoHover((v) => !v)} title="Deja en hover el mejor pick y lo cambia con el draft. Si eliges otro a mano, se detiene.">Auto-hover {autoHover ? 'ON' : 'OFF'}</button>
                        <button type="button" className={`hx-pill${autoLock ? ' ok' : ''}`} onClick={() => setAutoLock((v) => !v)} title="Confirma el pick cuando quedan 4 s de tu turno (solo si sigue en hover el recomendado).">Auto-lock {autoLock ? 'ON' : 'OFF'}</button>
                        {aiInfo && <span className="hx-pill" title={`${aiInfo.provider} · ${aiInfo.model}`}>IA</span>}
                      </span>
                      {comp.missing.length > 0 && <span style={{ fontSize: 12, color: 'var(--hx-neg)', fontWeight: 700 }}>Falta: {comp.missing.join(' · ')}</span>}
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      {suggLoading && !bounceItems.length ? (
                        <motion.div key="loading" {...xfade} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 16 }}>
                          <span className="dot" /><span className="hx-label">Analizando meta…</span>
                        </motion.div>
                      ) : bounceItems.length > 0 ? (
                        <motion.div key="list" {...xfade}>
                          <BounceCards items={bounceItems} cardWidth={90} cardHeight={126} rotations={[0]} lifts={[0]} animationDelay={0.05} animationStagger={0.04} />
                          <div className="hx-muted" style={{ marginTop: 8, fontSize: 12.5, textAlign: 'center' }}>{suggestions[0]?.aiReason ? `${suggestions[0].name}: ${suggestions[0].aiReason}` : (suggestions[0]?.reason || 'Meta OP.GG · se actualiza en cada pick/ban')}</div>
                        </motion.div>
                      ) : (
                        <motion.div key="empty" {...xfade} className="hx-label" style={{ textAlign: 'center', color: 'var(--hx-faint)', padding: 8 }}>Sin sugerencias (bans/picks o OP.GG offline)</motion.div>
                      )}
                    </AnimatePresence>
                  </HxPanel>
                  {(strong.length > 0 || weak.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <HxPanel><div className="hx-label ok" style={{ marginBottom: 8 }}>Favorable</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{strong.slice(0, 6).map((c, i) => <Counter key={i} c={c} />)}{!strong.length && <span className="hx-faint">—</span>}</div></HxPanel>
                      <HxPanel><div className="hx-label red" style={{ marginBottom: 8 }}>Débil contra</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{weak.slice(0, 6).map((c, i) => <Counter key={i} c={c} bad />)}</div></HxPanel>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key={`builds:${metaKey}`} {...swap} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {build?.loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 16 }}><span className="dot" /><span className="hx-label">Cargando meta OP.GG…</span></div>}
                  {build?.error && <HxPanel tone="crimson"><span style={{ color: 'var(--hx-neg)', fontSize: 13 }}>{String(build.error)}</span></HxPanel>}
                  {!build && !name && <div className="hx-label" style={{ textAlign: 'center', color: 'var(--hx-faint)', padding: 16 }}>Elige un campeón para ver runas y build · las sugerencias están en la otra pestaña</div>}
                  {name && <DraftAiPanel patch={patch} request={aiRequest} onRunesApplied={(r) => setFeedback({ ok: r.ok, msg: r.ok ? 'Runas IA puestas en el cliente' : r.error || 'El cliente rechazó la página' })} />}
                  {runes && (
                    <HxPanel corners>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                        <span className="hx-label head">{mu?.source === 'matchup' ? `Runas vs ${String(mu.rival)}` : 'Runas'} <span className="hx-faint" style={{ fontFamily: 'var(--hx-data)', fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· estadística OP.GG</span></span>
                        {mu && <span className="hx-muted" style={{ fontSize: 12 }}>{mu.source === 'matchup' ? `${mu.runesPlay} partidas del duelo${mu.runesWinRate != null ? ` · ${mu.runesWinRate}% WR` : ''}` : `sin muestra vs ${mu.rival} · meta de línea`}</span>}
                      </div>
                      <HxRuneTree patch={patch} primaryPathId={Number(runes.primaryPathId) || 0} secondaryPathId={Number(runes.secondaryPathId) || 0} selected={runeIds.slice(0, 6)} shards={runeIds.slice(6, 9)} />
                      {mu?.tip && <div className="cs-note hot" style={{ marginTop: 10 }}><b>VS {String(mu.rival).toUpperCase()} (EN)</b>{mu.tip}</div>}
                    </HxPanel>
                  )}
                  {(skillSeq.length > 0 || skillPrio) && (
                    <HxPanel corners>
                      <div className="hx-label head" style={{ marginBottom: 10 }}>Orden de skills{skillPrio ? ` · ${skillPrio}` : ''}</div>
                      {skillSeq.length > 3 ? <HxSkillGrid sequence={skillSeq} /> : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {skillSeq.map((k, i) => <span key={i} style={{ display: 'contents' }}><span className="hx-pill">{k.toUpperCase()}</span>{i < skillSeq.length - 1 && <HxArrow />}</span>)}
                        </div>
                      )}
                    </HxPanel>
                  )}
                  {fullBuilds.length > 0 && (
                    <HxPanel corners>
                      <div className="hx-label head" style={{ marginBottom: 10 }}>Build completa · cambia de variante o de pieza</div>
                      <HxFullBuild patch={patch} builds={fullBuilds} options={itemOptions} size={34} />
                    </HxPanel>
                  )}
                  {tips.length > 0 && (
                    <HxPanel><div className="hx-label head" style={{ marginBottom: 8 }}>Consejos ATAK</div><div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{tips.map((t, i) => <div key={i} className={`cs-note${i === 0 ? ' hot' : ''}`}>{t}</div>)}</div></HxPanel>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="hx-faint" style={{ flex: 'none', textAlign: 'center', fontSize: 11.5, letterSpacing: '0.06em' }}>
            {[mu?.play ? `${mu.play} partidas del duelo` : null, build?.source === 'opgg' ? 'OP.GG' : null, patch?.version ? `Parche ${String(patch.version).split('.').slice(0, 2).join('.')}` : null].filter(Boolean).join(' · ') || 'ATAK.GG'}
          </div>
        </motion.section>

        {/* ENEMIGOS + hechizos + items */}
        <motion.aside variants={slideCol(32)} style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, overflow: 'hidden' }}>
          <div className="cs-side right">
            <span className="hx-label red">Enemigo</span>
            <i />
          </div>
          {enemySlots.slice(0, 5).map((p, i) => (
            <PlayerSlot key={p.cellId ?? `empty-${i}`} p={p} patch={patch} side="right"
              rival={Boolean(p.championName) && p.championName === rival}
              onClick={p.championName ? () => setRivalOverride(rivalOverride === p.championName ? '' : p.championName) : undefined} />
          ))}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={metaKey} {...swap} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {spellIds.length > 0 && (
                  <HxPanel inner={{ padding: '10px 12px' }}>
                    <div className="hx-label head" style={{ marginBottom: 6 }}>Hechizos</div>
                    <div style={{ display: 'flex', gap: 6 }}>{spellIds.map((id, i) => { const u = spellIconUrl(patch, id); return <span key={i} className="hx-item" style={{ width: 30, height: 30 }}>{u && <img src={u} alt="" />}</span>; })}</div>
                  </HxPanel>
                )}
                {(starterIds.length > 0 || coreIds.length > 0 || fullBuilds.length > 0) && (
                  <HxPanel inner={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="hx-label head">Items</div>
                    <HxItemStage patch={patch} label="Inicio" ids={starterIds} size={26} />
                    {fullBuilds.length > 0 ? (
                      <div>
                        <div className="hx-label" style={{ marginBottom: 5 }}>Build completa</div>
                        <HxFullBuild patch={patch} builds={fullBuilds} size={26} compact />
                      </div>
                    ) : (
                      <>
                        <HxItemStage patch={patch} label="Orden de build" ids={coreIds} size={30} arrows core />
                        <HxItemStage patch={patch} label="Botas" ids={bootsIds} size={28} />
                      </>
                    )}
                  </HxPanel>
                )}
                {!name && !build?.loading && (
                  <div className="hx-label" style={{ textAlign: 'right', color: 'var(--hx-faint)', marginTop: 4 }}>{rival ? `Rival: ${rival}` : 'Clic en un enemigo = tu rival'}</div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap', flex: 'none' }}>
            {enemy.filter((p) => p.championId).map((p, i) => (
              <motion.span key={`${p.cellId ?? i}:${p.championId}`} {...pop} style={{ display: 'inline-flex' }}><ChampIcon patch={patch} name={p.championName} size={24} enemy /></motion.span>
            ))}
          </div>
        </motion.aside>
      </motion.main>
    </div>
  );
}
