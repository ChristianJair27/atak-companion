// Publica la versión actual en GitHub Releases (auto-update + descarga directa).
//   npm run release      → build + release vX.Y.Z con:
//     - ATAK-Companion-Setup-X.Y.Z.exe (+ .blockmap y latest.yml para electron-updater)
//     - ATAK-Companion-Setup.exe (nombre fijo → enlace permanente /releases/latest/download/…)
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, existsSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const exe = `release/ATAK-Companion-Setup-${version}.exe`;
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (!process.argv.includes('--no-build')) run('npm run build');
if (!existsSync(exe)) throw new Error(`No existe ${exe} — ¿falló el build?`);
copyFileSync(exe, 'release/ATAK-Companion-Setup.exe');
const notes = process.argv.find((a) => a.startsWith('--notes='))?.slice(8) || `ATAK Companion ${version}`;
run(`gh release create v${version} "${exe}" "${exe}.blockmap" release/latest.yml release/ATAK-Companion-Setup.exe --title "ATAK Companion ${version}" --notes "${notes.replace(/"/g, "'")}"`);
