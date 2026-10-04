// src/views/PlayersView.tsx — F8: roster 5v5 con kit Arena (cliente de League).
// Columnas de slots trapezoidales (azul | rojo) + sidebar central con el build
// OP.GG del jugador seleccionado (árbol de runas, skills, items por etapa) y su
// perfil (rango, WR, stats en el campeón, últimas partidas). Mismo wiring de
// datos que antes: `opggRoster` + tick `live`; el build de un jugador que no es
// el local se pide con `opggBuild` (caché por campeón+posición).
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Blip, EASE, fade, rise, staggerParent, swap } from '../motion';
import {
  HxBar,
  HxHex,
  HxItem,
  HxItemStage,
  HxPanel,
  HxRing,
  HxRuneTree,
  HxSkillGrid,
  HxSlot,
  HxSlotMini,
  HxTabs,
  champFaceUrl,
  HxFullBuild,
  type HxFullBuildData,
  type HxItemOptions,
} from './hextech';
import './players.css';
import { RankBadge, fmtClock, openProfile, posEs, useLive, usePatch, type PatchInfo } from './shared';

interface RecentMatch {
  id: string;
  createdAt: string;
  gameType: string;
  gameLength: number;
  championId: number;
  championName: string;
  items: number[];
  kills: number;
  deaths: number;
  assists: number;
  result: string;
  win: boolean | null;
}

interface DayForm {
  wins: number;
  losses: number;
  games: number;
  winRate: number | null;
}

interface PlayerRow {
  riotId: string;
  name: string;
  championName: string;
  team: 'ORDER' | 'CHAOS';
  isMe: boolean;
  position: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  items: number[];
  spell1: number | string;
  spell2: number | string;
  keystoneId: number;
  primaryRuneTree: number;
  secondaryRuneTree: number;
  opgg?: {
    rank: {
      tier: string | null;
      division: number | string | null;
      lp: number | null;
      wins: number;
      losses: number;
      tier_image_url?: string | null;
    } | null;
    seasonWinRate: number | null;
    seasonPlay: number;
    tags: string[];
    champStat: {
      play: number;
      win: number;
      win_rate: number;
      avg_kills: number;
      avg_deaths: number;
      avg_assists: number;
      kda: number | string;
    } | null;
    recentMatches?: RecentMatch[];
    today?: DayForm | null;
    error?: string;
  };
}

/** Build OP.GG (electron/services/opgg.ts OPGGBuild; win/pick/ban en fracción 0–1). */
interface Build {
  rune_ids: number[];
  primary_rune_names: string[];
  secondary_rune_names: string[];
  primary_path_id?: number;
  secondary_path_id?: number;
  core_item_ids: number[];
  boots_id: number;
  starter_ids: number[];
  skill_order: string[];
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate?: number | null;
  tier: number | null;
  full_builds?: HxFullBuildData[];
  item_options?: HxItemOptions | null;
}

interface RosterPayload {
  ok: boolean;
  region?: string;
  gameTime?: number;
  meChampion?: string | null;
  mePosition?: string | null;
  players: PlayerRow[];
  build: Build | null;
}

const QUEUE_SHORT: Record<string, string> = {
  SOLORANKED: 'Solo', FLEXRANKED: 'Flex', NORMAL: 'Normal', ARAM: 'ARAM', URF: 'URF', CHERRY: 'Arena',
};

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');

// ── Movimiento (constantes de módulo: estables entre renders, así el tick de
// `live` y las recargas de datos nunca re-disparan una entrada) ───────────────
/** Cuerpo: columna azul, sidebar, columna roja; 40ms entre cada uno. */
const BODY = staggerParent(0.04, 0.08);
/** Lista de slots de un equipo: entra cuando llega el roster. */
const ROWS = staggerParent(0.04, 0);
/** Contenido del sidebar: `swap` + reparto de secciones. */
const SIDE: Variants = {
  hidden: swap.initial,
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE, staggerChildren: 0.03, delayChildren: 0.05 } },
  exit: swap.exit,
};
const HEAD_IN = { duration: 0.3, ease: EASE };
// Arena: K y A neutros, solo las muertes van en rojo; verde / rojo = sobre o bajo 50 %.
const KDA_COLORS = { k: 'var(--hx-ink)', d: 'var(--hx-neg)', a: 'var(--hx-ink)' };
const wrColor = (wr: number | null | undefined) => (wr != null && wr >= 50 ? 'var(--hx-green)' : 'var(--hx-neg)');

/** Cruza (fade + 4px) el contenido cuando cambia `id`. Con `appear` también entra al montar. */
function Crossfade({ id, children, style, appear }: { id: string; children: ReactNode; style?: CSSProperties; appear?: boolean }) {
  return (
    <AnimatePresence mode="wait" initial={Boolean(appear)}>
      <motion.span
        key={id}
        style={{ display: 'inline-block', ...style }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE, delay: appear ? 0.12 : 0 } }}
        exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

// ── Build: normalización + rama de runas por id (fallback si el payload viejo
// no trae primary/secondary_path_id) ─────────────────────────────────────────
const PATHS = [8000, 8100, 8200, 8300, 8400];
const pathOf = (runeId: number): number => {
  if (!runeId) return 0;
  if (runeId >= 9000 && runeId < 10000) return 8000; // runas menores de Precisión (9101, 9111…)
  const base = Math.floor(runeId / 100) * 100;
  return PATHS.includes(base) ? base : 0;
};

function normBuild(r: any): Build | null {
  if (!r || typeof r !== 'object') return null;
  const nums = (v: any): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []);
  const strs = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);
  const b: Build = {
    rune_ids: nums(r.rune_ids),
    primary_rune_names: strs(r.primary_rune_names),
    secondary_rune_names: strs(r.secondary_rune_names),
    primary_path_id: Number(r.primary_path_id) || 0,
    secondary_path_id: Number(r.secondary_path_id) || 0,
    core_item_ids: nums(r.core_item_ids),
    boots_id: Number(r.boots_id) || 0,
    starter_ids: nums(r.starter_ids),
    skill_order: strs(r.skill_order),
    win_rate: typeof r.win_rate === 'number' ? r.win_rate : null,
    pick_rate: typeof r.pick_rate === 'number' ? r.pick_rate : null,
    ban_rate: typeof r.ban_rate === 'number' ? r.ban_rate : null,
    tier: typeof r.tier === 'number' ? r.tier : null,
    full_builds: Array.isArray(r.full_builds) ? r.full_builds.filter((f: any) => Array.isArray(f?.ids) && f.ids.length) : [],
    item_options: r.item_options && typeof r.item_options === 'object' ? r.item_options : null,
  };
  return b.rune_ids.length || b.core_item_ids.length || b.skill_order.length ? b : null;
}

/** Caché de builds pedidos para jugadores que no son el local (campeón|posición). */
const buildCache = new Map<string, Promise<Build | null>>();

// ── Form (barras W/L de las últimas 10) ──────────────────────────────────────
function FormBars({ matches }: { matches: RecentMatch[] }) {
  const form = matches.slice(0, 10);
  if (!form.length) return <span className="hx-label" style={{ color: 'var(--hx-faint)' }}>Sin historial</span>;
  return (
    <span className="pv2-form" aria-label="Form últimas partidas">
      {form.map((m, i) => {
        const won = m.win === true;
        const lost = m.win === false;
        const h = won || lost ? 18 : 8;
        const color = won ? 'var(--hx-green)' : lost ? 'var(--hx-neg)' : 'rgb(255 255 255 / 0.18)';
        return (
          <motion.i
            key={m.id || i}
            title={`${m.championName} · ${m.result}`}
            style={{ height: h, background: color }}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.1 + i * 0.04 }}
          />
        );
      })}
    </span>
  );
}

// ── Slot de jugador ──────────────────────────────────────────────────────────
function PlayerSlot({
  p, liveP, patch, loading, side, selected, onSelect,
}: {
  p: PlayerRow;
  liveP: any;
  patch: PatchInfo | null;
  loading: boolean;
  side: 'left' | 'right';
  selected: boolean;
  onSelect: () => void;
}) {
  const k = liveP?.kills ?? p.kills;
  const d = liveP?.deaths ?? p.deaths;
  const a = liveP?.assists ?? p.assists;
  const cs = liveP?.creepScore ?? p.creepScore;
  const items: number[] = liveP?.items ?? p.items ?? [];
  const dead = Boolean(liveP?.isDead);
  const og = p.opgg;
  const spell1 = liveP?.spell1 ?? p.spell1;
  const spell2 = liveP?.spell2 ?? p.spell2;
  const enemy = side === 'right';
  const wr = og?.seasonWinRate ?? null;
  const today = og?.today;
  const stat = og?.champStat;

  return (
    <motion.div initial={false} animate={{ opacity: dead ? 0.5 : 1 }} transition={{ duration: 0.25, ease: EASE }}>
      <HxSlot
        side={side}
        local={p.isMe}
        enemy={enemy}
        onClick={onSelect}
        className={cx(selected && 'is-selected')}
        title={`${p.riotId} · ${p.championName}`}
      >
        <HxSlotMini patch={patch} spells={[spell1, spell2]} keystoneId={p.keystoneId} />

        <span className="pv2-face">
          <HxHex
            src={champFaceUrl(patch, p.championName)}
            size={54}
            tone={selected ? 'cyan' : undefined}
            letter={(p.championName || '?').charAt(0).toUpperCase()}
          />
          <span className="pv2-lvl hx-mono">{liveP?.level ?? p.level}</span>
        </span>

        <div className="pv2-id">
          {/* 1 · nombre + WR de hoy */}
          <div className="pv2-row">
            <span
              className="hx-slot-name pv2-name"
              onClick={(e) => { e.stopPropagation(); openProfile(p.riotId); }}
              title={`Ver perfil de ${p.riotId} en ATAK.GG`}
            >
              {p.name || p.riotId}
            </span>
            <span className="sp" />
            {today && today.games > 0 && today.winRate != null && (
              <span className="pv2-today hx-mono" style={{ color: wrColor(today.winRate) }}>
                {today.winRate}%<span className="hx-label">hoy {today.wins}W-{today.losses}L</span>
              </span>
            )}
          </div>

          {/* 2 · campeón · posición + chips OP.GG */}
          <div className="pv2-row pv2-sub">
            <span className="hx-slot-sub">{p.championName}{p.position ? ` · ${posEs(p.position)}` : ''}</span>
            {(p.isMe || !!og?.tags?.length) && (
              <span className="pv2-tags">
                {p.isMe && <span className="hx-pill you">Tú</span>}
                {(og?.tags || []).map((t) => (
                  <span key={t} className={cx('hx-pill', t === 'TILT?' || t === 'POCAS PARTIDAS' ? 'miss' : t === 'ON FIRE' || t === 'RACHA' ? 'ok' : 'gold')}>{t}</span>
                ))}
              </span>
            )}
          </div>

          {/* 3 · rango + barra de WR de temporada */}
          <div className="pv2-row">
            {/* Rango: entra con fade tras el slot y se cruza si cambia (… → rango) */}
            <Crossfade
              appear
              id={og?.rank?.tier ? `rank-${og.rank.tier}-${og.rank.division ?? ''}` : `txt-${og?.error || (loading ? 'loading' : 'unranked')}`}
              style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, flex: 'none' }}
            >
              {og?.rank?.tier ? (
                <RankBadge tier={og.rank.tier} division={og.rank.division} lp={og.rank.lp} size={24} emblemUrl={og.rank.tier_image_url} />
              ) : (
                <span className="hx-label" style={{ color: 'var(--hx-faint)' }}>{og?.error || (loading ? 'consultando…' : 'Unranked')}</span>
              )}
            </Crossfade>
            {wr != null ? (
              <div className="pv2-wr">
                <HxBar label={`WR · ${og?.seasonPlay ?? 0}G`} value={`${wr}%`} pct={wr} color={wrColor(wr)} height={4} delay={0.1} />
              </div>
            ) : <span className="sp" />}
          </div>

          {/* 4 · form (últimas 10) + stats en el campeón */}
          <div className="pv2-row">
            <FormBars matches={og?.recentMatches || []} />
            {stat && (
              <span className="hx-label pv2-champstat" title={`${stat.play} partidas con ${p.championName} · KDA ${stat.kda}`}>
                <b style={{ color: wrColor(stat.win_rate) }}>{stat.win_rate}%</b>
                {` · ${stat.play}G · KDA ${stat.kda}`}
              </span>
            )}
          </div>
        </div>

        {/* KDA en vivo + CS + items */}
        <div className="pv2-live">
          <div className="pv2-kda hx-mono">
            {/* KDA en vivo: parpadeo corto solo cuando cambia el valor */}
            <Blip value={k ?? 0} style={{ color: KDA_COLORS.k }} />
            <span className="sep"> / </span>
            <Blip value={d ?? 0} style={{ color: KDA_COLORS.d }} />
            <span className="sep"> / </span>
            <Blip value={a ?? 0} style={{ color: KDA_COLORS.a }} />
          </div>
          <div className="pv2-cs">CS <b>{cs ?? 0}</b></div>
          <div className="pv2-items">
            {(items.length ? items : [0, 0, 0, 0, 0, 0]).slice(0, 6).map((id, i) => (
              <HxItem key={i} patch={patch} id={id} size={18} />
            ))}
          </div>
        </div>
      </HxSlot>
    </motion.div>
  );
}

/** Columna de equipo: cabecera + skeleton mientras carga → cruce a los slots,
 *  que entran escalonados la primera vez que llega el roster (keys estables). */
function TeamColumn({
  side, list, liveById, patch, loading, selectedId, onSelect,
}: {
  side: 'left' | 'right';
  list: PlayerRow[];
  liveById: Map<string, any>;
  patch: PatchInfo | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (riotId: string) => void;
}) {
  const blue = side === 'left';
  const wrs = list.map((p) => p.opgg?.seasonWinRate).filter((v): v is number => typeof v === 'number');
  const avgWr = wrs.length ? Math.round(wrs.reduce((s, v) => s + v, 0) / wrs.length) : null;
  return (
    <motion.div variants={rise} className="pv2-col">
      <div className={cx('pv2-colhead', side)}>
        <span className="dot" style={{ background: blue ? 'var(--hx-blue)' : 'var(--hx-crimson)' }} />
        <span className={cx('hx-chrome pv2-colhead-title', !blue && 'red')}>
          {blue ? 'LADO AZUL' : 'LADO ROJO'}
        </span>
        <span className="sp" />
        {avgWr != null && (
          <span className="hx-label">
            WR media <b className="hx-mono" style={{ color: wrColor(avgWr), fontSize: 14 }}>{avgWr}%</b>
          </span>
        )}
      </div>
      <AnimatePresence mode="wait">
        {list.length ? (
          <motion.div key="rows" variants={ROWS} initial="hidden" animate="show" className="pv2-rows">
            {list.map((p) => (
              <motion.div key={p.riotId + p.championName} variants={rise}>
                <PlayerSlot
                  p={p}
                  liveP={liveById.get(String(p.riotId).toLowerCase())}
                  patch={patch}
                  loading={loading}
                  side={side}
                  selected={selectedId === p.riotId}
                  onSelect={() => onSelect(p.riotId)}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : loading ? (
          <motion.div key="skel" className="pv2-rows" exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="pv2-skel" style={{ animationDelay: `${i * 80}ms` }}>
                <HxSlot side={side} enemy={!blue}>
                  <span className="hx-hex dim" style={{ width: 54, height: 54 }}><span className="hx-hex-in" /></span>
                  <div className="pv2-skel-lines" style={{ flex: 1 }}>
                    <span className="pv2-skel-line" style={{ width: '45%' }} />
                    <span className="pv2-skel-line" style={{ width: '30%' }} />
                    <span className="pv2-skel-line" style={{ width: '70%' }} />
                  </div>
                </HxSlot>
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <motion.div variants={fade}>
      <div className="pv2-sec-title">
        <span className="hx-label head">{title}</span>
        {right}
      </div>
      {children}
    </motion.div>
  );
}

const Stat = ({ v, k, color, small }: { v: ReactNode; k: string; color?: string; small?: boolean }) => (
  <div className="pv2-stat">
    <div className="v" style={{ color, fontSize: small ? 12 : undefined }}>{v}</div>
    <span className="hx-label">{k}</span>
  </div>
);

function BuildTab({ build, patch, owned, loading, champ, pos }: {
  build: Build | null; patch: PatchInfo | null; owned: number[]; loading: boolean; champ: string; pos: string;
}) {
  const state = build ? 'build' : loading ? 'loading' : 'empty';
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={state} variants={SIDE} initial="hidden" animate="show" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {build ? (
          <>
            <motion.div variants={fade}>
              <div className="pv2-sec-title">
                <span className="hx-label head">Meta · {champ || '—'} · {posEs(pos) || 'ALL'}</span>
                {build.tier != null && <span className="hx-pill">Tier {build.tier}</span>}
              </div>
              <div className="pv2-bars">
                <HxBar label="Win rate" value={build.win_rate != null ? `${(build.win_rate * 100).toFixed(1)}%` : '—'} pct={(build.win_rate ?? 0) * 100} color={wrColor((build.win_rate ?? 0) * 100)} delay={0.1} />
                <HxBar label="Pick rate" value={build.pick_rate != null ? `${(build.pick_rate * 100).toFixed(1)}%` : '—'} pct={Math.min(100, (build.pick_rate ?? 0) * 100 * 4)} color="var(--hx-blue)" delay={0.15} />
                <HxBar label="Ban rate" value={build.ban_rate != null ? `${(build.ban_rate * 100).toFixed(1)}%` : '—'} pct={Math.min(100, (build.ban_rate ?? 0) * 100 * 4)} color="var(--hx-crimson)" delay={0.2} />
              </div>
            </motion.div>

            {!!build.rune_ids.length && (
              <Section title="Runas">
                <HxRuneTree
                  patch={patch}
                  primaryPathId={build.primary_path_id || pathOf(build.rune_ids[0])}
                  secondaryPathId={build.secondary_path_id || pathOf(build.rune_ids[4])}
                  selected={build.rune_ids.slice(0, 6)}
                  shards={build.rune_ids.slice(6, 9)}
                  compact
                />
              </Section>
            )}

            {!!build.skill_order.length && (
              <Section title="Orden de habilidades" right={<span className="hx-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--hx-ink)' }}>{build.skill_order.slice(0, 3).join(' › ')}</span>}>
                <HxSkillGrid sequence={build.skill_order} />
              </Section>
            )}

            {(build.starter_ids.length || build.core_item_ids.length || build.boots_id) ? (
              <Section title="Items" right={owned.some(Boolean) ? <span className="hx-label" style={{ color: 'var(--hx-green)' }}>verde = ya lo tiene</span> : null}>
                <div className="pv2-stages">
                  <HxItemStage patch={patch} label="Inicio" ids={build.starter_ids.slice(0, 4)} size={28} owned={owned} />
                  {build.full_builds?.length ? (
                    <div>
                      <div className="hx-label" style={{ marginBottom: 5 }}>Build completa</div>
                      <HxFullBuild patch={patch} builds={build.full_builds} options={build.item_options} owned={owned} size={30} />
                    </div>
                  ) : (
                    <>
                      <HxItemStage patch={patch} label="Orden de build" ids={build.core_item_ids.slice(0, 6)} size={34} arrows core owned={owned} />
                      <HxItemStage patch={patch} label="Botas" ids={build.boots_id ? [build.boots_id] : []} size={28} owned={owned} />
                    </>
                  )}
                </div>
              </Section>
            ) : null}
          </>
        ) : loading ? (
          <motion.div variants={fade} className="pv2-skel">
            <div className="hx-label" style={{ marginBottom: 10 }}>Consultando OP.GG…</div>
            <div className="pv2-skel-lines">
              <span className="pv2-skel-line" style={{ width: '60%' }} />
              <span className="pv2-skel-line" style={{ width: '85%' }} />
              <span className="pv2-skel-line" style={{ width: '40%' }} />
              <span className="pv2-skel-line" style={{ width: '70%' }} />
            </div>
          </motion.div>
        ) : (
          <motion.div variants={fade} className="pv2-empty">Sin datos de build para {champ || 'este campeón'}.</motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function ProfileTab({ p, patch }: { p: PlayerRow; patch: PatchInfo | null }) {
  const og = p.opgg;
  const rank = og?.rank;
  const stat = og?.champStat;
  const today = og?.today;
  const matches = og?.recentMatches || [];
  const kdaOf = (m: RecentMatch) => (m.deaths === 0 ? 'Perfect' : ((m.kills + m.assists) / m.deaths).toFixed(2));
  return (
    <motion.div key="perfil" variants={SIDE} initial="hidden" animate="show" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Clasificatoria" right={og?.error ? <span className="hx-label red">{og.error}</span> : null}>
        <div className="pv2-stat-grid">
          <Stat v={rank?.tier ? `${rank.tier}${rank.division && String(rank.division) !== '0' ? ` ${rank.division}` : ''}` : '—'} k="Rango" color="var(--hx-gold-bright)" />
          <Stat v={rank?.lp != null ? rank.lp : '—'} k="LP" />
          <Stat v={rank ? `${rank.wins}-${rank.losses}` : '—'} k="V-D" />
          <Stat v={og?.seasonWinRate != null ? `${og.seasonWinRate}%` : '—'} k="WR temp" color={og?.seasonWinRate != null ? wrColor(og.seasonWinRate) : undefined} />
        </div>
      </Section>

      <Section title={`Con ${p.championName || '—'}`}>
        {stat ? (
          <div className="pv2-stat-grid">
            <Stat v={stat.play} k="Partidas" />
            <Stat v={`${stat.win_rate}%`} k="Win rate" color={wrColor(stat.win_rate)} />
            <Stat v={stat.kda} k="KDA" />
            <Stat v={`${stat.avg_kills}/${stat.avg_deaths}/${stat.avg_assists}`} k="K/D/A med." small />
          </div>
        ) : (
          <div className="pv2-empty">Sin partidas registradas con {p.championName || 'este campeón'} esta temporada.</div>
        )}
      </Section>

      <Section title="Hoy" right={!!og?.tags?.length && (
        <span className="pv2-tags">
          {og.tags.map((t) => <span key={t} className="hx-pill gold">{t}</span>)}
        </span>
      )}>
        {today && today.games > 0 ? (
          <div className="pv2-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Stat v={today.games} k="Partidas" />
            <Stat v={`${today.wins}-${today.losses}`} k="V-D" />
            <Stat v={today.winRate != null ? `${today.winRate}%` : '—'} k="WR hoy" color={today.winRate != null ? wrColor(today.winRate) : undefined} />
          </div>
        ) : (
          <div className="pv2-empty">Sin partidas hoy.</div>
        )}
      </Section>

      <Section title="Últimas partidas" right={<span className="hx-label">{matches.length}</span>}>
        {matches.length ? (
          <div className="pv2-matches">
            {matches.slice(0, 10).map((m, i) => {
              const won = m.win === true;
              const lost = m.win === false;
              return (
                <motion.div key={m.id || i} variants={fade} className={cx('pv2-match', won && 'win', lost && 'loss')}>
                  <HxHex src={champFaceUrl(patch, m.championName, m.championId)} size={26} tone="dim" letter={(m.championName || '?').charAt(0)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
                      <span className="hx-mono" style={{ fontSize: 13, fontWeight: 700, color: won ? 'var(--hx-green)' : lost ? 'var(--hx-neg)' : 'var(--hx-faint)' }}>{won ? 'V' : lost ? 'D' : '—'}</span>
                      <span className="hx-display" style={{ fontSize: 15, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.championName || '—'}</span>
                      <span className="hx-label">{QUEUE_SHORT[m.gameType] || m.gameType || ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
                      {(m.items.length ? m.items : [0, 0, 0, 0, 0, 0]).slice(0, 6).map((id, j) => <HxItem key={j} patch={patch} id={id} size={16} />)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="k">
                      <span style={{ color: KDA_COLORS.k }}>{m.kills}</span><span style={{ color: 'var(--hx-faint)' }}>/</span>
                      <span style={{ color: KDA_COLORS.d }}>{m.deaths}</span><span style={{ color: 'var(--hx-faint)' }}>/</span>
                      <span style={{ color: KDA_COLORS.a }}>{m.assists}</span>
                    </div>
                    <div className="hx-label">
                      KDA {kdaOf(m)} · <span className="hx-mono">{m.gameLength > 0 ? fmtClock(m.gameLength) : '—'}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="pv2-empty">Sin historial reciente.</div>
        )}
      </Section>
    </motion.div>
  );
}

type SideTab = 'build' | 'perfil';
const SIDE_TABS: Array<{ id: SideTab; label: string }> = [{ id: 'build', label: 'Build' }, { id: 'perfil', label: 'Perfil' }];

function Sidebar({
  p, liveP, patch, build, buildLoading, loading, tab, onTab,
}: {
  p: PlayerRow | null; liveP: any; patch: PatchInfo | null; build: Build | null; buildLoading: boolean; loading: boolean;
  tab: SideTab; onTab: (t: SideTab) => void;
}) {
  const og = p?.opgg;
  const wr = og?.seasonWinRate ?? null;
  const enemy = p?.team === 'CHAOS';
  const owned: number[] = (liveP?.items ?? p?.items ?? []).filter((n: number) => n > 0);
  // Clave del swap: cambia al cambiar de jugador/campeón; una recarga con el
  // mismo roster no la cambia (no re-anima).
  const key = p ? `${p.riotId}|${p.championName}` : loading ? 'loading' : 'empty';
  return (
    <motion.div variants={rise} className="pv2-side">
      <HxPanel corners strong inner={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} variants={SIDE} initial="hidden" animate="show" exit="exit" className="pv2-side-body">
            {p ? (
              <>
                <motion.div variants={fade} className="pv2-side-head">
                  <HxHex src={champFaceUrl(patch, p.championName)} size={62} tone={p.isMe ? 'cyan' : enemy ? 'crimson' : undefined} letter={(p.championName || '?').charAt(0).toUpperCase()} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hx-display hx-chrome pv2-side-name" title={p.riotId}>{p.name || p.riotId}</div>
                    <div className="hx-label" style={{ marginTop: 4, color: enemy ? 'var(--hx-crimson-hi)' : p.isMe ? 'var(--hx-ink)' : 'var(--hx-blue)' }}>
                      {p.championName}{p.position ? ` · ${posEs(p.position)}` : ''}{p.isMe ? ' · Tú' : enemy ? ' · Enemigo' : ' · Aliado'}
                    </div>
                    <div style={{ marginTop: 6, minHeight: 28, display: 'flex', alignItems: 'center' }}>
                      {og?.rank?.tier ? (
                        <RankBadge tier={og.rank.tier} division={og.rank.division} lp={og.rank.lp} size={28} emblemUrl={og.rank.tier_image_url} />
                      ) : (
                        <span className="hx-label" style={{ color: 'var(--hx-faint)' }}>{og?.error || (loading ? 'consultando…' : 'Unranked')}</span>
                      )}
                    </div>
                  </div>
                  <HxRing pct={wr ?? 0} size={60} stroke={4} color={wrColor(wr)} value={wr != null ? `${wr}%` : '—'} label="WR" />
                </motion.div>

                <HxTabs value={tab} options={SIDE_TABS} onChange={onTab} />

                <div className="pv2-side-scroll">
                  <AnimatePresence mode="wait" initial={false}>
                    {tab === 'build' ? (
                      <motion.div key="build" variants={SIDE} initial="hidden" animate="show" exit="exit">
                        <BuildTab build={build} patch={patch} owned={owned} loading={buildLoading} champ={p.championName} pos={p.position} />
                      </motion.div>
                    ) : (
                      <ProfileTab key="perfil" p={p} patch={patch} />
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="pv2-side-scroll">
                <motion.div variants={fade} className={cx(loading && 'pv2-skel')}>
                  <div className="hx-label head" style={{ marginBottom: 10 }}>{loading ? 'Consultando OP.GG…' : 'Sin partida activa'}</div>
                  <div className="pv2-skel-lines">
                    <span className="pv2-skel-line" style={{ width: '55%' }} />
                    <span className="pv2-skel-line" style={{ width: '80%' }} />
                    <span className="pv2-skel-line" style={{ width: '35%' }} />
                  </div>
                  {!loading && <div className="pv2-empty" style={{ marginTop: 12 }}>Entra a una partida y pulsa RECARGAR.</div>}
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </HxPanel>
    </motion.div>
  );
}

// ── Vista ────────────────────────────────────────────────────────────────────
export default function PlayersView() {
  const live = useLive();
  const patch = usePatch();
  const [data, setData] = useState<RosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<SideTab>('build');
  const [ext, setExt] = useState<{ key: string; build: Build | null; loading: boolean }>({ key: '', build: null, loading: false });

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    window.atak
      .opggRoster()
      .then((r: RosterPayload) => {
        setData(r);
        if (!r?.ok) setErr('Sin partida activa o OP.GG no respondió');
      })
      .catch((e: any) => setErr(e?.message || 'Error OP.GG'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const liveById = new Map<string, any>();
  for (const p of live?.state?.players || []) liveById.set(String(p.riotId).toLowerCase(), p);

  const players = data?.players || [];
  const blue = players.filter((p) => p.team === 'ORDER');
  const red = players.filter((p) => p.team !== 'ORDER');
  // El build del payload es del jugador local (o del primero si no hay local).
  const meP = players.find((p) => p.isMe) ?? players[0] ?? null;
  const selP = players.find((p) => p.riotId === sel) ?? meP;
  const usePayloadBuild = !selP || selP === meP;
  const extKey = selP && !usePayloadBuild ? `${selP.championName}|${selP.position || 'MIDDLE'}` : '';

  // Build de otro jugador: una sola petición por campeón+posición (caché de módulo).
  useEffect(() => {
    if (!extKey) return;
    let alive = true;
    const [champ, pos] = extKey.split('|');
    if (!buildCache.has(extKey)) {
      buildCache.set(extKey, Promise.resolve()
        .then(() => window.atak.opggBuild(champ, pos))
        .then(normBuild)
        .catch(() => null));
    }
    setExt({ key: extKey, build: null, loading: true });
    buildCache.get(extKey)!.then((b) => { if (alive) setExt({ key: extKey, build: b, loading: false }); });
    return () => { alive = false; };
  }, [extKey]);

  const build = usePayloadBuild ? normBuild(data?.build) : ext.key === extKey ? ext.build : null;
  const buildLoading = usePayloadBuild ? loading : ext.key !== extKey || ext.loading;
  const selLive = selP ? liveById.get(String(selP.riotId).toLowerCase()) : null;

  return (
    <div className="hx hx-stage pv2">
      {/* Title bar — arrastrable (hx-topbar ya es drag; botones no-drag) */}
      <div className="hx-topbar drag">
        {/* El contenedor .drag queda quieto (sigue arrastrable); solo entra su contenido */}
        <motion.div
          style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HEAD_IN}
        >
          <span className="hx-wordmark">ATAK<em>.GG</em></span>
          <span className="hx-label" style={{ color: 'var(--hx-ink)' }}>Jugadores · F8</span>
          <span className="pv2-clock hx-mono">{fmtClock(live?.state?.gameTime ?? data?.gameTime ?? 0)}</span>
          <span className="hx-label" style={{ letterSpacing: '0.05em' }}>
            {data?.region || '…'}{patch?.version ? ` · Patch ${patch.version}` : ''} · arrastra para mover
          </span>
        </motion.div>
        <motion.div
          className="no-drag"
          style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...HEAD_IN, delay: 0.04 }}
        >
          <button type="button" className="hx-btn ghost pv2-reload" onClick={load} disabled={loading}>
            <Crossfade id={loading ? 'loading' : 'idle'}>{loading ? 'Cargando…' : 'Recargar'}</Crossfade>
          </button>
          <button type="button" className="hx-icon-btn close" onClick={() => window.atak.win('close')} aria-label="Cerrar">
            <svg width="11" height="11" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        {err && (
          <motion.div
            key="err"
            className="pv2-err"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
          >
            {err}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={BODY} initial="hidden" animate="show" className="pv2-body">
        <TeamColumn side="left" list={blue} liveById={liveById} patch={patch} loading={loading} selectedId={selP?.riotId ?? null} onSelect={setSel} />
        <Sidebar p={selP} liveP={selLive} patch={patch} build={build} buildLoading={buildLoading} loading={loading} tab={tab} onTab={setTab} />
        <TeamColumn side="right" list={red} liveById={liveById} patch={patch} loading={loading} selectedId={selP?.riotId ?? null} onSelect={setSel} />
      </motion.div>
    </div>
  );
}
