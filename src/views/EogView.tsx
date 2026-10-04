// src/views/EogView.tsx — POST-PARTIDA. Hero del jugador enfocado (retrato, nota,
// KDA, objetos, stats) + tabs SCOREBOARD / MAPA / ANÁLISIS. Datos reales del
// bloque EOG del LCU (+ eventos del Live Client y snapshot de LP del main).
// Estilos y tokens: ./post.css. Motion: ../motion (solo opacity/transform/width).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  RuneIcon,
  champIconUrl,
  champLoadingUrl,
  champSplashUrl,
  rankLabel,
  TIER_COLOR,
  TIER_ORDER,
  fmtClock,
  fmtK,
  itemIconUrl,
  modeEs,
  openProfile,
  usePatch,
  useStatus,
  type PatchInfo,
} from './shared';
import { BarFill, Digits, EASE, Rise, Stagger, swap } from '../motion';
import EogRuneAnalysis, { readUsedRunes } from './EogRuneAnalysis';
import './post.css';

const st = (o: any, ...keys: string[]): any => {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
    if (o.stats && typeof o.stats === 'object' && o.stats[k] !== undefined) return o.stats[k];
  }
  return undefined;
};

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Side = 'ally' | 'enemy';

interface Row {
  id: string;
  side: Side;
  you: boolean;
  summoner: string;
  riotId: string;
  champ: string;
  championId: number;
  position: string;
  kda: [number, number, number];
  itemIds: number[]; // 6
  trinketId: number;
  puuid: string;
  rank: { tier: string; division: string; lp: number; queue: string } | null;
  damage: number;
  gold: number;
  cs: number;
  vision: number;
  multi: number;
  firstBlood: boolean;
  turrets: number;
  badges: string[];
  raw: any;
}

function getItems(p: any): number[] {
  const s = p?.stats || p || {};
  const arr: number[] = [];
  for (let i = 0; i < 7; i++) {
    arr.push(num(s[`ITEM${i}`] ?? s[`item${i}`] ?? p?.[`ITEM${i}`]));
  }
  if (arr.every((id) => id === 0)) {
    const inv = p?.items || p?.inventory || s?.items;
    if (Array.isArray(inv)) {
      const mapped = inv.map((x: any) => (typeof x === 'number' ? x : num(x?.itemId ?? x?.itemID ?? x?.id)));
      while (mapped.length < 7) mapped.push(0);
      return mapped.slice(0, 7);
    }
  }
  return arr;
}

/** Riot ID "Nombre#TAG" desde el bloque EOG crudo (para abrir el perfil ATAK). */
function riotIdOf(p: any): string {
  const g = st(p, 'riotIdGameName', 'gameName');
  const t = st(p, 'riotIdTagLine', 'riotIdTagline', 'tagLine');
  return g && t ? `${g}#${t}` : '';
}

function playerName(p: any): string {
  if (!p) return '';
  const g = st(p, 'riotIdGameName', 'gameName');
  if (g) return String(g);
  return String(st(p, 'summonerName', 'SUMMONER_NAME', 'fullName') ?? '') || '';
}

function readPlayer(p: any, patch: PatchInfo | null, localKey: string, side: Side, idx: number): Row {
  const championId = num(st(p, 'championId', 'CHAMPION_ID'));
  const champ = String(st(p, 'championName') ?? '') || patch?.byKey[championId]?.name || '';
  const summoner = playerName(p) || champ;
  const puuid = String(st(p, 'puuid') ?? '');
  const you = Boolean(localKey) && (puuid === localKey || playerName(p) === localKey);
  const minions = num(st(p, 'MINIONS_KILLED', 'minionsKilled', 'totalMinionsKilled'));
  const neutral = num(st(p, 'NEUTRAL_MINIONS_KILLED', 'neutralMinionsKilled'));
  const items = getItems(p);
  return {
    id: `${side}-${idx}`,
    side,
    you,
    summoner,
    riotId: riotIdOf(p),
    champ,
    championId,
    position: String(st(p, 'position', 'teamPosition', 'individualPosition', 'PLAYER_POSITION', 'lane') ?? '').toUpperCase(),
    kda: [
      num(st(p, 'CHAMPIONS_KILLED', 'championsKilled', 'kills')),
      num(st(p, 'NUM_DEATHS', 'numDeaths', 'deaths')),
      num(st(p, 'ASSISTS', 'assists')),
    ],
    itemIds: items.slice(0, 6),
    trinketId: items[6] || 0,
    puuid,
    rank: null,
    damage: num(st(p, 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS', 'totalDamageDealtToChampions')),
    gold: num(st(p, 'GOLD_EARNED', 'goldEarned', 'gold')),
    cs: minions + neutral,
    vision: num(st(p, 'VISION_SCORE', 'visionScore', 'wardScore')),
    multi: num(st(p, 'LARGEST_MULTI_KILL', 'largestMultiKill')),
    firstBlood: num(st(p, 'FIRST_BLOOD', 'FIRST_BLOOD_KILL', 'firstBloodKill')) > 0,
    turrets: num(st(p, 'TURRET_KILLS', 'turretKills', 'TURRETS_KILLED')),
    badges: [],
    raw: p,
  };
}

const kdaRatioOf = (r: Row): number => (r.kda[1] > 0 ? (r.kda[0] + r.kda[2]) / r.kda[1] : r.kda[0] + r.kda[2]);

const gradeOf = (kdaRatio: number, dmgShare: number, win: boolean): string => {
  let sc = 0;
  if (kdaRatio >= 6) sc += 34; else if (kdaRatio >= 4) sc += 26; else if (kdaRatio >= 2.5) sc += 17; else if (kdaRatio >= 1.5) sc += 8;
  if (dmgShare >= 0.28) sc += 28; else if (dmgShare >= 0.2) sc += 20; else if (dmgShare >= 0.13) sc += 12;
  if (win) sc += 16;
  return sc >= 88 ? 'S' : sc >= 70 ? 'A' : sc >= 52 ? 'B' : sc >= 32 ? 'C' : 'D';
};

function badgesOf(r: Row, maxDmg: number, teamKills: number, dur: number): string[] {
  const [k, d, a] = r.kda;
  if (r.multi >= 5) return ['Pentakill'];
  const tags: string[] = [];
  if (r.multi >= 4) tags.push('Quadrakill');
  else if (r.multi >= 3) tags.push('Triple kill');
  if (d === 0 && dur > 900) tags.push('Inmortal');
  if (maxDmg > 0 && r.damage / maxDmg >= 0.8) tags.push('Carry de daño');
  if (r.turrets >= 3) tags.push('Destructor');
  if (r.vision >= 55) tags.push('Buena visión');
  if (dur > 0 && r.cs / (dur / 60) >= 8) tags.push('Granjero élite');
  if (teamKills > 5 && (k + a) / teamKills >= 0.7) tags.push('Siempre presente');
  if (r.firstBlood) tags.push('Primera sangre');
  return tags.slice(0, 2);
}

// ── Eventos del Live Client → lista {mm:ss, texto} ───────────────────────────
const DRAGON_ES: Record<string, string> = {
  fire: 'infernal', water: 'de océano', earth: 'de montaña', air: 'de nube',
  hextech: 'hextech', chemtech: 'quimtech', elder: 'ancestral',
};

function eventText(e: any): string | null {
  const killer = String(e.KillerName || '').trim() || 'Alguien';
  switch (e.EventName) {
    case 'GameStart': return 'Empieza la partida';
    case 'MinionsSpawning': return 'Salen los súbditos';
    case 'FirstBlood': return `Primera sangre de ${e.Recipient || killer}`;
    case 'ChampionKill': {
      const n = Array.isArray(e.Assisters) ? e.Assisters.length : 0;
      return `${killer} elimina a ${e.VictimName || 'un rival'}${n ? ` (+${n})` : ''}`;
    }
    case 'Multikill': {
      const s = num(e.KillStreak);
      const label = s >= 5 ? 'pentakill' : s === 4 ? 'quadrakill' : s === 3 ? 'triple kill' : 'doble kill';
      return `${killer} consigue ${label}`;
    }
    case 'Ace': return `Ace de ${e.Acer || killer}`;
    case 'FirstBrick': return `${killer} tira la primera torre`;
    case 'TurretKilled': return `${killer} destruye una torre`;
    case 'InhibKilled': return `${killer} destruye un inhibidor`;
    case 'InhibRespawned': return 'Reaparece un inhibidor';
    case 'DragonKill': {
      const type = DRAGON_ES[String(e.DragonType || '').toLowerCase()];
      const stolen = String(e.Stolen) === 'True' || e.Stolen === true;
      return `${killer} ${stolen ? 'roba' : 'se lleva'} el dragón${type ? ` ${type}` : ''}`;
    }
    case 'HeraldKill': return `${killer} se lleva el Heraldo`;
    case 'BaronKill': return `${killer} se lleva el Barón`;
    case 'GameEnd': return 'Fin de la partida';
    default: return null;
  }
}

// ── Iconos (mismo pipeline DDragon/CDragon del proyecto, por championId/itemId) ─
const champFace = (patch: PatchInfo | null, r: Row): string | null =>
  r.championId > 0
    ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${r.championId}.png`
    : champIconUrl(patch, r.champ);

function Item({ patch, id, small }: { patch: PatchInfo | null; id: number; small?: boolean }) {
  const url = itemIconUrl(patch, id);
  return (
    <span className={`post-item${small ? ' sm' : ''}${url ? '' : ' empty'}`}>
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </span>
  );
}

// Badge: aparece una sola vez por partida (scale 0.96→1, 200ms), aunque el tab
// del scoreboard se desmonte y vuelva a montarse.
const seenBadges = new Set<string>();
function Badge({ k, label }: { k: string; label: string }) {
  const fresh = useRef(!seenBadges.has(k));
  useEffect(() => { seenBadges.add(k); }, [k]);
  return (
    <motion.span
      className="post-badge"
      initial={fresh.current ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      {label}
    </motion.span>
  );
}

type Tab = 'board' | 'map' | 'analysis';
const TABS: Array<[Tab, string]> = [['board', 'SCOREBOARD'], ['map', 'MAPA'], ['analysis', 'ANÁLISIS']];

/** Tabs con subrayado crimson que se desliza con transform (sin animar el primer paint). */
function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [line, setLine] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[tab];
      if (el) setLine({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab]);
  return (
    <div className="post-tabs" role="tablist">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          ref={(el) => { refs.current[id] = el; }}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={tab === id ? 'is-active' : ''}
          onClick={() => onTab(id)}
        >
          {label}
        </button>
      ))}
      {line && (
        <motion.span
          className="post-tab-line"
          initial={false}
          animate={{ x: line.x, scaleX: line.w / 100 }}
          transition={{ duration: 0.25, ease: EASE }}
        />
      )}
    </div>
  );
}

function Shell({ sub, children }: { sub: string; children?: ReactNode }) {
  const status = useStatus(3000);
  const phase = String(status?.phase || '');
  const inSelect = phase === 'ChampSelect';
  const inGame = Boolean(status?.inGame);
  return (
    <div className="post">
      <div className="post-wrap">
        <header className="post-header">
          <div className="post-title">
            <span className="post-wordmark">ATAK<em>.GG</em></span>
            <span className="post-xs post-caps">{sub}</span>
          </div>
          <nav className="post-seg" aria-label="Fase">
            <button
              type="button"
              disabled={!inSelect}
              title={inSelect ? 'Ir al champ select' : 'Sin champ select activo'}
              onClick={() => { void window.atak.showOverlay('champselect'); }}
            >
              SELECT
            </button>
            <button
              type="button"
              disabled={!inGame}
              title={inGame ? 'Mostrar el HUD en partida' : 'Sin partida en curso'}
              onClick={() => { void window.atak.showOverlay('hud'); }}
            >
              EN PARTIDA
            </button>
            <button type="button" className="is-active" aria-current="page">POST</button>
          </nav>
          <button className="post-btn post-close" onClick={() => window.atak.win('close')} aria-label="Cerrar">
            <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden>
              <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function EogView() {
  const [eog, setEog] = useState<any>(null);
  const patch = usePatch();
  useEffect(() => window.atak.onEogData(setEog), []);

  if (!eog) {
    return (
      <Shell sub="POST-PARTIDA">
        <div className="post-loading">
          <motion.span
            className="post-xs post-caps"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            Cargando estadísticas
          </motion.span>
        </div>
      </Shell>
    );
  }
  return <PostMatch eog={eog} patch={patch} />;
}

function PostMatch({ eog, patch }: { eog: any; patch: PatchInfo | null }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>('board');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);

  // ── Match + filas (todo calculado desde el bloque EOG, nada hardcodeado) ────
  const m = useMemo(() => {
    const teams: any[] = Array.isArray(eog.teams) ? eog.teams : [];
    const local = eog.localPlayer || null;
    const localPuuid = String(st(local, 'puuid') ?? '');
    const localKey = localPuuid || playerName(local);

    const myTeamIdx = Math.max(0, teams.findIndex((t) =>
      st(t, 'isPlayerTeam') === true ||
      (t.players || []).some((p: any) => {
        const pu = String(st(p, 'puuid') ?? '');
        return (pu && pu === localPuuid) || (localKey && (playerName(p) === localKey || pu === localKey));
      }),
    ));
    const myTeam = teams[myTeamIdx] || null;
    const enemyTeam = teams.find((_, i) => i !== myTeamIdx) || null;

    const winRaw = myTeam ? st(myTeam, 'isWinningTeam', 'isWinner', 'won', 'win') : st(local, 'WIN', 'win');
    const win: boolean | null =
      winRaw === undefined ? null : winRaw === true || winRaw === 1 || winRaw === 'Win' || winRaw === 'WIN';

    const lenRaw = num(st(eog, 'gameLength', 'gameDuration', 'gameLengthSeconds'));
    const durationSec = lenRaw > 10000 ? Math.round(lenRaw / 1000) : lenRaw;
    const remake = durationSec > 0 && durationSec < 180;

    const allies: Row[] = ((myTeam?.players as any[]) || []).map((p, i) => readPlayer(p, patch, localKey, 'ally', i));
    const enemies: Row[] = ((enemyTeam?.players as any[]) || []).map((p, i) => readPlayer(p, patch, localKey, 'enemy', i));
    // El bloque a veces solo trae localPlayer (sin teams): que al menos salga él.
    if (!allies.length && local) allies.push({ ...readPlayer(local, patch, localKey, 'ally', 0), you: true });
    const all = [...allies, ...enemies];

    const totals = (rows: Row[]): [number, number, number] =>
      rows.reduce<[number, number, number]>((t, r) => [t[0] + r.kda[0], t[1] + r.kda[1], t[2] + r.kda[2]], [0, 0, 0]);
    const maxDamage = Math.max(1, ...all.map((r) => r.damage));
    const allyTotals = totals(allies);
    const enemyTotals = totals(enemies);
    for (const r of all) {
      r.badges = badgesOf(r, maxDamage, r.side === 'ally' ? allyTotals[0] : enemyTotals[0], durationSec);
    }

    // Rango de cada jugador (LCU, resuelto en el main por puuid).
    const ranksByPuuid: Record<string, any> = eog._ranks && typeof eog._ranks === 'object' ? eog._ranks : {};
    for (const r of all) if (r.puuid && ranksByPuuid[r.puuid]?.tier) r.rank = ranksByPuuid[r.puuid];
    const avgTier = (rows: Row[]): string | null => {
      const idx = rows.map((r) => (r.rank ? TIER_ORDER.indexOf(String(r.rank.tier).toUpperCase()) : -1)).filter((i) => i >= 0);
      if (!idx.length) return null;
      return TIER_ORDER[Math.round(idx.reduce((a, b) => a + b, 0) / idx.length)] || null;
    };

    const ranked = eog._ranked || null;
    const after = ranked?.after || null;
    const skinId = num(eog._meSkinId);

    const events: Array<{ t: number; text: string }> = [];
    for (const e of (Array.isArray(eog._liveEvents) ? eog._liveEvents : []) as any[]) {
      const text = eventText(e);
      if (text) events.push({ t: num(e.EventTime), text });
    }
    events.sort((a, b) => a.t - b.t);

    return {
      win, remake, durationSec,
      queue: modeEs(String(st(eog, 'gameMode') ?? '')),
      allies, enemies, all, maxDamage, allyTotals, enemyTotals,
      allyAvgTier: avgTier(allies), enemyAvgTier: avgTier(enemies),
      rank: after?.tier && !remake
        ? {
            label: `${String(after.tier).toUpperCase()}${after.division && String(after.division) !== 'NA' ? ` ${after.division}` : ''}`,
            queue: after.queue === 'RANKED_FLEX_SR' ? 'FLEXIBLE' : 'SOLO/DUO',
            lp: num(after.lp),
            lpDelta: ranked?.lpDelta != null && Number.isFinite(Number(ranked.lpDelta)) ? Number(ranked.lpDelta) : null,
          }
        : null,
      localSkin: skinId >= 1000 ? skinId % 1000 : Math.max(0, skinId),
      events,
    };
  }, [eog, patch]);

  const localRow = m.all.find((r) => r.you) || m.allies[0] || null;
  const focus = m.all.find((r) => r.id === focusId) || localRow;

  // ── Derivados del jugador enfocado ─────────────────────────────────────────
  const f = useMemo(() => {
    if (!focus) return null;
    const teamKills = (focus.side === 'ally' ? m.allyTotals : m.enemyTotals)[0];
    const ratio = kdaRatioOf(focus);
    const teamWon = m.win == null ? false : focus.side === 'ally' ? m.win : !m.win;
    return {
      ratio,
      kp: teamKills > 0 ? Math.round(((focus.kda[0] + focus.kda[2]) / teamKills) * 100) : null,
      csMin: m.durationSec > 0 ? focus.cs / (m.durationSec / 60) : null,
      grade: m.remake ? '—' : gradeOf(ratio, focus.damage / m.maxDamage, teamWon),
    };
  }, [focus, m]);

  // Retrato: loading art (vertical). La skin solo se conoce para el jugador local.
  const [badArt, setBadArt] = useState<Record<string, true>>({});
  const portrait = useMemo(() => {
    if (!focus) return null;
    const skinned = focus.you && m.localSkin > 0 ? champLoadingUrl(patch, focus.champ, m.localSkin) : null;
    if (skinned && !badArt[skinned]) return skinned;
    const base = champLoadingUrl(patch, focus.champ, 0);
    return base && !badArt[base] ? base : null;
  }, [focus, patch, m.localSkin, badArt]);

  // Orden de skills: recomendación OP.GG del campeón enfocado (el EOG no la trae).
  const [builds, setBuilds] = useState<Record<string, string[]>>({});
  const focusChamp = focus?.champ || '';
  const focusPos = focus?.position || 'MIDDLE';
  useEffect(() => {
    if (tab !== 'analysis' || !focusChamp || builds[focusChamp]) return;
    let alive = true;
    window.atak
      .opggBuild(focusChamp, focusPos)
      .then((b: any) => {
        if (alive) setBuilds((prev) => ({ ...prev, [focusChamp]: Array.isArray(b?.skill_order) ? b.skill_order.map(String) : [] }));
      })
      .catch(() => { if (alive) setBuilds((prev) => ({ ...prev, [focusChamp]: [] })); });
    return () => { alive = false; };
  }, [tab, focusChamp, focusPos, builds]);

  const nextMatch = () => {
    // Si ya hay champ select en curso, traerlo al frente; si no, solo salir.
    window.atak.status()
      .then((s: any) => { if (s?.phase === 'ChampSelect') return window.atak.showOverlay('champselect'); })
      .catch(() => {})
      .finally(() => window.atak.win('close'));
  };

  const sub = `POST-PARTIDA${m.durationSec > 0 ? ` · ${fmtClock(m.durationSec)}` : ''}`;
  const resultText = m.remake ? 'REMAKE' : m.win == null ? 'PARTIDA FINALIZADA' : m.win ? 'VICTORIA' : 'DERROTA';
  const resultCls = m.remake || m.win == null ? 'neutral' : m.win ? 'win' : 'loss';

  // Función (no componente): un componente declarado aquí se remontaría en cada
  // render y reiniciaría barras y badges.
  const teamBlock = (side: Side, rows: Row[], totals: [number, number, number]) => (
    <section className="post-team" key={side}>
      <div className="post-team-head">
        <b className={side}>{side === 'ally' ? 'TU EQUIPO' : 'ENEMIGO'}</b>
        {(side === 'ally' ? m.allyAvgTier : m.enemyAvgTier) && (
          <span className="post-xs" style={{ marginLeft: 12, marginRight: 'auto', color: TIER_COLOR[(side === 'ally' ? m.allyAvgTier : m.enemyAvgTier)!] }}>
            ELO MEDIO · {rankLabel({ tier: side === 'ally' ? m.allyAvgTier : m.enemyAvgTier })}
          </span>
        )}
        <span className="post-xs">
          {totals[0]} / <span className="is-bad">{totals[1]}</span> / {totals[2]}
        </span>
      </div>
      <div className="post-cols" aria-hidden>
        <span>JUGADOR</span><span>KDA</span><span>OBJETOS</span><span>DAÑO</span>
        <span className="r">ORO</span><span className="r">CS</span><span className="r">VS</span>
      </div>
      {rows.map((r) => {
        const face = champFace(patch, r);
        return (
          <button
            key={r.id}
            type="button"
            className={`post-row${focus?.id === r.id ? ' is-focus' : ''}`}
            aria-pressed={focus?.id === r.id}
            onClick={() => setFocusId(r.id)}
          >
            <span className="post-cell-player">
              <span className="post-face">{face ? <img src={face} alt="" draggable={false} /> : null}</span>
              <span className="post-who">
                <b>{r.summoner}{r.you ? <i> · TÚ</i> : null}</b>
                <em>
                  {r.champ}
                  <span className="post-rankpill" style={{ color: r.rank ? TIER_COLOR[String(r.rank.tier).toUpperCase()] : undefined }}>
                    {rankLabel(r.rank)}
                  </span>
                </em>
                {r.badges.length > 0 && (
                  <span className="post-badges">
                    {r.badges.map((b) => <Badge key={b} k={`${r.id}:${b}`} label={b} />)}
                  </span>
                )}
              </span>
            </span>
            <span className="post-cell-kda">
              {r.kda[0]}<i> / </i><span className="is-bad">{r.kda[1]}</span><i> / </i>{r.kda[2]}
            </span>
            <span className="post-cell-items">
              {r.itemIds.map((id, j) => <Item key={j} patch={patch} id={id} small />)}
              <Item patch={patch} id={r.trinketId} small />
            </span>
            <span className="post-cell-dmg">
              <span className="post-rail dmg"><BarFill pct={(r.damage / m.maxDamage) * 100} /></span>
              <span>{fmtK(r.damage)}</span>
            </span>
            <span className="post-meta">
              <span data-label="ORO">{fmtK(r.gold)}</span>
              <span data-label="CS">{r.cs}</span>
              <span data-label="VS">{r.vision}</span>
            </span>
          </button>
        );
      })}
    </section>
  );

  const usedRunes = focus ? readUsedRunes(focus.raw) : null;
  const skills = builds[focusChamp];

  const sentence = (() => {
    if (!focus || !f) return '';
    const [k, d, a] = focus.kda;
    if (focus.you) {
      const kp = f.kp == null
        ? 'Tu equipo no consiguió kills'
        : `Participaste en el ${f.kp}% de las kills de tu equipo${f.kp >= 60 ? ', siempre cerca de la pelea' : f.kp < 35 ? ', lejos de la mayoría de peleas' : ''}`;
      const visMin = m.durationSec > 0 ? focus.vision / (m.durationSec / 60) : 0;
      const vis = `${focus.vision} de visión (${visMin.toFixed(1)}/min${visMin >= 1.5 ? ', buen control' : visMin < 0.6 ? ', pon más wards' : ''})`;
      return `${kp}. ${vis}. Nota ${f.grade}.`;
    }
    const share = Math.round((focus.damage / m.maxDamage) * 100);
    return `${focus.summoner} terminó ${k}/${d}/${a} (KDA ${f.ratio.toFixed(1)}) con ${fmtK(focus.damage)} de daño, el ${share}% del máximo de la partida.`;
  })();

  return (
    <Shell sub={sub}>
      {/* Escenario: splash del campeón enfocado respirando al fondo */}
      <AnimatePresence initial={false}>
        {focus && champSplashUrl(patch, focus.champ) && (
          <motion.div key={focus.champ} className="post-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <motion.img src={champSplashUrl(patch, focus.champ)!} alt="" initial={{ scale: 1.12 }} animate={{ scale: 1.04 }} transition={{ duration: 16, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero ── */}
      {focus && f && (
        <section className="post-hero post-glass">
          <div>
            <div className="post-portrait">
              <AnimatePresence initial={false}>
                {portrait && (
                  <motion.img
                    key={portrait}
                    src={portrait}
                    alt={focus.champ}
                    draggable={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    onError={() => setBadArt((prev) => ({ ...prev, [portrait]: true }))}
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="post-portrait-cap">
              <span className="post-xs post-caps">Esta partida</span>
              <b>{focus.champ || '—'}</b>
            </div>
          </div>

          <Stagger className="post-hero-main">
            <Rise>
              <motion.div
                className={`post-result ${resultCls}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: -28 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
              >
                {resultText}
              </motion.div>
              <div className="post-xs post-caps" style={{ marginTop: 4 }}>
                {[m.queue, m.durationSec > 0 ? fmtClock(m.durationSec) : null].filter(Boolean).join(' · ')}
              </div>
            </Rise>

            {m.rank && (
              <Rise className="post-rank">
                <span className="post-xs post-caps">{m.rank.queue}</span>
                <b>{m.rank.label} · {m.rank.lp} LP</b>
                {m.rank.lpDelta != null && (
                  <b className={m.rank.lpDelta > 0 ? 'is-ok' : m.rank.lpDelta < 0 ? 'is-bad' : ''}>
                    {m.rank.lpDelta > 0 ? `+${m.rank.lpDelta}` : m.rank.lpDelta < 0 ? `−${Math.abs(m.rank.lpDelta)}` : '0'} LP
                  </b>
                )}
                <span className={`post-rail${m.rank.lpDelta ? (m.rank.lpDelta > 0 ? ' up' : ' down') : ''}`}>
                  <BarFill pct={m.rank.lp} delay={0.1} />
                </span>
              </Rise>
            )}

            <Rise className="post-identity">
              <div className={`post-grade${f.grade === 'S' ? ' top' : ''}`} aria-label={`Nota ${f.grade}`}>
                <motion.span
                  key={focus.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  {f.grade}
                </motion.span>
              </div>
              <div style={{ minWidth: 0 }}>
                <Digits
                  id={focus.id}
                  className="post-kda"
                  parts={[
                    { text: String(focus.kda[0]) },
                    { text: ' / ', color: 'var(--faint)' },
                    { text: String(focus.kda[1]), color: 'var(--bad)' },
                    { text: ' / ', color: 'var(--faint)' },
                    { text: String(focus.kda[2]) },
                  ]}
                />
                <div className="post-xs">
                  {focus.summoner} · KDA {f.ratio.toFixed(1)}
                  {focus.rank && <span style={{ marginLeft: 8, color: TIER_COLOR[String(focus.rank.tier).toUpperCase()] }}>{rankLabel(focus.rank)}</span>}
                </div>
              </div>
              <motion.div
                key={focus.id}
                className="post-items"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {focus.itemIds.map((id, j) => <Item key={j} patch={patch} id={id} />)}
                <Item patch={patch} id={focus.trinketId} />
              </motion.div>
            </Rise>

            <Rise className="post-stats">
              {[
                { k: 'DAÑO', v: fmtK(focus.damage) },
                { k: 'CS', v: String(focus.cs), s: f.csMin != null ? `${f.csMin.toFixed(1)}/min` : '' },
                { k: 'ORO', v: fmtK(focus.gold) },
                { k: 'VISIÓN', v: String(focus.vision) },
                { k: 'KP', v: f.kp != null ? `${f.kp}%` : '—' },
              ].map((s) => (
                <div key={s.k} className="post-stat">
                  <span className="post-xs post-caps">{s.k}</span>
                  <b>{s.v}{s.s ? <small> {s.s}</small> : null}</b>
                </div>
              ))}
            </Rise>
          </Stagger>
        </section>
      )}

      <Tabs tab={tab} onTab={setTab} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="post-panel"
          role="tabpanel"
          initial={reduce ? { opacity: 0 } : swap.initial}
          animate={swap.animate}
          exit={reduce ? { opacity: 0, transition: { duration: 0.15 } } : swap.exit}
        >
          {tab === 'board' && (
            <>
              {teamBlock('ally', m.allies, m.allyTotals)}
              {m.enemies.length > 0 && teamBlock('enemy', m.enemies, m.enemyTotals)}
            </>
          )}

          {tab === 'map' && (
            m.events.length ? (
              <ol className="post-events post-glass">
                {m.events.map((e, i) => (
                  <li key={i}>
                    <time>{fmtClock(e.t)}</time>
                    <span>{e.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="post-empty post-glass">
                No se registraron eventos de esta partida. La línea de tiempo se llena con el Live Client mientras el companion está abierto durante el juego.
              </div>
            )
          )}

          {tab === 'analysis' && focus && (
            <>
              <section className="post-analysis post-glass">
                <div>
                  <h3>RUNAS DE {focus.champ.toUpperCase()}</h3>
                  {usedRunes && usedRunes.perkIds.length ? (
                    <div className="post-runes">
                      {usedRunes.perkIds.slice(0, 6).map((id, i) => (
                        <RuneIcon key={`${focus.id}-${i}`} id={id} patch={patch} size={i === 0 ? 44 : 28} keystone={i === 0} />
                      ))}
                    </div>
                  ) : (
                    <span className="post-xs">El cliente no envió las runas de este jugador.</span>
                  )}
                </div>
                <div>
                  <h3>ORDEN DE SKILLS · OP.GG</h3>
                  {skills === undefined ? (
                    <span className="post-xs">Consultando…</span>
                  ) : skills.length ? (
                    <div className="post-skills">
                      {skills.slice(0, 18).map((s, i) => (
                        <span key={i} className={`post-skill${s.toUpperCase() === 'R' ? ' r' : ''}`}>{s.toUpperCase()}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="post-xs">Sin datos de OP.GG para este campeón.</span>
                  )}
                </div>
                <p className="post-quote">{sentence}</p>
                {focus.riotId && (
                  <button type="button" className="post-link" onClick={() => openProfile(focus.riotId)}>
                    VER PERFIL EN ATAK.GG
                  </button>
                )}
              </section>

              {focus.you && m.enemies.length > 0 && (
                <section className="post-duel post-glass">
                  <EogRuneAnalysis
                    patch={patch}
                    myChampion={focus.champ}
                    myItems={[...focus.itemIds, focus.trinketId]}
                    usedRunes={readUsedRunes(focus.raw)}
                    enemyChampions={m.enemies.map((r) => r.champ).filter(Boolean)}
                    defaultRival={focus.position ? m.enemies.find((r) => r.position === focus.position)?.champ || '' : ''}
                    position={focus.position || 'MIDDLE'}
                  />
                </section>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <footer className="post-footer">
        <button
          type="button"
          className={`post-btn${analysisReady ? ' is-done' : ''}`}
          onClick={() => { setTab('analysis'); setAnalysisReady(true); }}
        >
          {analysisReady ? 'ANÁLISIS LISTO' : 'ANÁLISIS COMPLETO'}
        </button>
        <button type="button" className="post-btn primary" onClick={nextMatch}>SIGUIENTE PARTIDA</button>
      </footer>
    </Shell>
  );
}
