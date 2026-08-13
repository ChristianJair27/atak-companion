// electron/services/patch.ts
// Resolvedor ÚNICO de versión DDragon (adiós versiones hardcodeadas: el bug
// '16.13.1' rompía todos los iconos del HUD viejo). Cache 1h en memoria.
import https from 'node:https';

export interface ChampMeta {
  id: string;
  name: string;
  /** Tags DDragon: Fighter, Tank, Mage, Assassin, Marksman, Support */
  tags: string[];
}

let cached: {
  version: string;
  champById: Record<number, ChampMeta>;
  runeIconById: Record<number, string>;
  at: number;
} | null = null;
const TTL = 60 * 60_000;

function getJson<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/** Fragmentos de estadísticas (stat shards) — IDs fijos de Riot. */
const SHARD_ICON: Record<number, string> = {
  5001: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthScalingIcon.png',
  5002: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsArmorIcon.png',
  5003: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsMagicResIcon.png',
  5005: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAttackSpeedIcon.png',
  5007: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsCDRScalingIcon.png',
  5008: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png',
  5010: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsMovementSpeedIcon.png',
  5011: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthPlusIcon.png',
  5013: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsTenacityIcon.png',
};

export async function getPatchData() {
  if (cached && Date.now() - cached.at < TTL) return cached;
  const versions = await getJson<string[]>('https://ddragon.leagueoflegends.com/api/versions.json');
  const version = versions?.[0] || '15.1.1';
  const [champs, runes] = await Promise.all([
    getJson<any>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/champion.json`),
    getJson<any[]>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/runesReforged.json`),
  ]);
  const champById: Record<number, ChampMeta> = {};
  for (const c of Object.values<any>(champs?.data || {})) {
    champById[Number(c.key)] = {
      id: String(c.id),
      name: String(c.name),
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    };
  }

  const runeIconById: Record<number, string> = { ...SHARD_ICON };
  for (const path of runes || []) {
    if (path?.icon) {
      runeIconById[Number(path.id)] =
        `https://ddragon.leagueoflegends.com/cdn/img/${path.icon}`;
    }
    for (const slot of path?.slots || []) {
      for (const rune of slot?.runes || []) {
        if (rune?.id && rune?.icon) {
          runeIconById[Number(rune.id)] =
            `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`;
        }
      }
    }
  }

  cached = { version, champById, runeIconById, at: Date.now() };
  return cached;
}
