// electron/services/opgg.ts — cliente OP.GG MCP (mismo endpoint que sniperlol)
// https://mcp-api.op.gg/mcp  — sin API key. Cache en memoria 30 min.
import https from 'node:https';

const MCP_URL = 'https://mcp-api.op.gg/mcp';
const CACHE_TTL = 30 * 60_000;
const cache = new Map<string, { data: any; exp: number }>();

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function postJson(url: string, body: unknown, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      host: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Accept: 'application/json',
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('opgg timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Parser texto custom OP.GG MCP ────────────────────────────────────────────
function parseOPGGText(text: string): any {
  const lines = text.trim().split('\n');
  const schemas: Record<string, string[]> = {};
  let dataLine = '';
  for (const line of lines) {
    const m = line.match(/^class (\w+): (.+)$/);
    if (m) schemas[m[1]] = m[2].split(',').map((s) => s.trim());
    else if (line.trim() && !line.startsWith('class ')) dataLine = line.trim();
  }
  if (!dataLine) return null;
  let pos = 0;
  const skipWs = () => { while (pos < dataLine.length && dataLine[pos] === ' ') pos++; };
  function parseVal(): any {
    skipWs();
    if (pos >= dataLine.length) return null;
    const ch = dataLine[pos];
    if (ch === '"') {
      pos++;
      let s = '';
      while (pos < dataLine.length) {
        const c = dataLine[pos];
        if (c === '\\') { pos++; const esc = dataLine[pos++]; s += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc; continue; }
        if (c === '"') { pos++; break; }
        s += c; pos++;
      }
      return s;
    }
    if (ch === '[') {
      pos++;
      const arr: any[] = [];
      skipWs();
      while (pos < dataLine.length && dataLine[pos] !== ']') {
        arr.push(parseVal());
        skipWs();
        if (dataLine[pos] === ',') pos++;
        skipWs();
      }
      if (dataLine[pos] === ']') pos++;
      return arr;
    }
    const rest = dataLine.slice(pos);
    if (rest.startsWith('null')) { pos += 4; return null; }
    if (rest.startsWith('true')) { pos += 4; return true; }
    if (rest.startsWith('false')) { pos += 5; return false; }
    let token = '';
    while (pos < dataLine.length && !/[,\[\]()\s]/.test(dataLine[pos])) token += dataLine[pos++];
    skipWs();
    if (dataLine[pos] === '(' && schemas[token]) {
      pos++;
      const fields = schemas[token];
      const obj: Record<string, any> = {};
      for (let i = 0; i < fields.length; i++) {
        skipWs();
        if (pos >= dataLine.length || dataLine[pos] === ')') break;
        if (i > 0) { if (dataLine[pos] === ',') pos++; skipWs(); }
        if (dataLine[pos] === ')') break;
        obj[fields[i]] = parseVal();
      }
      skipWs();
      if (dataLine[pos] === ')') pos++;
      return obj;
    }
    if (dataLine[pos] === '(') {
      let depth = 0;
      while (pos < dataLine.length) {
        if (dataLine[pos] === '(') depth++;
        else if (dataLine[pos] === ')') { depth--; pos++; if (depth === 0) break; continue; }
        pos++;
      }
      return { _type: token };
    }
    const num = parseFloat(token);
    return !isNaN(num) && token !== '' ? num : token;
  }
  try { return parseVal(); } catch { return null; }
}

async function callTool(name: string, args: Record<string, any>): Promise<any> {
  const json = await postJson(MCP_URL, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  if (json.error) throw new Error(String(json.error.message ?? json.error));
  const text: string = json.result?.content?.[0]?.text ?? '';
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* custom parser */ }
  }
  return parseOPGGText(text);
}

// ── Region / champ name ──────────────────────────────────────────────────────
export function normaliseRegion(platform: string): string {
  const r: Record<string, string> = {
    NA1: 'NA', EUW1: 'EUW', EUNE1: 'EUNE', KR: 'KR', BR1: 'BR',
    LA1: 'LAN', LA2: 'LAS', OC1: 'OCE', JP1: 'JP', RU: 'RU', TR1: 'TR', SG2: 'SG',
  };
  return r[platform.toUpperCase()] ?? platform.toUpperCase().replace(/\d+$/, '');
}

export function toOPGGChampName(name: string): string {
  return name
    .toUpperCase()
    .replace(/['&.]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const POS_MAP: Record<string, string> = {
  TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', MID: 'mid',
  BOTTOM: 'adc', BOT: 'adc', ADC: 'adc', UTILITY: 'support', SUPPORT: 'support',
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface OPGGRank {
  tier: string | null;
  division: number | string | null;
  lp: number | null;
  wins: number;
  losses: number;
  queue?: string;
  /** URL real del medallón OP.GG (preferida sobre CDragon). */
  tier_image_url?: string | null;
}

export interface OPGGChampStat {
  champion_name: string;
  play: number;
  win: number;
  lose: number;
  kill: number;
  death: number;
  assist: number;
  op_score: number;
}

export interface OPGGFullProfile {
  rank: OPGGRank;
  champion_stats: OPGGChampStat[];
  level: number | null;
  profile_image_url: string | null;
  is_hot_streak: boolean;
  is_veteran: boolean;
  is_fresh_blood: boolean;
}

export interface OPGGBuild {
  rune_ids: number[];
  primary_rune_names: string[];
  secondary_rune_names: string[];
  primary_path_id: number;
  secondary_path_id: number;
  core_item_ids: number[];
  core_item_names: string[];
  boots_id: number;
  boots_name: string;
  starter_ids: number[];
  starter_names: string[];
  skill_order: string[];
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  tier: number | null;
  rank: number | null;
}

/** Últimas partidas (OP.GG MCP lol_list_summoner_matches). */
export interface RecentMatch {
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
  /** WIN | LOSE | UNKNOWN */
  result: string;
  win: boolean | null;
}

export interface DayForm {
  wins: number;
  losses: number;
  games: number;
  /** 0–100, null si no hay partidas del día con resultado. */
  winRate: number | null;
}

export interface PlayerOpggCard {
  riotId: string;
  gameName: string;
  tagLine: string;
  championName: string;
  rank: OPGGRank | null;
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
  level: number | null;
  profile_image_url: string | null;
  /** Últimas ~10 partidas (form estilo Porofessor). */
  recentMatches: RecentMatch[];
  /** WR del día (solo partidas con WIN/LOSE de hoy). */
  today: DayForm | null;
  error?: string;
}

// ── Summoner full ────────────────────────────────────────────────────────────
/** Extrae Solo/Duo (o Flex) de league_stats de OP.GG MCP. */
function readRankFromSummoner(summoner: any): OPGGRank {
  const stats: any[] = Array.isArray(summoner?.league_stats)
    ? summoner.league_stats
    : Array.isArray(summoner?.data?.summoner?.league_stats)
      ? summoner.data.summoner.league_stats
      : [];

  const pick =
    stats.find((s) => String(s?.game_type || '').toUpperCase() === 'SOLORANKED') ||
    stats.find((s) => String(s?.game_type || '').toUpperCase() === 'FLEXRANKED') ||
    stats.find((s) => s?.tier_info?.tier) ||
    null;

  // Fallbacks por si el parse llega aplanado
  const tierInfo =
    pick?.tier_info ||
    summoner?.solo_tier_info ||
    summoner?.tier_info ||
    null;

  const tierRaw = tierInfo?.tier ?? pick?.tier ?? null;
  const tier =
    tierRaw && String(tierRaw).toUpperCase() !== 'NONE' && String(tierRaw).toUpperCase() !== 'UNRANKED'
      ? String(tierRaw).toUpperCase()
      : null;

  return {
    tier,
    division: tierInfo?.division ?? pick?.division ?? null,
    lp: tierInfo?.lp != null ? Number(tierInfo.lp) : (pick?.lp != null ? Number(pick.lp) : null),
    wins: Number(pick?.win ?? pick?.wins ?? pick?.match_record?.win ?? 0) || 0,
    losses: Number(pick?.lose ?? pick?.losses ?? pick?.match_record?.lose ?? 0) || 0,
    queue: String(pick?.game_type || 'SOLORANKED'),
    tier_image_url: tierInfo?.tier_image_url ?? pick?.tier_image_url ?? null,
  };
}

export async function getSummonerFullProfile(
  gameName: string,
  tagLine: string,
  region: string,
): Promise<OPGGFullProfile | null> {
  const reg = normaliseRegion(region);
  // Tag limpio: OP.GG a veces devuelve "KR  1" con espacios
  const cleanTag = String(tagLine || '').replace(/\s+/g, '');
  const cacheKey = `full:${reg}:${gameName.toLowerCase()}:${cleanTag.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as OPGGFullProfile;

  try {
    const result = await callTool('lol_get_summoner_profile', {
      game_name: gameName,
      tag_line: cleanTag,
      region: reg,
      desired_output_fields: [
        'data.summoner.level',
        'data.summoner.profile_image_url',
        'data.summoner.league_stats',
        'data.summoner.most_champions.champion_stats',
      ],
    });

    const summoner = result?.data?.summoner ?? result?.summoner ?? result?.data ?? result;
    if (!summoner) return null;

    const rank = readRankFromSummoner(summoner);
    // Flags de racha viven en la entry de league_stats
    const soloEntry = (Array.isArray(summoner.league_stats) ? summoner.league_stats : [])
      .find((s: any) => String(s?.game_type || '').toUpperCase() === 'SOLORANKED');

    const champRaw: any[] =
      summoner?.most_champions?.champion_stats ??
      summoner?.champion_stats ??
      [];
    const champion_stats: OPGGChampStat[] = (Array.isArray(champRaw) ? champRaw : []).map((c: any) => ({
      champion_name: String(c.champion_name ?? c.name ?? ''),
      play: Number(c.play ?? c.games ?? 0) || 0,
      win: Number(c.win ?? c.wins ?? 0) || 0,
      lose: Number(c.lose ?? c.losses ?? 0) || 0,
      kill: Number(c.kill ?? c.kills ?? 0) || 0,
      death: Number(c.death ?? c.deaths ?? 0) || 0,
      assist: Number(c.assist ?? c.assists ?? 0) || 0,
      op_score: Number(c.op_score ?? c.score ?? 0) || 0,
    }));

    const profile: OPGGFullProfile = {
      rank,
      champion_stats,
      level: summoner?.level ?? summoner?.summoner_level ?? null,
      profile_image_url: summoner?.profile_image_url ?? summoner?.profile_icon_url ?? null,
      is_hot_streak: Boolean(soloEntry?.is_hot_streak ?? summoner?.is_hot_streak),
      is_veteran: Boolean(soloEntry?.is_veteran ?? summoner?.is_veteran),
      is_fresh_blood: Boolean(soloEntry?.is_fresh_blood ?? summoner?.is_fresh_blood),
    };
    cache.set(cacheKey, { data: profile, exp: Date.now() + CACHE_TTL });
    return profile;
  } catch (e: any) {
    console.warn('[opgg] profile failed', gameName, e?.message);
    return null;
  }
}

// Modos que OP.GG diferencia. Flex usa el dataset 'ranked' (no existe uno
// aparte y el meta es el mismo); ARAM y Arena sí tienen datos propios.
export type OpggGameMode = 'ranked' | 'aram' | 'arena';

export async function getChampionBuild(
  championName: string, position: string, gameMode: OpggGameMode = 'ranked'
): Promise<OPGGBuild | null> {
  const opggPos = POS_MAP[(position || '').toUpperCase()] ?? 'all';
  const opggChamp = toOPGGChampName(championName);
  const cacheKey = `build:${gameMode}:${opggChamp}:${opggPos}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as OPGGBuild;

  // ARAM/Arena no tienen líneas: OP.GG ignora/rechaza position ahí.
  if (gameMode !== 'ranked') {
    try {
      const alt = await buildFromAnalysis(opggChamp, gameMode, null);
      if (alt) { cache.set(cacheKey, { data: alt, exp: Date.now() + CACHE_TTL }); return alt; }
    } catch (e: any) {
      console.warn(`[opgg] build ${gameMode} falló para ${opggChamp} — fallback ranked:`, e?.message);
    }
    // Sin datos del modo → mejor las runas de ranked que nada.
  }

  try {
    const build = await buildFromAnalysis(opggChamp, 'ranked', opggPos === 'all' ? 'mid' : opggPos);
    if (!build) return null;
    cache.set(cacheKey, { data: build, exp: Date.now() + CACHE_TTL });
    return build;
  } catch (e: any) {
    console.warn('[opgg] build failed', championName, e?.message);
    return null;
  }
}

// Llamada + parse de lol_get_champion_analysis para cualquier modo.
async function buildFromAnalysis(
  opggChamp: string, gameMode: OpggGameMode, position: string | null
): Promise<OPGGBuild | null> {
  const args: Record<string, any> = {
    game_mode: gameMode,
    champion: opggChamp,
    desired_output_fields: [
      'data.runes',
      'data.core_items',
      'data.boots',
      'data.starter_items',
      'data.skills',
      'data.summary.average_stats',
    ],
  };
  if (position) args.position = position;
  const result = await callTool('lol_get_champion_analysis', args);
  const d = result?.data;
  if (!d?.runes?.primary_rune_ids?.length) return null;
  const runes = d.runes;
  const stat_mods: number[] = Array.isArray(runes.stat_mod_ids) ? runes.stat_mod_ids : [];
  const rune_ids = [
    ...(runes.primary_rune_ids as number[]),
    ...(runes.secondary_rune_ids as number[]),
    ...stat_mods.slice(0, 3),
  ];
  while (rune_ids.length < 9) rune_ids.push(5001);
  const avg = d.summary?.average_stats;
  return {
    rune_ids,
    primary_rune_names: runes.primary_rune_names ?? [],
    secondary_rune_names: runes.secondary_rune_names ?? [],
    primary_path_id: runes.primary_page_id ?? 8000,
    secondary_path_id: runes.secondary_page_id ?? 8300,
    core_item_ids: d.core_items?.ids ?? [],
    core_item_names: d.core_items?.ids_names ?? [],
    boots_id: d.boots?.ids?.[0] ?? 3006,
    boots_name: d.boots?.ids_names?.[0] ?? '',
    starter_ids: d.starter_items?.ids ?? [],
    starter_names: d.starter_items?.ids_names ?? [],
    skill_order: d.skills?.order ?? [],
    win_rate: avg?.win_rate ?? null,
    pick_rate: avg?.pick_rate ?? null,
    ban_rate: avg?.ban_rate ?? null,
    tier: avg?.tier ?? null,
    rank: avg?.rank ?? null,
  };
}

// ── Counters (matchup guide OP.GG MCP) ───────────────────────────────────────
export interface CounterPick {
  id: number;
  name: string;
  /** WR del counter contra nuestro campeón (0–1). */
  winRate: number;
  games: number;
}

const OPGG_ENUM_TO_POSNAME: Record<string, string> = {
  top: 'TOP', jungle: 'JUNGLE', mid: 'MID', adc: 'ADC', support: 'SUPPORT',
};

/** Campeones que más le ganan a `championName` en esa posición (débiles vs ellos). */
export async function getCounters(championName: string, position: string): Promise<CounterPick[]> {
  // Delegado en la tabla completa del matchup guide. Antes leía
  // summary.positions[].counters, que solo trae 3 entradas destacadas; el nodo
  // data.counters trae las ~50 con play/win reales.
  const table = await getCounterTable(championName, position);
  return table
    .map((c) => ({
      id: c.id,
      name: c.name,
      // winRate del COUNTER contra este campeón = complemento del nuestro.
      winRate: 1 - c.myWinRate,
      games: c.play,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

// ── Matchup de línea (datos reales por rival) ────────────────────────────────
// lol_get_lane_matchup_guide devuelve runas, hechizos, items y skills FILTRADOS
// por el campeón rival, más un tip escrito y la tabla de counters del campeón.
// Verificado: cambian las muestras y los builds al cambiar opponent_champion.
export interface MatchupRunePage {
  primaryPathId: number;
  primaryPathName: string;
  secondaryPathId: number;
  secondaryPathName: string;
  primaryIds: number[];
  primaryNames: string[];
  secondaryIds: number[];
  secondaryNames: string[];
  shardIds: number[];
  play: number;
  winRate: number | null; // 0-100
  pickRate: number | null; // 0-100
}

export interface MatchupItemSet {
  ids: number[];
  names: string[];
  play: number;
  winRate: number | null;
}

export interface CounterRow {
  id: number;
  name: string;
  play: number;
  /** Winrate DE ESTE campeón contra `name` (0–1). */
  myWinRate: number;
}

export interface MatchupData {
  myChampion: string;
  opponent: string;
  position: string;
  /** Partidas del matchup concreto (0 si OP.GG no tiene muestra). */
  play: number;
  /** Winrate propio en el matchup, 0-100. */
  winRate: number | null;
  runes: MatchupRunePage[];
  spells: MatchupItemSet[];
  coreItems: MatchupItemSet[];
  boots: MatchupItemSet[];
  starterItems: MatchupItemSet[];
  skills: string[];
  counters: CounterRow[];
  /** Tip escrito de OP.GG contra ese rival (solo en inglés / coreano). */
  tip: string;
  /** 'even' | 'aggressive' | 'defensive' … según OP.GG. */
  playStyle: string;
}

const pct = (v: any): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n <= 1 ? n * 100 : n) * 10) / 10;
};

const itemSet = (e: any): MatchupItemSet => ({
  ids: Array.isArray(e?.ids) ? e.ids.map(Number) : [],
  names: Array.isArray(e?.ids_names) ? e.ids_names.map(String) : [],
  play: Number(e?.play) || 0,
  winRate: e?.play ? Math.round(((Number(e.win) || 0) / Number(e.play)) * 1000) / 10 : null,
});

export async function getMatchup(
  championName: string,
  opponentName: string,
  position: string,
): Promise<MatchupData | null> {
  const me = toOPGGChampName(championName);
  const opp = toOPGGChampName(opponentName);
  const opggPos = POS_MAP[(position || '').toUpperCase()] ?? 'mid';
  const pos = opggPos === 'all' ? 'mid' : opggPos;
  if (!me || !opp) return null;

  const cacheKey = `matchup:${me}:${opp}:${pos}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as MatchupData;

  try {
    const result = await callTool('lol_get_lane_matchup_guide', {
      my_champion: me,
      opponent_champion: opp,
      position: pos,
    });
    const d = result?.data;
    if (!d) return null;

    const counters: CounterRow[] = (Array.isArray(d.counters) ? d.counters : [])
      .map((c: any) => ({
        id: Number(c?.champion_id) || 0,
        name: String(c?.champion_name ?? ''),
        play: Number(c?.play) || 0,
        myWinRate: c?.play ? (Number(c.win) || 0) / Number(c.play) : 0,
      }))
      .filter((c: CounterRow) => c.id && c.name);

    // La muestra del matchup concreto sale de la fila del rival en counters.
    const oppNeedle = opponentName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const oppRow = counters.find(
      (c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === oppNeedle,
    );

    const runes: MatchupRunePage[] = (Array.isArray(d.runes) ? d.runes : [])
      .map((r: any) => ({
        primaryPathId: Number(r?.primary_page_id) || 0,
        primaryPathName: String(r?.primary_page_name ?? ''),
        secondaryPathId: Number(r?.secondary_page_id) || 0,
        secondaryPathName: String(r?.secondary_page_name ?? ''),
        primaryIds: Array.isArray(r?.primary_rune_ids) ? r.primary_rune_ids.map(Number) : [],
        primaryNames: Array.isArray(r?.primary_rune_names) ? r.primary_rune_names.map(String) : [],
        secondaryIds: Array.isArray(r?.secondary_rune_ids) ? r.secondary_rune_ids.map(Number) : [],
        secondaryNames: Array.isArray(r?.secondary_rune_names) ? r.secondary_rune_names.map(String) : [],
        shardIds: Array.isArray(r?.stat_mod_ids) ? r.stat_mod_ids.map(Number) : [],
        play: Number(r?.play) || 0,
        winRate: r?.play ? Math.round(((Number(r.win) || 0) / Number(r.play)) * 1000) / 10 : null,
        pickRate: pct(r?.pick_rate),
      }))
      .filter((r: MatchupRunePage) => r.primaryIds.length >= 4 && r.primaryPathId);

    const out: MatchupData = {
      myChampion: championName,
      opponent: opponentName,
      position: pos,
      play: oppRow?.play ?? 0,
      winRate: oppRow ? Math.round(oppRow.myWinRate * 1000) / 10 : null,
      runes,
      spells: (Array.isArray(d.summoner_spells) ? d.summoner_spells : []).map(itemSet),
      coreItems: (Array.isArray(d.core_items) ? d.core_items : []).map(itemSet),
      boots: (Array.isArray(d.boots) ? d.boots : []).map(itemSet),
      starterItems: (Array.isArray(d.starter_items) ? d.starter_items : []).map(itemSet),
      skills: Array.isArray(d.skills?.[0]?.order) ? d.skills[0].order.map(String) : [],
      counters,
      tip: String(d.opponent_champion_tip ?? '').trim(),
      playStyle: String(d.recommended_play_style ?? '').trim(),
    };
    cache.set(cacheKey, { data: out, exp: Date.now() + CACHE_TTL });
    return out;
  } catch (e: any) {
    console.warn('[opgg] matchup failed', championName, 'vs', opponentName, e?.message);
    return null;
  }
}

/**
 * Tabla de counters de un campeón en su línea (winrate propio vs cada rival).
 * No depende del `opponent_champion` que pida el tool, así que se cachea por
 * campeón+posición y sirve para puntuar sugerencias contra el draft enemigo.
 */
export async function getCounterTable(championName: string, position: string): Promise<CounterRow[]> {
  const me = toOPGGChampName(championName);
  const opggPos = POS_MAP[(position || '').toUpperCase()] ?? 'mid';
  const pos = opggPos === 'all' ? 'mid' : opggPos;
  const cacheKey = `counterTable:${me}:${pos}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as CounterRow[];

  const dummy = me === 'AHRI' ? 'SYLAS' : 'AHRI';
  const m = await getMatchup(championName, dummy, pos);
  const out = m?.counters ?? [];
  if (out.length) cache.set(cacheKey, { data: out, exp: Date.now() + CACHE_TTL });
  return out;
}

export const RUNE_PATH_NAMES: Record<number, string> = {
  8000: 'Precisión',
  8100: 'Dominación',
  8200: 'Brujería',
  8300: 'Inspiración',
  8400: 'Valor',
};

// ── Lane meta (sugerencias de pick) ──────────────────────────────────────────
export interface LaneMetaChamp {
  name: string;
  winRate: number; // 0–1
  pickRate: number;
  banRate: number;
  tier: number;
  rank: number;
  kda: number;
}

const LANE_KEY: Record<string, string> = {
  MIDDLE: 'mid', MID: 'mid',
  TOP: 'top',
  JUNGLE: 'jungle', JG: 'jungle',
  BOTTOM: 'adc', BOT: 'adc', ADC: 'adc',
  UTILITY: 'support', SUPPORT: 'support', SUP: 'support',
};
const KEY_LANE: Record<string, string> = {
  mid: 'MIDDLE', top: 'TOP', jungle: 'JUNGLE', adc: 'BOTTOM', support: 'UTILITY',
};

export async function getLaneMeta(position: string): Promise<LaneMetaChamp[]> {
  const key = LANE_KEY[(position || '').toUpperCase()] ?? 'mid';
  const cacheKey = `laneMeta:${key}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as LaneMetaChamp[];

  try {
    const lane = KEY_LANE[key] ?? 'MIDDLE';
    const parsed = await callTool('lol_list_lane_meta_champions', { lane });
    const positions = parsed?.data?.positions ?? {};
    let arr: any[] = Array.isArray(positions[key]) ? positions[key] : [];
    if (!arr.length) {
      for (const k of Object.keys(positions)) {
        if (Array.isArray(positions[k]) && positions[k].length) { arr = positions[k]; break; }
      }
    }
    const meta: LaneMetaChamp[] = arr.slice(0, 20).map((e: any) => ({
      name: String(e?.champion ?? e?.champion_name ?? ''),
      winRate: typeof e?.win_rate === 'number' ? e.win_rate : 0,
      pickRate: typeof e?.pick_rate === 'number' ? e.pick_rate : 0,
      banRate: typeof e?.ban_rate === 'number' ? e.ban_rate : 0,
      tier: typeof e?.tier === 'number' ? e.tier : 5,
      rank: typeof e?.rank === 'number' ? e.rank : 99,
      kda: typeof e?.kda === 'number' ? e.kda : 0,
    })).filter((m) => m.name);
    cache.set(cacheKey, { data: meta, exp: Date.now() + CACHE_TTL });
    return meta;
  } catch (e: any) {
    console.warn('[opgg] lane meta failed', e?.message);
    return [];
  }
}

export interface PickSuggestion {
  name: string;
  winRate: number | null;
  pickRate: number | null;
  tier: number | null;
  reason: string;
  score: number;
  /** Winrate propio contra el rival de línea (0-100), si se pudo calcular. */
  matchupWinRate: number | null;
  /** Rival de línea evaluado ('' si no se conoce). */
  vsRival: string;
  /** Enemigos ya pickeados contra los que gana (>52%). */
  goodInto: string[];
  /** Enemigos ya pickeados contra los que pierde (<48%). */
  badInto: string[];
  /** Huecos de comp que cubre ('AP', 'AD', 'frontline'…). */
  covers: string[];
}

/** map con concurrencia limitada: el MCP no lleva bien 8 llamadas a la vez. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Sugerencias de pick según:
 * - meta de la línea local
 * - roles que faltan en el equipo (AD/AP/Tank/Engage)
 * - no baneados / no pickeados
 */
export async function getPickSuggestions(opts: {
  position: string;
  missingRoles: string[]; // e.g. ['AP','TANK']
  bannedNames: string[];
  pickedNames: string[];
  limit?: number;
  /** tags de DDragon por nombre normalizado; los aporta el main desde el patch. */
  tagsByName?: Record<string, string[]>;
  /** Campeones ya elegidos por el equipo enemigo. */
  enemyNames?: string[];
  /** Rival directo de línea, si se conoce. */
  rivalName?: string;
  /** Consultar matchups reales en OP.GG (más lento, mucho mejor). */
  deep?: boolean;
}): Promise<PickSuggestion[]> {
  const meta = await getLaneMeta(opts.position || 'MIDDLE');
  const banned = new Set(opts.bannedNames.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const picked = new Set(opts.pickedNames.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const missing = new Set(opts.missingRoles.map((r) => r.toUpperCase()));
  const tagsByName = opts.tagsByName || {};

  // OP.GG manda a veces 0–1 y a veces 0–100 en las tasas. Antes se escalaba solo
  // al SALIDA, así que con datos en % el winrate valía ~2000 puntos de score y
  // aplastaba al resto de criterios (el orden era winrate puro).
  const asFraction = (v: number) => (v > 1 ? v / 100 : v);

  /** Roles que cubre un campeón según sus tags de DDragon. */
  const rolesOf = (name: string): Set<string> => {
    const tags = (tagsByName[name.toLowerCase().replace(/[^a-z0-9]/g, '')] || []).map((t) => t.toLowerCase());
    const roles = new Set<string>();
    if (tags.includes('marksman') || tags.includes('fighter') || tags.includes('assassin')) roles.add('AD');
    if (tags.includes('mage')) roles.add('AP');
    if (tags.includes('tank')) roles.add('TANK');
    if (tags.includes('tank') || tags.includes('support') || tags.includes('fighter')) roles.add('ENGAGE');
    if (tags.includes('assassin')) roles.add('ASESINO');
    return roles;
  };

  const out: PickSuggestion[] = [];
  for (const m of meta) {
    const needle = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!needle || banned.has(needle) || picked.has(needle)) continue;
    const wr = asFraction(m.winRate || 0);
    const pr = asFraction(m.pickRate || 0);
    let score = 100 - (m.rank || 50);
    score += wr * 40;
    score += pr * 15;

    // El bonus por rol solo aplica al campeón que REALMENTE cubre el hueco; antes
    // se sumaba a todos por igual (no cambiaba el orden) y la etiqueta "Cubre AP"
    // salía hasta en campeones AD.
    const roles = rolesOf(m.name);
    const covers: string[] = [];
    if (missing.has('AP') && roles.has('AP')) { score += 8; covers.push('AP'); }
    if (missing.has('AD') && roles.has('AD')) { score += 6; covers.push('AD'); }
    if (missing.has('TANK') && roles.has('TANK')) { score += 5; covers.push('frontline'); }
    if (missing.has('ENGAGE') && roles.has('ENGAGE')) { score += 4; covers.push('engage'); }

    const base = `Meta ${opts.position || 'lane'} · T${m.tier}`;
    const reason = covers.length ? `Cubre ${covers.join(' + ')} · ${base}` : base;

    out.push({
      name: m.name,
      winRate: Math.round(wr * 1000) / 10,
      pickRate: Math.round(pr * 1000) / 10,
      tier: m.tier,
      reason,
      score,
      matchupWinRate: null,
      vsRival: '',
      goodInto: [],
      badInto: [],
      covers,
    });
  }

  out.sort((a, b) => b.score - a.score);

  // ── Capa de draft: winrate real contra los campeones enemigos ya elegidos ──
  const enemies = (opts.enemyNames || []).filter(Boolean);
  const rival = (opts.rivalName || '').trim();
  if (!opts.deep || (!enemies.length && !rival)) {
    return out.slice(0, opts.limit ?? 6);
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rivalNeedle = norm(rival);
  const enemyNeedles = new Map(enemies.map((e) => [norm(e), e]));

  // Solo los mejores candidatos del meta: cada uno es una llamada al MCP y la
  // fase de pick dura ~30s. Con caché caliente esto es instantáneo.
  const deepCount = Math.min(out.length, (opts.limit ?? 6) + 4);
  const head = out.slice(0, deepCount);

  await mapPool(head, 6, async (s) => {
    const table = await getCounterTable(s.name, opts.position);
    if (!table.length) return;

    let rivalWr: number | null = null;
    const deltas: number[] = [];
    for (const row of table) {
      const n = norm(row.name);
      if (rivalNeedle && n === rivalNeedle) rivalWr = row.myWinRate;
      if (enemyNeedles.has(n)) {
        deltas.push(row.myWinRate - 0.5);
        if (row.myWinRate >= 0.52) s.goodInto.push(row.name);
        else if (row.myWinRate <= 0.48) s.badInto.push(row.name);
      }
    }

    if (rivalWr != null) {
      s.matchupWinRate = Math.round(rivalWr * 1000) / 10;
      s.vsRival = rival;
      // El duelo de línea manda: ±5% de winrate ≈ ±15 puntos de score.
      s.score += (rivalWr - 0.5) * 300;
    }
    if (deltas.length) {
      // El resto del equipo enemigo pesa, pero mucho menos que tu carril.
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      s.score += avg * 120;
    }

    const bits: string[] = [];
    if (s.matchupWinRate != null) bits.push(`${s.matchupWinRate}% vs ${rival}`);
    if (s.goodInto.length) bits.push(`gana a ${s.goodInto.slice(0, 2).join(', ')}`);
    if (s.covers.length) bits.push(`cubre ${s.covers.join(' + ')}`);
    if (bits.length) s.reason = `${bits.join(' · ')} · T${s.tier}`;
  });

  // Se devuelven solo los analizados: si mezcláramos con la cola del meta,
  // habría cards con winrate del duelo y cards sin él, sin explicación.
  return head.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 6);
}

function champNeedle(name: string): string {
  return (name || '').toLowerCase().replace(/['\s.&]/g, '');
}

function isSameLocalDay(iso: string, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function computeDayForm(matches: RecentMatch[]): DayForm | null {
  const today = matches.filter((m) => isSameLocalDay(m.createdAt) && m.win != null);
  if (!today.length) return null;
  const wins = today.filter((m) => m.win === true).length;
  const losses = today.filter((m) => m.win === false).length;
  const games = wins + losses;
  return {
    wins,
    losses,
    games,
    winRate: games > 0 ? Math.round((wins / games) * 100) : null,
  };
}

/** Historial reciente del invocador (solo sus stats, no el enemigo). */
export async function getSummonerRecentMatches(
  gameName: string,
  tagLine: string,
  region: string,
  limit = 10,
): Promise<RecentMatch[]> {
  const reg = normaliseRegion(region);
  const cacheKey = `matches:${reg}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as RecentMatch[];

  try {
    const result = await callTool('lol_list_summoner_matches', {
      game_name: gameName,
      tag_line: tagLine,
      region: reg,
      limit: Math.min(20, Math.max(5, limit)),
      desired_output_fields: [
        'data.game_history[].id',
        'data.game_history[].created_at',
        'data.game_history[].game_type',
        'data.game_history[].game_length_second',
        'data.game_history[].participants[].champion_id',
        'data.game_history[].participants[].champion_name',
        'data.game_history[].participants[].items',
        'data.game_history[].participants[].stats.result',
        'data.game_history[].participants[].stats.kill',
        'data.game_history[].participants[].stats.death',
        'data.game_history[].participants[].stats.assist',
      ],
    });
    const history: any[] =
      result?.data?.game_history ??
      result?.game_history ??
      (Array.isArray(result) ? result : []) ??
      [];
    const out: RecentMatch[] = (Array.isArray(history) ? history : []).map((g: any) => {
      const p = Array.isArray(g.participants) ? g.participants[0] : null;
      const stats = p?.stats || {};
      const resultRaw = String(stats.result ?? g.result ?? 'UNKNOWN').toUpperCase();
      const win =
        resultRaw === 'WIN' || resultRaw === 'W' ? true
          : resultRaw === 'LOSE' || resultRaw === 'LOSS' || resultRaw === 'L' ? false
            : null;
      const itemsRaw = p?.items ?? [];
      const items = (Array.isArray(itemsRaw) ? itemsRaw : [])
        .map((x: any) => Number(typeof x === 'object' ? x?.id ?? x?.itemId : x) || 0)
        .filter((n: number) => n > 0)
        .slice(0, 7);
      return {
        id: String(g.id ?? ''),
        createdAt: String(g.created_at ?? ''),
        gameType: String(g.game_type ?? ''),
        gameLength: Number(g.game_length_second ?? 0) || 0,
        championId: Number(p?.champion_id ?? 0) || 0,
        championName: String(p?.champion_name ?? ''),
        items,
        kills: Number(stats.kill ?? stats.kills ?? 0) || 0,
        deaths: Number(stats.death ?? stats.deaths ?? 0) || 0,
        assists: Number(stats.assist ?? stats.assists ?? 0) || 0,
        result: resultRaw || 'UNKNOWN',
        win,
      };
    });
    // Cache más corto que el perfil: el form del día cambia rápido.
    cache.set(cacheKey, { data: out, exp: Date.now() + 10 * 60_000 });
    return out;
  } catch (e: any) {
    console.warn('[opgg] recent matches failed', gameName, e?.message);
    return [];
  }
}

export async function buildPlayerCard(
  riotId: string,
  championName: string,
  region: string,
): Promise<PlayerOpggCard> {
  const [gameName, tagLine = ''] = riotId.includes('#')
    ? riotId.split('#')
    : [riotId, ''];
  const base: PlayerOpggCard = {
    riotId,
    gameName,
    tagLine,
    championName,
    rank: null,
    seasonWinRate: null,
    seasonPlay: 0,
    tags: [],
    champStat: null,
    level: null,
    profile_image_url: null,
    recentMatches: [],
    today: null,
  };
  if (!gameName || !tagLine) {
    base.error = 'sin riot id';
    return base;
  }
  const [profile, matches] = await Promise.all([
    getSummonerFullProfile(gameName, tagLine, region),
    getSummonerRecentMatches(gameName, tagLine, region, 10),
  ]);
  base.recentMatches = matches;
  base.today = computeDayForm(matches);

  if (!profile) {
    if (!matches.length) base.error = 'no encontrado';
    return base;
  }
  base.rank = profile.rank;
  base.level = profile.level;
  base.profile_image_url = profile.profile_image_url;
  const plays = (profile.rank.wins || 0) + (profile.rank.losses || 0);
  base.seasonPlay = plays;
  base.seasonWinRate = plays > 0 ? Math.round((profile.rank.wins / plays) * 100) : null;

  const tags: string[] = [];
  if (profile.is_hot_streak) tags.push('RACHA');
  if (profile.is_fresh_blood) tags.push('SANGRE NUEVA');
  if (profile.is_veteran) tags.push('VETERANO');
  if (base.today && base.today.games >= 3 && (base.today.winRate ?? 0) >= 70) tags.push('ON FIRE');
  if (base.today && base.today.games >= 3 && (base.today.winRate ?? 100) <= 30) tags.push('TILT?');

  const needle = champNeedle(championName);
  const cs = profile.champion_stats.find((c) => champNeedle(c.champion_name) === needle);
  if (cs && cs.play > 0) {
    const avg_kills = parseFloat((cs.kill / cs.play).toFixed(1));
    const avg_deaths = parseFloat((cs.death / cs.play).toFixed(1));
    const avg_assists = parseFloat((cs.assist / cs.play).toFixed(1));
    const kda = avg_deaths === 0
      ? 'Perfect'
      : parseFloat(((avg_kills + avg_assists) / avg_deaths).toFixed(2));
    const wr = parseFloat(((cs.win / cs.play) * 100).toFixed(1));
    base.champStat = {
      play: cs.play,
      win: cs.win,
      win_rate: wr,
      avg_kills,
      avg_deaths,
      avg_assists,
      kda,
    };
    if (wr >= 60 && cs.play >= 5) tags.push('MAIN');
    else if (wr >= 55 && cs.play >= 10) tags.push('COMFORT');
    if (cs.play >= 50) tags.push('OTP?');
    if (typeof kda === 'number' && kda >= 3.5) tags.push('KDA ALTO');
  } else if (championName) {
    tags.push('POCAS PARTIDAS');
  }
  base.tags = tags.slice(0, 4);
  return base;
}

/** Fetch OP.GG cards for many players with limited concurrency. */
export async function fetchRosterOpgg(
  players: Array<{ riotId: string; championName: string }>,
  region: string,
  concurrency = 3,
): Promise<PlayerOpggCard[]> {
  const out: PlayerOpggCard[] = new Array(players.length);
  let i = 0;
  async function worker() {
    while (i < players.length) {
      const idx = i++;
      const p = players[idx];
      out[idx] = await buildPlayerCard(p.riotId, p.championName, region);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, players.length) }, () => worker()));
  return out;
}

// ── Augments de ARAM (stats OP.GG por campeón + iconos CommunityDragon) ──────
// Para el overlay tipo Blitz/Porofessor: tier del augment CON tu campeón y
// popularidad de pickeo de la comunidad. OP.GG expone lol_list_aram_augments
// por champion_id; los iconos/rareza salen del JSON de arena de CDragon
// (mismo pool de augments que ARAM).
export interface AugmentBoardEntry {
  id: number;
  name: string;
  desc: string;
  /** Tier OP.GG: 1 = OP … 5 = flojo (0 = sin datos). */
  tier: number;
  /** % de pickeo de la comunidad con este campeón (0-100). */
  pickRate: number;
  /** Score de rendimiento OP.GG (mayor = mejor). */
  performance: number;
  /** 0 = plata, 1 = oro, 2 = prismático. */
  rarity: number;
  icon: string;
}

const CDRAGON_ARENA_JSON = 'https://raw.communitydragon.org/latest/cdragon/arena/es_mx.json';
const CDRAGON_ARENA_FALLBACK = 'https://raw.communitydragon.org/latest/cdragon/arena/en_us.json';
const CDRAGON_GAME_BASE = 'https://raw.communitydragon.org/latest/game/';

type AugMetaEntry = { name: string; desc: string; rarity: number; icon: string };
async function getAugmentMeta(): Promise<{ byId: Record<number, AugMetaEntry>; byName: Record<string, AugMetaEntry> }> {
  const cached = cache.get('augmeta');
  if (cached && cached.exp > Date.now()) return cached.data;
  const byId: Record<number, AugMetaEntry> = {};
  const byName: Record<string, AugMetaEntry> = {};
  for (const url of [CDRAGON_ARENA_JSON, CDRAGON_ARENA_FALLBACK]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const a of (Array.isArray(data?.augments) ? data.augments : [])) {
        const id = Number(a.id);
        if (!id) continue;
        const iconPath = String(a.iconLarge || a.iconSmall || '').toLowerCase();
        const entry: AugMetaEntry = {
          name: String(a.name ?? ''),
          desc: String(a.desc ?? '').replace(/<[^>]+>/g, '').replace(/@[^@]+@/g, '?'),
          rarity: Number(a.rarity) || 0,
          icon: iconPath ? CDRAGON_GAME_BASE + iconPath : '',
        };
        byId[id] = entry;
        byName[entry.name.toLowerCase().replace(/[^a-z0-9]/g, '')] = entry;
      }
      if (Object.keys(byId).length) break;
    } catch { /* siguiente fuente */ }
  }
  // Meta cambia poco: cache largo (24h) aunque venga vacío no reintenta en loop.
  const out = { byId, byName };
  cache.set('augmeta', { data: out, exp: Date.now() + 24 * 3600_000 });
  return out;
}

export async function getAramAugmentBoard(championId: number): Promise<AugmentBoardEntry[]> {
  if (!championId) return [];
  const cacheKey = `aramaug:${championId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.data as AugmentBoardEntry[];

  const [statsRes, meta] = await Promise.all([
    callTool('lol_list_aram_augments', { champion_id: championId }).catch((e) => {
      console.warn('[opgg] aram augments falló:', e?.message);
      return null;
    }),
    getAugmentMeta(),
  ]);
  const augs: any[] = Array.isArray(statsRes?.data?.augments) ? statsRes.data.augments : [];
  const out: AugmentBoardEntry[] = augs
    .map((a: any) => {
      const id = Number(a.id);
      const name = String(a.name ?? '');
      // OP.GG numera los augments de ARAM como cdragonId + 1000 (verificado:
      // 1004→4 Back To Basics, 1116→116 Flashy); los 2xxx son exclusivos de
      // ARAM sin entrada en el JSON de arena → fallback por nombre.
      const m = meta.byId[id - 1000]
        ?? meta.byName[name.toLowerCase().replace(/[^a-z0-9]/g, '')]
        ?? null;
      return {
        id,
        name: name || m?.name || '',
        desc: String(a.desc ?? m?.desc ?? '').replace(/<[^>]+>/g, '').replace(/@[^@]+@/g, '?'),
        tier: Number(a.tier) || 0,
        // `popular` viene como fracción (0.2 = 20% de pickeo).
        pickRate: Math.round((Number(a.popular) || 0) * 1000) / 10,
        performance: Math.round((Number(a.performance) || 0) * 10) / 10,
        rarity: m?.rarity ?? 0,
        icon: m?.icon ?? '',
      };
    })
    .filter((a) => a.id && a.name);
  // Mejor tier primero; a igual tier, más pickeado primero.
  out.sort((x, y) => (x.tier || 9) - (y.tier || 9) || y.pickRate - x.pickRate);
  cache.set(cacheKey, { data: out, exp: Date.now() + CACHE_TTL });
  return out;
}
