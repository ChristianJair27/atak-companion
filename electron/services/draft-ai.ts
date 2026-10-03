// electron/services/draft-ai.ts — "ATAK Coach": análisis del draft con IA.
// Recibe el draft (tu campeón, aliados, enemigos, rival) y devuelve una build
// PERSONALIZADA para ESA partida: runas, items (6 + situacionales con cuándo),
// hechizos, plan de juego y amenazas. La IA no inventa ids: elige entre un
// catálogo de candidatos reales (OP.GG general + matchup + lista situacional
// de DDragon) y todo lo que devuelve se valida contra DDragon.
//
// Proveedores (en orden): Claude (ANTHROPIC_API_KEY) → Ollama local
// (modelo "atak-coach", ver ollama/Modelfile; cae a OLLAMA_MODEL) → backend
// ATAK (/api/ai/draft-coach, Ollama hosteado) → sin IA (build del matchup
// OP.GG con reglas deterministas).
import { getPatchData } from './patch.js';
import { getChampionBuild, getMatchup, RUNE_PATH_NAMES, toOPGGChampName, type OpggGameMode } from './opgg.js';

export interface DraftSide { championName: string; championId?: number; position?: string; tags?: string[] }
export interface DraftRequest {
  me: DraftSide;
  position: string;
  allies: DraftSide[];
  enemies: DraftSide[];
  rival?: string;
  mode?: OpggGameMode;
  /** Fuerza re-análisis aunque haya caché. */
  force?: boolean;
}

export interface DraftAnalysis {
  provider: 'claude' | 'ollama' | 'backend' | 'rules';
  model: string;
  resumen: string;
  plan: string[];
  amenazas: Array<{ champion: string; porQue: string }>;
  runas: { primaryPathId: number; secondaryPathId: number; ids: number[]; shards: number[]; razon: string; source: string };
  items: {
    inicio: number[];
    build: number[];
    situacionales: Array<{ id: number; cuando: string }>;
    razon: string;
  };
  hechizos: number[];
  confianza: number;
  /** Página lista para el cliente (9 runas). */
  runePage: { name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] } | null;
  tookMs: number;
}

// ── Catálogos DDragon (runas con nombre, items comprables de la Grieta) ──────
interface RuneCat { pathById: Record<number, string>; runes: Record<number, { name: string; pathId: number; slot: number }> }
interface ItemCat { byId: Record<number, { name: string; gold: number; tags: string[]; boots: boolean }> }
let runeCat: { ver: string; data: RuneCat } | null = null;
let itemCat: { ver: string; data: ItemCat } | null = null;

const SHARDS: Record<number, string> = {
  5008: 'Fuerza adaptativa', 5005: 'Velocidad de ataque', 5007: 'Celeridad de habilidades',
  5010: 'Velocidad de movimiento', 5001: 'Vida escalable', 5011: 'Vida', 5013: 'Tenacidad',
  5002: 'Armadura', 5003: 'Resistencia mágica',
};

async function getRuneCatalog(version: string): Promise<RuneCat> {
  if (runeCat?.ver === version) return runeCat.data;
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/runesReforged.json`);
  const arr: any[] = res.ok ? ((await res.json()) as any[]) : [];
  const data: RuneCat = { pathById: {}, runes: {} };
  for (const p of arr) {
    data.pathById[Number(p.id)] = String(p.name);
    (p.slots || []).forEach((s: any, si: number) => {
      for (const r of s.runes || []) data.runes[Number(r.id)] = { name: String(r.name), pathId: Number(p.id), slot: si };
    });
  }
  runeCat = { ver: version, data };
  return data;
}

async function getItemCatalog(version: string): Promise<ItemCat> {
  if (itemCat?.ver === version) return itemCat.data;
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/item.json`);
  const j: any = res.ok ? ((await res.json()) as any) : {};
  const data: ItemCat = { byId: {} };
  for (const [k, v] of Object.entries<any>(j?.data || {})) {
    if (!v?.gold?.purchasable || v?.maps?.['11'] === false) continue;
    const tags: string[] = Array.isArray(v.tags) ? v.tags : [];
    data.byId[Number(k)] = { name: String(v.name || ''), gold: Number(v.gold.total) || 0, tags, boots: tags.includes('Boots') };
  }
  itemCat = { ver: version, data };
  return data;
}

// Situacionales de la Grieta por necesidad (ids actuales; se validan contra DDragon
// al construir el catálogo, así que si Riot quita uno simplemente desaparece).
const SITUATIONAL: Array<{ id: number; need: string }> = [
  { id: 3123, need: 'Antisanación AD barato (Verdugo)' }, { id: 3033, need: 'Antisanación AD + penetración' },
  { id: 3165, need: 'Antisanación AP (Morello)' }, { id: 3916, need: 'Antisanación AP barato' },
  { id: 3075, need: 'Tanque anti-autoataques + antisanación' }, { id: 3076, need: 'Anti-autoataques barato' },
  { id: 3157, need: 'Vs asesinos/burst AD (Zhonya)' }, { id: 3102, need: 'Vs burst AP / CC (Banshee)' },
  { id: 3156, need: 'Vs AP para luchador AD (Fauces)' }, { id: 3814, need: 'Vs CC para asesino AD' },
  { id: 3026, need: 'Ángel Guardián' }, { id: 3091, need: 'Vs AP para on-hit' }, { id: 4401, need: 'Vs mucho AP (tanque)' },
  { id: 3143, need: 'Vs críticos (Randuin)' }, { id: 3110, need: 'Vs velocidad de ataque (Corazón de Hielo)' },
  { id: 8020, need: 'Vs AP + escudos (Rookern)' }, { id: 3742, need: 'Tanque con velocidad' }, { id: 3068, need: 'Daño en área tanque' },
  { id: 6665, need: 'Tanque vs daño mixto (Jak\'Sho)' }, { id: 6695, need: 'Vs escudos (Colmillo)' }, { id: 6609, need: 'Antisanación luchador' },
  { id: 3135, need: 'Vs mucha resistencia mágica (Void)' }, { id: 3036, need: 'Vs mucha armadura (Dominik)' }, { id: 3137, need: 'Vs armadura mago' },
  { id: 3139, need: 'Vs CC para ADC (Mercurial)' }, { id: 3111, need: 'Botas vs CC/AP' }, { id: 3047, need: 'Botas vs AD/autoataques' },
  { id: 4645, need: 'Vs escuadrón blando (Sombrallama)' }, { id: 3089, need: 'Más daño AP' }, { id: 3031, need: 'Más daño crítico' },
];

const DMG_TAGS = (tags: string[]) => {
  const t = tags.map((x) => x.toLowerCase());
  const ap = t.includes('mage');
  const ad = t.includes('marksman') || (t.includes('assassin') && !ap) || (t.includes('fighter') && !ap);
  return { ad, ap, tank: t.includes('tank'), cc: t.includes('tank') || t.includes('support') };
};

// ── Proveedores ──────────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.ATAK_CLAUDE_MODEL || 'claude-sonnet-5-5';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434/api/chat').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.ATAK_OLLAMA_MODEL || 'atak-coach';
const OLLAMA_FALLBACK = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const BACKEND = (process.env.ATAK_BACKEND || 'https://atakback.revolution505.com').replace(/\/$/, '');

async function askBackend(system: string, user: string, timeoutMs: number): Promise<{ content: string; model: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND}/api/ai/draft-coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, user }), signal: ctl.signal,
    });
    const j: any = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error || `backend HTTP ${res.status}`);
    return { content: String(j.content || ''), model: String(j.model || 'hosted') };
  } finally { clearTimeout(t); }
}

async function askClaude(system: string, user: string, timeoutMs: number): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1800, system, messages: [{ role: 'user', content: user }] }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
    const j: any = await res.json();
    return (j?.content || []).map((c: any) => c?.text || '').join('');
  } finally { clearTimeout(t); }
}

async function ollamaHasModel(model: string): Promise<boolean> {
  try {
    const res = await fetch(OLLAMA_URL.replace(/\/api\/chat$/, '/api/tags'));
    const j: any = res.ok ? await res.json() : null;
    return (j?.models || []).some((m: any) => String(m?.name || '').split(':')[0] === model.split(':')[0]);
  } catch { return false; }
}

async function askOllama(model: string, system: string, user: string, timeoutMs: number): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model, stream: false, format: 'json', think: false,
        options: { temperature: 0.25, num_ctx: 8192 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const j: any = await res.json();
    return String(j?.message?.content || '');
  } finally { clearTimeout(t); }
}

function extractJson(raw: string): any {
  const s = raw.trim();
  try { return JSON.parse(s); } catch { /* texto alrededor */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* nada */ } }
  return null;
}

// ── Análisis ─────────────────────────────────────────────────────────────────
const cache = new Map<string, { exp: number; data: DraftAnalysis }>();
const TTL = 20 * 60_000;

export const SYSTEM_PROMPT = `Eres ATAK Coach, analista profesional de drafts de League of Legends. Hablas español neutro, directo y concreto (jerga de LoL permitida).
Tu trabajo: dado un draft (campeón del jugador, su rol, aliados, enemigos y rival de línea) y los datos estadísticos de OP.GG, diseñar la build ÓPTIMA PARA ESA PARTIDA CONCRETA, no la build general.
Reglas duras:
- Solo puedes usar ids de runas, items y hechizos que aparezcan en el CATÁLOGO que te dan. Nunca inventes ids.
- Adapta: si el enemigo tiene mucha curación → antisanación temprano; mucho AP → resistencia mágica; mucho AD/críticos → armadura/Zhonya; mucho CC → Mercurial/tenacidad; equipo blando → penetración/burst; etc.
- La build son 6 items en orden de compra (botas incluidas) partiendo del core estadístico de OP.GG y ajustando 1-3 piezas por el draft; explica cada ajuste.
- Las runas parten de la página del matchup (si hay muestra) o de la general; cambia una runa solo con una razón clara ligada al draft.
- Respondes ÚNICAMENTE con un JSON válido con el esquema indicado, sin texto fuera del JSON.`;

export async function analyzeDraft(req: DraftRequest): Promise<DraftAnalysis> {
  const t0 = Date.now();
  const mode: OpggGameMode = req.mode || 'ranked';
  const me = req.me.championName;
  const pos = req.position || 'MIDDLE';
  const enemies = req.enemies.filter((e) => e.championName);
  const allies = req.allies.filter((a) => a.championName && a.championName !== me);
  const key = JSON.stringify([me, pos, allies.map((a) => a.championName), enemies.map((e) => e.championName), req.rival || '', mode]);
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() && !req.force) return hit.data;

  const patch = await getPatchData();
  const [runes, items, build, matchup] = await Promise.all([
    getRuneCatalog(patch.version),
    getItemCatalog(patch.version),
    getChampionBuild(me, pos, mode).catch(() => null),
    req.rival && mode === 'ranked' ? getMatchup(me, req.rival, pos).catch(() => null) : Promise.resolve(null),
  ]);
  const tagsOf = (s: DraftSide): string[] => {
    if (s.tags?.length) return s.tags;
    const id = s.championId || Number(Object.entries(patch.champById).find(([, c]: [string, any]) => c?.name === s.championName)?.[0]);
    return id ? patch.champById[id]?.tags || [] : [];
  };

  // ── Candidatos ────────────────────────────────────────────────────────────
  const mRunes = matchup?.runes?.[0];
  const useMatchup = Boolean(mRunes && mRunes.play >= 20);
  const basePage = useMatchup && mRunes
    ? { primary: mRunes.primaryPathId, secondary: mRunes.secondaryPathId, ids: [...mRunes.primaryIds.slice(0, 4), ...mRunes.secondaryIds.slice(0, 2)], shards: mRunes.shardIds.slice(0, 3), source: `matchup OP.GG (${mRunes.play} partidas)` }
    : build?.rune_ids?.length
      ? { primary: build.primary_path_id, secondary: build.secondary_path_id, ids: build.rune_ids.slice(0, 6), shards: build.rune_ids.slice(6, 9), source: 'página general OP.GG' }
      : null;
  const runeCandidates: Array<{ id: number; name: string; path: string; slot: number }> = [];
  if (basePage) {
    for (const [id, r] of Object.entries(runes.runes)) {
      if (r.pathId === basePage.primary || r.pathId === basePage.secondary) runeCandidates.push({ id: Number(id), name: r.name, path: runes.pathById[r.pathId], slot: r.slot });
    }
  }

  const itemIds = new Set<number>();
  const addItem = (id: number) => { if (id > 0 && items.byId[id]) itemIds.add(id); };
  (build?.starter_ids || []).forEach(addItem);
  (build?.core_item_ids || []).forEach(addItem);
  if (build?.boots_id) addItem(build.boots_id);
  for (const fb of build?.full_builds || []) fb.ids.forEach(addItem);
  for (const list of Object.values(build?.item_options || {})) for (const o of list as any[]) addItem(o.id);
  for (const set of [...(matchup?.coreItems || []), ...(matchup?.boots || []), ...(matchup?.starterItems || [])]) set.ids.forEach(addItem);
  for (const s of SITUATIONAL) addItem(s.id);
  const itemCandidates = [...itemIds].map((id) => ({
    id, name: items.byId[id].name, gold: items.byId[id].gold,
    nota: SITUATIONAL.find((s) => s.id === id)?.need || (build?.core_item_ids?.includes(id) ? 'core OP.GG' : build?.starter_ids?.includes(id) ? 'inicio' : ''),
  }));

  const spellCandidates = [...new Set([...(build?.spell_ids || []), ...(matchup?.spells?.[0]?.ids || []), 4, 14, 12, 11, 7, 3, 21, 6, 1])]
    .map((id) => ({ id, name: ({ 1: 'Purificar', 3: 'Agotar', 4: 'Destello', 6: 'Fantasmal', 7: 'Curar', 11: 'Castigo', 12: 'Teletransportación', 14: 'Ignición', 21: 'Barrera' } as Record<number, string>)[id] || String(id) }));

  const enemyProfile = enemies.map((e) => ({ name: e.championName, tags: tagsOf(e), pos: e.position || '' }));
  const dmg = enemyProfile.reduce((acc, e) => { const d = DMG_TAGS(e.tags); acc.ad += d.ad ? 1 : 0; acc.ap += d.ap ? 1 : 0; acc.tank += d.tank ? 1 : 0; acc.cc += d.cc ? 1 : 0; return acc; }, { ad: 0, ap: 0, tank: 0, cc: 0 });

  // Build base (la más jugada) de la que la IA solo puede desviarse 3 piezas.
  const baseBuild: number[] = (build?.full_builds?.[0]?.ids || [...(build?.core_item_ids || []), build?.boots_id || 0]).filter((id) => id > 0 && items.byId[id]).slice(0, 6);
  const isJungle = pos.toUpperCase() === 'JUNGLE';

  // ── Fallback determinista (sin IA): matchup OP.GG + reglas por comp ───────
  const rulesAnalysis = (): DraftAnalysis => {
    const core = (matchup?.coreItems?.[0]?.ids?.length ? matchup!.coreItems[0].ids : build?.core_item_ids || []).filter((id) => items.byId[id]);
    const boots = (matchup?.boots?.[0]?.ids?.[0] || build?.boots_id || 0);
    const full = build?.full_builds?.[0]?.ids || [];
    const buildIds = [...new Set([...core.slice(0, 3), boots, ...full].filter((id) => id > 0 && items.byId[id]))].slice(0, 6);
    const sitAll: Array<{ id: number; cuando: string }> = [];
    const isAp = DMG_TAGS(tagsOf(req.me)).ap;
    const sit = sitAll; // se filtra contra la build al final
    if (dmg.ap >= 3) sit.push(isAp ? { id: 3102, cuando: 'Si el burst mágico enemigo te mata en una rotación' } : { id: 3156, cuando: 'Tras tu 2º item si el AP enemigo domina' });
    if (dmg.ad >= 3) sit.push(isAp ? { id: 3157, cuando: 'Tras tu 2º item: tres AD enemigos saltarán sobre ti' } : { id: 3026, cuando: 'Si te enfocan primero en peleas' });
    if (dmg.tank >= 2) sit.push(isAp ? { id: 3135, cuando: '3er o 4º item: dos tanques con RM' } : { id: 3036, cuando: '3er o 4º item vs dos tanques' });
    if (dmg.cc >= 3) sit.push({ id: 3111, cuando: 'Botas vs 3+ fuentes de CC' });
    const plan = [
      `Core estadístico: ${core.slice(0, 3).map((id) => items.byId[id]?.name).filter(Boolean).join(' → ')}.`,
      dmg.ap >= 3 ? 'El enemigo es mayormente AP: prioriza resistencia mágica en tu 3er/4º item.' : dmg.ad >= 3 ? 'El enemigo es mayormente AD: armadura o Zhonya tras tu core.' : 'Daño enemigo mixto: termina el core antes de defensivos.',
      dmg.tank >= 2 ? 'Dos o más tanques: penetración porcentual temprano.' : 'Equipo enemigo blando: busca burst y daño plano.',
    ];
    return finish({
      provider: 'rules', model: 'reglas + OP.GG',
      resumen: matchup?.tip ? `Matchup vs ${req.rival}: ${matchup.tip}` : `Build de línea de ${me} en ${pos} ajustada a la comp enemiga (${dmg.ad} AD · ${dmg.ap} AP · ${dmg.tank} tanques).`,
      plan,
      amenazas: enemyProfile.slice(0, 2).map((e) => ({ champion: e.name, porQue: DMG_TAGS(e.tags).ap ? 'Burst mágico' : 'Daño físico' })),
      runas: basePage ? { primaryPathId: basePage.primary, secondaryPathId: basePage.secondary, ids: basePage.ids, shards: basePage.shards, razon: `Página ${basePage.source}.`, source: basePage.source } : { primaryPathId: 0, secondaryPathId: 0, ids: [], shards: [], razon: 'Sin datos de runas', source: 'none' },
      items: { inicio: (build?.starter_ids || []).slice(0, 3), build: buildIds, situacionales: sit.filter((x) => !buildIds.includes(x.id)), razon: 'Build estadística del matchup con defensivos según la comp enemiga.' },
      hechizos: (matchup?.spells?.[0]?.ids?.length ? matchup!.spells[0].ids : build?.spell_ids || [4, 14]).slice(0, 2),
      confianza: 0.5,
    });
  };

  const finish = (a: Omit<DraftAnalysis, 'runePage' | 'tookMs'>): DraftAnalysis => {
    const perks = [...a.runas.ids.slice(0, 6), ...a.runas.shards.slice(0, 3)];
    const out: DraftAnalysis = {
      ...a,
      runePage: perks.length === 9 && a.runas.primaryPathId && a.runas.secondaryPathId
        ? { name: `ATAK IA ${me}${req.rival ? ` vs ${req.rival}` : ''}`.slice(0, 24), primaryStyleId: a.runas.primaryPathId, subStyleId: a.runas.secondaryPathId, selectedPerkIds: perks }
        : null,
      tookMs: Date.now() - t0,
    };
    cache.set(key, { exp: Date.now() + TTL, data: out });
    return out;
  };

  if (!basePage && !build) return rulesAnalysis();

  // ── Prompt ────────────────────────────────────────────────────────────────
  const user = `PARCHE ${patch.version} · MODO ${mode}
JUGADOR: ${me} (${pos}) · clases: ${tagsOf(req.me).join('/') || '?'}
ALIADOS: ${allies.map((a) => `${a.championName}${a.position ? ` (${a.position})` : ''} [${tagsOf(a).join('/')}]`).join(', ') || 'aún sin picks'}
ENEMIGOS: ${enemyProfile.map((e) => `${e.name}${e.pos ? ` (${e.pos})` : ''} [${e.tags.join('/')}]`).join(', ') || 'aún sin picks'}
RIVAL DE LÍNEA: ${req.rival || 'desconocido'}${matchup ? ` · WR propio en el duelo ${matchup.winRate ?? '?'}% en ${matchup.play} partidas · estilo ${matchup.playStyle || '?'}${matchup.tip ? ` · tip OP.GG (EN): ${matchup.tip}` : ''}` : ''}
PERFIL DE DAÑO ENEMIGO: ${dmg.ad} AD · ${dmg.ap} AP · ${dmg.tank} tanques · ${dmg.cc} con CC/engage

DATOS OP.GG DE ${me.toUpperCase()}: WR ${build?.win_rate ?? '?'}% · pick ${build?.pick_rate ?? '?'}% · tier ${build?.tier ?? '?'}
Core estadístico: ${(build?.core_item_ids || []).map((id) => `${items.byId[id]?.name || id}#${id}`).join(' → ')} · botas ${build?.boots_id ? `${items.byId[build.boots_id]?.name}#${build.boots_id}` : '?'}
BUILD BASE (parte de aquí; cambia máximo 3 piezas): ${baseBuild.map((id) => `${items.byId[id]?.name}#${id}`).join(' → ') || 'n/d'}
Builds completas más jugadas: ${(build?.full_builds || []).map((b) => `${b.label}: ${b.ids.map((id) => `${items.byId[id]?.name || id}#${id}`).join(' → ')} (${b.pickRate ?? '?'}% pick, ${b.winRate ?? '?'}% WR)`).join(' | ') || 'n/d'}
${matchup?.coreItems?.[0]?.ids?.length ? `Core del MATCHUP vs ${req.rival}: ${matchup.coreItems[0].ids.map((id) => `${items.byId[id]?.name || id}#${id}`).join(' → ')} (${matchup.coreItems[0].play} partidas)` : ''}
Página de runas base (${basePage?.source}): ${basePage ? `${runes.pathById[basePage.primary]} + ${runes.pathById[basePage.secondary]} · ${basePage.ids.map((id) => `${runes.runes[id]?.name || id}#${id}`).join(', ')} · fragmentos ${basePage.shards.map((id) => `${SHARDS[id] || id}#${id}`).join(', ')}` : 'n/d'}

CATÁLOGO DE RUNAS (id · nombre · rama · fila): ${runeCandidates.map((r) => `${r.id}·${r.name}·${r.path}·${r.slot}`).join('; ')}
FRAGMENTOS: ${Object.entries(SHARDS).map(([id, n]) => `${id}·${n}`).join('; ')} (fila1: 5008/5005/5007 · fila2: 5008/5010/5001 · fila3: 5011/5013/5001)
CATÁLOGO DE ITEMS (id · nombre · oro · nota): ${itemCandidates.map((i) => `${i.id}·${i.name}·${i.gold}${i.nota ? `·${i.nota}` : ''}`).join('; ')}
HECHIZOS: ${spellCandidates.map((s) => `${s.id}·${s.name}`).join('; ')}

Devuelve SOLO este JSON:
{"resumen":"2 frases sobre cómo se juega ESTA partida","plan":["3 a 5 puntos concretos de plan de juego por fases"],"amenazas":[{"champion":"nombre","porQue":"1 frase"}],
"runas":{"primaryPathId":${basePage?.primary ?? 0},"secondaryPathId":${basePage?.secondary ?? 0},"ids":[6 ids: keystone + 3 primarias + 2 secundarias],"shards":[3 ids de fragmentos],"razon":"qué cambiaste respecto a la base y por qué (o 'sin cambios')"},
"items":{"inicio":[ids de inicio],"build":[6 ids en orden de compra incluyendo botas],"situacionales":[{"id":123,"cuando":"condición concreta"}],"razon":"ajustes respecto al core OP.GG y por qué"},
"hechizos":[2 ids],"confianza":0.0-1.0}`;

  // ── Proveedor ─────────────────────────────────────────────────────────────
  let raw = ''; let provider: DraftAnalysis['provider'] = 'rules'; let model = '';
  const tryProvider = async (name: DraftAnalysis['provider'], fn: () => Promise<{ content: string; model: string }>) => {
    try {
      const r = await fn();
      if (r.content.trim()) { raw = r.content; provider = name; model = r.model; return true; }
    } catch (e: any) { console.warn(`[draft-ai] ${name} falló:`, e?.message); }
    return false;
  };
  const hasLocalOllama = !ANTHROPIC_KEY && (await ollamaHasModel(OLLAMA_MODEL).catch(() => false) || await ollamaHasModel(OLLAMA_FALLBACK).catch(() => false));
  const done =
    (ANTHROPIC_KEY && await tryProvider('claude', async () => ({ content: await askClaude(SYSTEM_PROMPT, user, 45_000), model: CLAUDE_MODEL })))
    || (hasLocalOllama && await tryProvider('ollama', async () => {
      const m = (await ollamaHasModel(OLLAMA_MODEL)) ? OLLAMA_MODEL : OLLAMA_FALLBACK;
      return { content: await askOllama(m, SYSTEM_PROMPT, user, 90_000), model: m };
    }))
    || await tryProvider('backend', () => askBackend(SYSTEM_PROMPT, user, 120_000));
  if (!done) return rulesAnalysis();

  const j = extractJson(raw);
  if (!j) { console.warn('[draft-ai] respuesta no JSON'); return rulesAnalysis(); }

  // ── Validación contra catálogos ───────────────────────────────────────────
  const validItem = (v: any) => { const id = Number(v); return items.byId[id] ? id : 0; };
  const validRune = (v: any) => { const id = Number(v); return runes.runes[id] ? id : 0; };
  const validShard = (v: any) => { const id = Number(v); return SHARDS[id] ? id : 0; };
  const rr = j.runas || {};
  let runeIds: number[] = (Array.isArray(rr.ids) ? rr.ids : []).map(validRune).filter(Boolean);
  let shards: number[] = (Array.isArray(rr.shards) ? rr.shards : []).map(validShard).filter(Boolean);
  const validPath = (v: any) => { const id = Number(v); return runes.pathById[id] ? id : 0; };
  const primary = validPath(rr.primaryPathId) || basePage?.primary || 0;
  const secondary = validPath(rr.secondaryPathId) || basePage?.secondary || 0;
  // Estructura de página: keystone (fila 0) + 3 primarias (filas 1-3) + 2 secundarias (filas distintas, no keystone).
  const okPage = runeIds.length === 6
    && runeIds.slice(0, 4).every((id, i) => runes.runes[id].pathId === primary && runes.runes[id].slot === i)
    && runeIds.slice(4).every((id) => runes.runes[id].pathId === secondary && runes.runes[id].slot > 0)
    && runes.runes[runeIds[4]].slot !== runes.runes[runeIds[5]].slot;
  if (!okPage && basePage) { runeIds = basePage.ids; shards = basePage.shards; }
  if (shards.length !== 3) shards = basePage?.shards?.length === 3 ? basePage.shards : [5008, 5008, 5001];

  const it = j.items || {};
  let buildIds: number[] = [...new Set((Array.isArray(it.build) ? it.build : []).map(validItem).filter(Boolean) as number[])];
  // Una sola bota: la primera que proponga (o la base).
  const bootsIn = buildIds.filter((id) => items.byId[id]?.boots);
  if (bootsIn.length > 1) buildIds = buildIds.filter((id) => !items.byId[id]?.boots || id === bootsIn[0]);
  // Máximo 3 piezas distintas de la base: si se desvía más, la IA alucinó → base.
  const overlap = buildIds.filter((id) => baseBuild.includes(id)).length;
  const buildTrusted = buildIds.length >= 5 && (baseBuild.length < 4 || overlap >= baseBuild.length - 3);
  if (!buildTrusted) buildIds = [...baseBuild];
  if (!buildIds.some((id) => items.byId[id]?.boots) && build?.boots_id && items.byId[build.boots_id]) buildIds.splice(Math.min(1, buildIds.length), 0, build.boots_id);
  buildIds = buildIds.slice(0, 6);
  const inicio = (Array.isArray(it.inicio) ? it.inicio : []).map(validItem).filter(Boolean).slice(0, 3);
  const situ = (Array.isArray(it.situacionales) ? it.situacionales : [])
    .map((s: any) => ({ id: validItem(s?.id), cuando: String(s?.cuando || '').slice(0, 140) }))
    .filter((s: any) => s.id && !buildIds.includes(s.id)).slice(0, 4);
  // Castigo solo en jungla; dos hechizos distintos.
  const spells: number[] = [...new Set<number>((Array.isArray(j.hechizos) ? j.hechizos : []).map(Number))]
    .filter((id: number) => spellCandidates.some((s) => s.id === id) && (id !== 11 || isJungle)).slice(0, 2);

  return finish({
    provider, model,
    resumen: String(j.resumen || '').slice(0, 400) || `Build de ${me} ajustada al draft.`,
    plan: (Array.isArray(j.plan) ? j.plan : []).map((p: any) => String(p).slice(0, 220)).filter(Boolean).slice(0, 5),
    amenazas: (Array.isArray(j.amenazas) ? j.amenazas : []).map((a: any) => ({ champion: String(a?.champion || ''), porQue: String(a?.porQue || a?.por_que || '').slice(0, 160) })).filter((a: any) => a.champion).slice(0, 3),
    runas: { primaryPathId: primary, secondaryPathId: secondary, ids: runeIds, shards, razon: String(rr.razon || '').slice(0, 300), source: okPage ? `IA sobre ${basePage?.source || 'OP.GG'}` : basePage?.source || 'OP.GG' },
    items: { inicio: inicio.length ? inicio : (build?.starter_ids || []).slice(0, 3), build: buildIds, situacionales: situ.filter((x: any) => !buildIds.includes(x.id)), razon: buildTrusted ? String(it.razon || '').slice(0, 300) : `La IA se alejó demasiado del core estadístico; se mantiene la build más jugada. ${String(it.razon || '').slice(0, 200)}` },
    // Hechizos: la IA solo puede elegir entre los que OP.GG ve en el matchup/línea.
    hechizos: (() => {
      const stat = [...new Set([...(matchup?.spells?.[0]?.ids || []), ...(build?.spell_ids || [])])];
      const ok = spells.length === 2 && spells.every((id) => stat.includes(id));
      return ok ? spells : (matchup?.spells?.[0]?.ids?.length ? matchup!.spells[0].ids : build?.spell_ids || [4, 14]).slice(0, 2);
    })(),
    confianza: Math.max(0, Math.min(1, Number(j.confianza) || 0.6)),
  });
}

/** Nombres legibles para la UI (items/runas) sin otra llamada a DDragon. */
export async function draftAiNames(version?: string): Promise<{ items: Record<number, string>; runes: Record<number, string> }> {
  const ver = version || (await getPatchData()).version;
  const [r, i] = await Promise.all([getRuneCatalog(ver), getItemCatalog(ver)]);
  return {
    items: Object.fromEntries(Object.entries(i.byId).map(([k, v]) => [k, v.name])),
    runes: { ...Object.fromEntries(Object.entries(r.runes).map(([k, v]) => [k, v.name])), ...SHARDS },
  };
}

export { toOPGGChampName as _toOPGG, RUNE_PATH_NAMES as _RUNE_PATHS };
