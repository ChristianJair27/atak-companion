// window.atak simulado para la vista previa en navegador (ver vite.preview.config.ts).
// Datos inventados SOLO para preview; la app real recibe todo del LCU / Live Client.
const noop = () => () => {};
const DD = 'https://ddragon.leagueoflegends.com';

async function patchData() {
  const version = (await (await fetch(`${DD}/api/versions.json`)).json())[0];
  const champs = (await (await fetch(`${DD}/cdn/${version}/data/es_MX/champion.json`)).json()).data;
  const champById: Record<number, any> = {};
  for (const c of Object.values<any>(champs)) champById[Number(c.key)] = { id: c.id, name: c.name, tags: c.tags };
  return { version, champById, runeIconById: {} };
}

const P = (
  name: string, tag: string, championId: number, pos: string, k: number, d: number, a: number,
  items: number[], dmg: number, gold: number, cs: number, vis: number, perks: number[], extra: any = {},
) => ({
  riotIdGameName: name, riotIdTagLine: tag, puuid: `puuid-${name}`, championId, position: pos,
  stats: {
    CHAMPIONS_KILLED: k, NUM_DEATHS: d, ASSISTS: a,
    ...Object.fromEntries(items.map((id, i) => [`ITEM${i}`, id])),
    TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: dmg, GOLD_EARNED: gold, MINIONS_KILLED: cs, NEUTRAL_MINIONS_KILLED: 0,
    VISION_SCORE: vis, LEVEL: 16,
    ...Object.fromEntries(perks.map((id, i) => [`PERK${i}`, id])),
    PERK_PRIMARY_STYLE: 8100, PERK_SUB_STYLE: 8000, ...extra,
  },
});

const me = P('Christian', 'LAN', 55, 'MIDDLE', 12, 4, 9, [3157, 3089, 4645, 3020, 3135, 3165, 3364], 31200, 14900, 212, 31,
  [8112, 8143, 8138, 8135, 9111, 8014], { LARGEST_MULTI_KILL: 3, FIRST_BLOOD: 1 });

const eog = {
  gameMode: 'CLASSIC', gameLength: 1640, localPlayer: me,
  teams: [
    { isPlayerTeam: true, isWinningTeam: true, players: [
      P('TopDiff', 'LAN', 266, 'TOP', 5, 3, 7, [6692, 3071, 3047, 3053, 0, 0, 3340], 19600, 11800, 201, 18, [8010, 9111, 9104, 8299, 8444, 8451]),
      P('SelvaRey', 'LAN', 64, 'JUNGLE', 8, 5, 14, [6692, 3142, 3158, 3071, 0, 0, 3364], 17400, 12100, 164, 44, [8010, 9111, 9105, 8014, 8143, 8135]),
      me,
      P('LingLing', 'LAN', 222, 'BOTTOM', 9, 6, 8, [3031, 3094, 3006, 3036, 3072, 0, 3363], 28800, 13600, 236, 22, [8008, 9111, 9104, 8014, 8139, 8135]),
      P('WardBot', 'LAN', 412, 'UTILITY', 1, 5, 24, [3190, 3109, 3117, 3050, 0, 0, 3364], 6100, 8200, 28, 71, [8439, 8463, 8444, 8242, 8345, 8347], { TURRET_KILLS: 0 }),
    ] },
    { isPlayerTeam: false, isWinningTeam: false, players: [
      P('Garenteed', 'NA1', 86, 'TOP', 4, 7, 3, [3078, 3071, 3047, 0, 0, 0, 3340], 15200, 10400, 188, 14, [8010, 9111, 9104, 8299, 8444, 8451]),
      P('NoSmite', 'LAN', 121, 'JUNGLE', 7, 8, 5, [6693, 3142, 3158, 0, 0, 0, 3364], 16800, 10900, 141, 29, [8112, 8143, 8138, 8135, 9111, 8014]),
      P('MidOrFeed', 'LAN', 238, 'MIDDLE', 6, 9, 4, [6692, 3142, 3158, 3814, 0, 0, 3364], 21900, 11200, 197, 12, [8112, 8143, 8138, 8135, 9111, 8014]),
      P('Kiting', 'LAN', 51, 'BOTTOM', 5, 6, 6, [3031, 3094, 3006, 3036, 0, 0, 3363], 20100, 11600, 219, 17, [8021, 9111, 9104, 8014, 8139, 8135]),
      P('HookCity', 'LAN', 53, 'UTILITY', 1, 5, 13, [3190, 3109, 3117, 0, 0, 0, 3364], 5200, 7100, 31, 58, [8439, 8463, 8444, 8242, 8345, 8347]),
    ] },
  ],
  _ranked: { after: { tier: 'EMERALD', division: 'II', lp: 64, queue: 'RANKED_SOLO_5x5' }, lpDelta: 18 },
  _ranks: Object.fromEntries([
    ['TopDiff', 'GOLD', 'I', 72], ['SelvaRey', 'PLATINUM', 'IV', 10], ['Christian', 'EMERALD', 'II', 64], ['LingLing', 'DIAMOND', 'IV', 3], ['WardBot', 'SILVER', 'I', 55],
    ['Garenteed', 'PLATINUM', 'II', 40], ['NoSmite', 'EMERALD', 'IV', 21], ['MidOrFeed', 'PLATINUM', 'I', 88], ['Kiting', 'EMERALD', 'III', 12],
  ].map(([n, tier, division, lp]) => [`puuid-${n}`, { queue: 'RANKED_SOLO_5x5', tier, division, lp, wins: 60, losses: 50 }])),
  _meSkinId: 4,
  _liveEvents: [
    { EventName: 'GameStart', EventTime: 0 },
    { EventName: 'MinionsSpawning', EventTime: 65 },
    { EventName: 'FirstBlood', EventTime: 182, Recipient: 'Christian' },
    { EventName: 'ChampionKill', EventTime: 182, KillerName: 'Christian', VictimName: 'MidOrFeed', Assisters: ['SelvaRey'] },
    { EventName: 'DragonKill', EventTime: 412, KillerName: 'SelvaRey', DragonType: 'Fire', Stolen: 'False' },
    { EventName: 'FirstBrick', EventTime: 731, KillerName: 'LingLing' },
    { EventName: 'HeraldKill', EventTime: 865, KillerName: 'NoSmite' },
    { EventName: 'Multikill', EventTime: 1102, KillerName: 'Christian', KillStreak: 3 },
    { EventName: 'BaronKill', EventTime: 1421, KillerName: 'SelvaRey' },
    { EventName: 'InhibKilled', EventTime: 1560, KillerName: 'TopDiff' },
    { EventName: 'GameEnd', EventTime: 1640 },
  ],
};

// Partida viva simulada (HUD / scoreboard): el reloj avanza y cae una kill cada ~6s.
const livePlayers = [
  ['TopDiff', 'Aatrox', 'ORDER', 'TOP'], ['SelvaRey', 'Lee Sin', 'ORDER', 'JUNGLE'], ['Christian', 'Katarina', 'ORDER', 'MIDDLE'],
  ['LingLing', 'Jinx', 'ORDER', 'BOTTOM'], ['WardBot', 'Thresh', 'ORDER', 'UTILITY'],
  ['Garenteed', 'Garen', 'CHAOS', 'TOP'], ['NoSmite', 'Kayn', 'CHAOS', 'JUNGLE'], ['MidOrFeed', 'Zed', 'CHAOS', 'MIDDLE'],
  ['Kiting', 'Caitlyn', 'CHAOS', 'BOTTOM'], ['HookCity', 'Nautilus', 'CHAOS', 'UTILITY'],
].map(([name, championName, team, position], i) => ({
  name, riotId: `${name}#LAN`, championName, team, position, isMe: i === 2,
  kills: i % 4, deaths: (i * 3) % 5, assists: i + 1, level: 9, creepScore: 80 + i * 7, wardScore: 6 + i,
  isDead: false, respawnTimer: 0,
  // El jugador local lleva starter + primer core (el HUD muestra el siguiente core).
  items: i === 2 ? [1056, 3157, 1058] : [],
}));
function onLive(fn: (p: any) => void) {
  let t = 600;
  const tick = () => {
    t += 1;
    const me = livePlayers[2];
    if (t % 6 === 0) { me.kills += 1; livePlayers[7].deaths += 1; livePlayers[7].isDead = true; livePlayers[7].respawnTimer = 4; }
    if (t % 6 === 4) livePlayers[7].isDead = false;
    fn({
      state: {
        isActive: true, gameTime: t, gameMode: 'CLASSIC', players: livePlayers.map((p) => ({ ...p })),
        me: {
          championName: me.championName, level: me.level, kills: me.kills, deaths: me.deaths, assists: me.assists,
          creepScore: me.creepScore + Math.floor((t - 600) / 2), gold: 1500 + (t - 600) * 12, visionScore: 14, killParticipation: 58,
          championStats: { hp: 900 + ((t * 137) % 600), maxHp: 1640, resource: 0, maxResource: 0, ad: 96, ap: 212, armor: 71, mr: 44 },
        },
      },
      objectives: { dragon: { nextAt: 720, alive: false }, herald: { nextAt: 840, alive: false }, baron: { nextAt: 1200, alive: false } },
    });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

// Champ select simulado: planeación → bans → picks → final, con hovers/picks
// que van cayendo y el jugador local (celda 2) eligiendo a Katarina.
function onChampSelect(fn: (p: any) => void) {
  const slot = (cellId: number, isLocal = false) => ({ cellId, championId: 0, championName: '', position: '', tags: [], isLocal, acting: false });
  const team = [slot(0), slot(1), slot(2, true), slot(3), slot(4)];
  const enemy = [slot(5), slot(6), slot(7), slot(8), slot(9)];
  const bans = { ally: [] as string[], enemy: [] as string[] };
  const picks: Array<[number, string, string[]]> = [
    [5, 'Garen', ['Fighter', 'Tank']], [0, 'Aatrox', ['Fighter', 'Tank']], [2, 'Katarina', ['Assassin', 'Mage']],
    [6, 'Kayn', ['Fighter', 'Assassin']], [1, 'Lee Sin', ['Fighter', 'Assassin']], [7, 'Zed', ['Assassin']],
    [8, 'Caitlyn', ['Marksman']], [3, 'Jinx', ['Marksman']], [4, 'Thresh', ['Support', 'Fighter']], [9, 'Nautilus', ['Tank', 'Support']],
  ];
  const banList = ['Yasuo', 'Zed', 'Shaco', 'Teemo', 'Yone', 'Blitzcrank'];
  let t = 0;
  let phase = 'PLANNING'; let actionType = ''; let timer = 20;
  const tick = () => {
    t += 1; timer = Math.max(0, timer - 1);
    if (t === 4) { phase = 'BAN_PICK'; actionType = 'ban'; timer = 30; }
    if (t >= 5 && t < 11 && t % 1 === 0 && banList.length) { const b = banList.shift()!; (bans.ally.length <= bans.enemy.length ? bans.ally : bans.enemy).push(b); }
    if (t === 12) { phase = 'BAN_PICK'; actionType = 'pick'; timer = 30; }
    if (t >= 13 && (t - 13) % 2 === 0 && picks.length) {
      const [cell, champ, tags] = picks.shift()!;
      const s = [...team, ...enemy].find((x) => x.cellId === cell)!;
      s.championName = champ; s.championId = 1; s.tags = tags;
      s.position = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][cell % 5];
      if (cell < 5) {
        Object.assign(s, {
          summonerName: ['TopDiff', 'SelvaRey', 'Christian', 'LingLing', 'WardBot'][cell],
          spells: [4, [12, 11, 14, 7, 3][cell]],
          rank: { queue: 'RANKED_SOLO_5x5', tier: ['GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'SILVER'][cell], division: 'II', lp: 40 + cell * 11, wins: 50, losses: 40 },
          mastery: { level: 7, points: 120000 + cell * 90000 },
        });
      }
      if (s.isLocal) setTimeout(() => buildFn?.({
        name: 'Katarina', tags: ['Assassin'], winRate: 51.2, pickRate: 8.4, banRate: 12.1, source: 'opgg',
        runes: { primaryPath: 'Dominación', secondaryPath: 'Brujería', primaryPathId: 8100, secondaryPathId: 8200, keystone: { id: 8112 }, primary: [{ id: 8143 }, { id: 8138 }, { id: 8135 }], secondary: [{ id: 8210 }, { id: 8237 }], shards: [{ id: 5008 }, { id: 5008 }, { id: 5001 }], rune_ids: [8112, 8143, 8138, 8135, 8210, 8237, 5008, 5008, 5001] },
        items: { starter: [1056, 2003], core: [3157, 4645, 3089], boots: [3020] },
        fullBuilds: [
          { label: 'Más jugada', ids: [3020, 3157, 4645, 3089, 3135, 4646], names: [], pickRate: 55, winRate: 53.1, play: 62401 },
          { label: 'Build 2', ids: [3020, 3157, 4645, 3100, 3089, 3102], names: [], pickRate: 31, winRate: 52.4, play: 34802 },
          { label: 'Build 3', ids: [3020, 3157, 4645, 1082, 6333, 3135], names: [], pickRate: 13, winRate: 50.2, play: 4606 },
        ],
        itemOptions: {
          fourth: [{ id: 3089, name: 'Rabadon', pickRate: 55, winRate: 53 }, { id: 3100, name: 'Lich Bane', pickRate: 31, winRate: 52 }, { id: 1082, name: 'Dark Seal', pickRate: 13, winRate: 50 }],
          fifth: [{ id: 3135, name: 'Void Staff', pickRate: 25, winRate: 58 }, { id: 3157, name: 'Zhonya', pickRate: 22, winRate: 60 }, { id: 6333, name: 'Death Dance', pickRate: 13, winRate: 62 }],
          sixth: [{ id: 4646, name: 'Stormsurge', pickRate: 22, winRate: 55 }, { id: 3102, name: 'Banshee', pickRate: 16, winRate: 63 }],
          last: [],
        },
        spells: [4, 14],
        skillOrder: ['Q', 'E', 'W', 'Q', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W', 'R', 'W', 'W'],
        matchup: { rival: 'Zed', play: 1240, winRate: 48.2, runesPlay: 410, runesWinRate: 51.3, tip: 'Respect his level 6 all-in; hold your E to dodge the shuriken combo.', playStyle: '', source: 'matchup', spells: { ids: [4, 14], names: ['Flash', 'Ignite'] } },
        counters: { strongAgainst: [{ name: 'Ahri', winRate: 54.1 }, { name: 'Viktor', winRate: 52.8 }], weakAgainst: [{ name: 'Zed', winRate: 53.2 }, { name: 'Galio', winRate: 55.9 }] },
        tips: ['Entra cuando el rival gaste su escape', 'Busca peleas en el río después de la primera botas'],
        runePage: { name: 'ATAK Katarina', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8143, 8138, 8135, 8210, 8237, 5008, 5008, 5001] },
      }), 400);
    }
    const next = picks[0]?.[0];
    for (const s of [...team, ...enemy]) s.acting = phase === 'BAN_PICK' && actionType === 'pick' && s.cellId === next;
    if (t === 34) { phase = 'FINALIZATION'; actionType = ''; timer = 10; }
    fn({ phase, actionType, timerSecs: timer, team: team.map((x) => ({ ...x })), enemy: enemy.map((x) => ({ ...x })), bans: { ally: [...bans.ally], enemy: [...bans.enemy] }, localPlayerPosition: 'MIDDLE' });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}
let buildFn: ((p: any) => void) | null = null;

// Oferta de augments simulada (vista augbadges): 3 cards en el centro.
function onAugOffers(fn: (p: any) => void) {
  const t = setTimeout(() => fn({
    championName: 'Katarina',
    matches: [
      { slot: 0, x: 0.316, y: 0.15, augment: { id: 1045, name: 'Infernal Conduit', tier: 5, pickRate: 0, performance: 56.7, rarity: 1 } },
      { slot: 1, x: 0.5, y: 0.15, augment: { id: 1103, name: 'Bread And Butter', tier: 3, pickRate: 37, performance: 70.7, rarity: 0 } },
      { slot: 2, x: 0.684, y: 0.15, augment: { id: 1349, name: 'Ultimate Awakening', tier: 3, pickRate: 28, performance: 72.3, rarity: 2 } },
    ],
  }), 500);
  return () => clearTimeout(t);
}

// Roster OP.GG simulado (vista players): los 10 de `livePlayers` con rango/WR/form
// inventados + build meta de Katarina (misma forma que 'opgg-roster' en main.ts).
const RANKS: Array<[string, number, number, number, number]> = [
  ['EMERALD', 2, 64, 120, 100], ['DIAMOND', 4, 12, 210, 180], ['EMERALD', 2, 64, 140, 110], ['PLATINUM', 1, 88, 90, 95], ['GOLD', 1, 40, 60, 70],
  ['PLATINUM', 3, 20, 75, 80], ['EMERALD', 4, 5, 160, 150], ['DIAMOND', 2, 70, 300, 240], ['PLATINUM', 2, 55, 50, 60], ['SILVER', 1, 90, 30, 45],
];
const CHAMP_IDS: Record<string, number> = { Aatrox: 266, 'Lee Sin': 64, Katarina: 55, Jinx: 222, Thresh: 412, Garen: 86, Kayn: 141, Zed: 238, Caitlyn: 51, Nautilus: 111 };
const SPELLS: Array<[number, number]> = [[4, 12], [4, 11], [4, 14], [4, 7], [4, 14], [4, 12], [4, 11], [4, 14], [4, 7], [4, 14]];
const KEYSTONES = [8010, 8010, 8112, 8008, 8439, 8010, 8112, 8112, 8021, 8439];
async function opggRoster() {
  await new Promise((r) => setTimeout(r, 700));
  const players = livePlayers.map((p, i) => {
    const [tier, division, lp, wins, losses] = RANKS[i];
    const play = 12 + i * 3;
    const win = Math.round(play * (0.42 + ((i * 7) % 10) / 40));
    const wr = Math.round((wins / (wins + losses)) * 100);
    const recentMatches = Array.from({ length: 10 }, (_, j) => {
      const won = ((i + j) * 5) % 3 !== 0;
      return {
        id: `m-${i}-${j}`, createdAt: new Date(Date.now() - j * 3600e3).toISOString(), gameType: j % 4 === 3 ? 'FLEXRANKED' : 'SOLORANKED',
        gameLength: 1500 + ((i + j) * 97) % 900, championId: CHAMP_IDS[p.championName] || 0, championName: j % 3 === 0 ? p.championName : ['Ahri', 'Yasuo', 'Lux'][j % 3],
        items: [3157, 3089, 4645, 3020, 3135, 0], kills: (i + j) % 9, deaths: (j * 2) % 6, assists: (i * j) % 12, result: won ? 'WIN' : 'LOSE', win: won,
      };
    });
    const todayGames = recentMatches.slice(0, 4);
    const tw = todayGames.filter((m) => m.win).length;
    return {
      ...p, items: [3157, 3089, 4645, 3020, 0, 0], spell1: SPELLS[i][0], spell2: SPELLS[i][1], keystoneId: KEYSTONES[i],
      primaryRuneTree: Math.floor(KEYSTONES[i] / 100) * 100, secondaryRuneTree: 8000,
      opgg: {
        rank: i === 9 ? null : { tier, division, lp, wins, losses, tier_image_url: null },
        seasonWinRate: i === 9 ? null : wr, seasonPlay: wins + losses,
        tags: i === 2 ? ['RACHA', 'MAIN'] : i === 7 ? ['OTP?', 'KDA ALTO'] : i === 9 ? ['TILT?'] : i % 3 === 0 ? ['VETERANO'] : [],
        champStat: i === 9 ? null : { play, win, win_rate: Math.round((win / play) * 1000) / 10, avg_kills: 6.2, avg_deaths: 4.1, avg_assists: 7.3, kda: 3.29 },
        recentMatches, today: { wins: tw, losses: 4 - tw, games: 4, winRate: Math.round((tw / 4) * 100) },
        error: i === 9 ? 'no encontrado' : undefined,
      },
    };
  });
  return {
    ok: true, region: 'LA1', gameTime: 600, gameMode: 'CLASSIC', players,
    meChampion: 'Katarina', mePosition: 'MIDDLE',
    build: {
      rune_ids: [8112, 8143, 8138, 8135, 9111, 8014, 5008, 5008, 5001],
      primary_rune_names: ['Electrocute', 'Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'],
      secondary_rune_names: ['Triumph', 'Coup de Grace'],
      primary_path_id: 8100, secondary_path_id: 8000,
      core_item_ids: [3152, 4645, 3157], core_item_names: [], boots_id: 3020, boots_name: '',
      starter_ids: [1056, 2003], starter_names: [],
      skill_order: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W', 'R', 'W', 'W'],
      win_rate: 0.512, pick_rate: 0.084, ban_rate: 0.121, tier: 2, rank: 14,
    },
  };
}

(window as any).atak = new Proxy({
  opggRoster,
  onLive,
  onChampSelect,
  onChampionBuild: (fn: (p: any) => void) => { buildFn = fn; return () => { buildFn = null; }; },
  onAugOffers,
  // Panel de augments (F7): lista simulada con tiers relativos y rarezas.
  aramAugments: async () => ({
    ok: true, championName: 'Katarina',
    augments: [
      { id: 1349, name: 'Ultimate Awakening', desc: '', tier: 3, pickRate: 28, performance: 72.3, rarity: 2, icon: '' },
      { id: 1103, name: 'Bread And Butter', desc: '', tier: 3, pickRate: 37, performance: 70.7, rarity: 0, icon: '' },
      { id: 1201, name: 'Jeweled Gauntlet', desc: '', tier: 4, pickRate: 19, performance: 66.1, rarity: 2, icon: '' },
      { id: 1088, name: 'Executioner', desc: '', tier: 4, pickRate: 12, performance: 63.0, rarity: 1, icon: '' },
      { id: 1045, name: 'Infernal Conduit', desc: '', tier: 5, pickRate: 6, performance: 56.7, rarity: 1, icon: '' },
      { id: 1012, name: 'Tank Engine', desc: '', tier: 6, pickRate: 2, performance: 48.9, rarity: 0, icon: '' },
    ],
  }),
  opggPickSuggestions: async () => [
    { name: 'Ahri', winRate: 51, pickRate: 9, tier: 1, reason: 'Cubre AP · Meta MIDDLE · T1', matchupWinRate: null },
    { name: 'Twisted Fate', winRate: 51, pickRate: 4, tier: 1, reason: '' },
    { name: 'Fizz', winRate: 51, pickRate: 5, tier: 1, reason: '' },
    { name: 'Viktor', winRate: 50, pickRate: 6, tier: 1, reason: '' },
    { name: 'Katarina', winRate: 50, pickRate: 8, tier: 1, reason: '' },
    { name: 'Yasuo', winRate: 50, pickRate: 10, tier: 1, reason: '' },
  ],
  draftAiNames: async () => ({ items: { 3157: 'Reloj de Arena de Zhonya', 3089: 'Sombrero Mortal de Rabadon', 4645: 'Sombrallama', 3020: 'Zapatos del Hechicero', 3135: 'Bastón del Vacío', 3102: 'Velo de Banshee', 3165: 'Morellonomicon', 1056: 'Anillo de Doran', 2003: 'Poción' }, runes: {} }),
  draftAnalyze: async (req: any) => { await new Promise((r) => setTimeout(r, 1800)); return {
    provider: 'ollama', model: 'atak-coach', tookMs: 1800, confianza: 0.78,
    resumen: `Draft con ${req.enemies.length} enemigos: Zed te buscará desde nivel 6 y Caitlyn castiga tus entradas. Juega la línea con Dark Seal y busca roams tras la primera torre.`,
    plan: ['Línea: pokea con Q y evita pelear antes de nivel 6 contra Zed.', 'Mid game: compra Zhonya como 2º item para anular la R de Zed.', 'Peleas: entra después de que Nautilus use su engage.'],
    amenazas: [{ champion: 'Zed', porQue: 'Burst físico y all-in a nivel 6' }, { champion: 'Nautilus', porQue: 'CC en cadena' }],
    runas: { primaryPathId: 8100, secondaryPathId: 8200, ids: [8112, 8143, 8138, 8135, 8210, 8237], shards: [5008, 5008, 5002], razon: 'Fragmento de armadura en vez de vida por los 3 AD enemigos.', source: 'IA sobre matchup OP.GG (1958 partidas)' },
    items: { inicio: [1056, 2003], build: [3020, 3157, 4645, 3089, 3135, 3102], situacionales: [{ id: 3165, cuando: 'Si Garen compra Sed de Sangre' }], razon: 'Zhonya adelantado al 1er slot tras botas por Zed y Kayn.' },
    hechizos: [4, 14],
    runePage: { name: 'ATAK IA Katarina vs Zed', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8143, 8138, 8135, 8210, 8237, 5008, 5008, 5002] },
  }; },
  applyRunes: async () => ({ ok: true }),
  champMeta: async (name: string) => ({ winRate: 48 + (name.length % 6), pickRate: 5, banRate: 3, tier: 1 + (name.length % 3), rank: null }),
  champSelectHover: async () => ({ ok: true }),
  champSelectLock: async () => ({ ok: true }),
  championPreview: async () => ({ ok: true }),
  status: async () => ({ lcuConnected: true, phase: 'EndOfGame', inGame: false, frontend: 'https://atak.gg', summoner: { gameName: 'Christian', tagLine: 'LAN', puuid: 'puuid-Christian' }, region: 'LA1' }),
  patchData,
  onEogData: (fn: (p: any) => void) => { const t = setTimeout(() => fn(eog), 600); return () => clearTimeout(t); },
  opggBuild: async () => ({
    skill_order: ['Q', 'E', 'W', 'Q', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W'],
    core_item_ids: [3157, 4645, 3089], boots_id: 3020, starter_ids: [1056],
  }),
  matchupData: async () => null,
  showOverlay: async (k: string) => { console.log('[mock] showOverlay', k); return { ok: true }; },
  win: (a: string) => console.log('[mock] win', a),
  openProfile: (r: string) => console.log('[mock] openProfile', r),
}, {
  // Cualquier on* no simulado devuelve un unsubscribe vacío; el resto, una promesa nula.
  get: (t: any, k: string) => t[k] ?? (k.startsWith('on') ? noop : async () => null),
});

import('../src/main');
