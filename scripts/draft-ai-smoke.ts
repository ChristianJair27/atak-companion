// Prueba rápida de ATAK Coach sin Electron:  npx tsx scripts/draft-ai-smoke.ts
import { analyzeDraft } from '../electron/services/draft-ai.js';

const t0 = Date.now();
const a = await analyzeDraft({
  me: { championName: 'Katarina' }, position: 'MIDDLE', rival: 'Zed',
  allies: [{ championName: 'Aatrox', position: 'TOP' }, { championName: 'Lee Sin', position: 'JUNGLE' }, { championName: 'Jinx', position: 'BOTTOM' }, { championName: 'Thresh', position: 'UTILITY' }],
  enemies: [{ championName: 'Garen' }, { championName: 'Kayn' }, { championName: 'Zed' }, { championName: 'Caitlyn' }, { championName: 'Nautilus' }],
  force: true,
});
console.log(JSON.stringify(a, null, 2));
console.log('ms', Date.now() - t0);
