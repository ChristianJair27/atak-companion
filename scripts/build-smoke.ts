import { getChampionBuild } from '../electron/services/opgg.js';
const b = await getChampionBuild('Katarina', 'MIDDLE', 'ranked');
console.log(JSON.stringify({ core: b?.core_item_ids, names: b?.core_item_names, full: b?.full_builds?.map((f) => f.ids), opts4: b?.item_options.fourth.map((o) => [o.id, o.pickRate]) }));
