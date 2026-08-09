// electron/services/patch.ts
// Resolvedor ÚNICO de versión DDragon (adiós versiones hardcodeadas: el bug
// '16.13.1' rompía todos los iconos del HUD viejo). Cache 1h en memoria.
import https from 'node:https';

let cached: { version: string; champById: Record<number, { id: string; name: string }>; at: number } | null = null;
const TTL = 60 * 60_000;

function getJson<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

export async function getPatchData() {
  if (cached && Date.now() - cached.at < TTL) return cached;
  const versions = await getJson<string[]>('https://ddragon.leagueoflegends.com/api/versions.json');
  const version = versions?.[0] || '15.1.1';
  const champs = await getJson<any>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/champion.json`);
  const champById: Record<number, { id: string; name: string }> = {};
  for (const c of Object.values<any>(champs?.data || {})) {
    champById[Number(c.key)] = { id: c.id, name: c.name };
  }
  cached = { version, champById, at: Date.now() };
  return cached;
}
