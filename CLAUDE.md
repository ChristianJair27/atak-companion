# ATAK Companion — Handoff para Claude

> Actualizado: 2026-08-08  
> Repo local: `E:\ATAKGG\_old-monorepo\atak-companion`  
> Stack: Electron 31 + Vite 5 + React 18 + TypeScript (`"type": "module"`)

Lee este archivo al retomar trabajo en el companion. Resume el estado real del código, no la intención histórica de Overwolf.

---

## Qué es este proyecto

Companion de escritorio **Electron puro** (sin Overwolf) para ATAK.GG:

| Ventana | `?view=` | Hotkey | Rol |
|---|---|---|---|
| Main | `main` | — | Estado LCU, modo caster LQC |
| HUD | `hud` | **F9** | Overlay in-game del jugador local |
| Champ select | `champselect` | auto en ChampSelect | Panel lateral selección |
| Scoreboard | `scoreboard` | **Ctrl+Shift+S** | Marcador 5v5 vivo |
| Players (OP.GG) | `players` | **F8** (también Ctrl+A / Ctrl+Shift+A / Alt+A) | Roster + elo/WR/runas + build OP.GG |
| EOG | `eog` | auto al fin de partida | Post-partida enriquecido |
| Caster | `caster` | vía main | Overlay broadcast LQC |

Fases LCU → ventanas: ver `electron/main.ts` (`handlePhase`).

---

## FIX CRÍTICO: preload / “El puente IPC no cargó”

### Síntoma

Al arrancar con `npm run dev` la UI mostraba:

> El puente IPC (preload) no cargó: `window.atak` no existe.

Ese texto lo pinta `src/App.tsx` a propósito cuando falta `window.atak` (no es un crash opaco).

### Causa raíz (verificada)

1. `package.json` tiene `"type": "module"`.
2. `vite-plugin-electron`, si recibe `entry` en el preload, activa `build.lib.formats: ['es']` cuando el package es ESM.
3. El output se nombró `preload.cjs`, pero el **contenido** seguía siendo ESM (`import` / `export`).
4. Electron (sandbox por defecto, `nodeIntegration: false`) carga el preload con **`require()`** →  
   `SyntaxError: Cannot use import statement outside a module` → preload muere en silencio → no hay `contextBridge.exposeInMainWorld('atak', …)`.

Reproducción Node (fuera de Electron):

```text
require('./dist-electron/preload.cjs')
// FAIL: Cannot use import statement outside a module
```

### Solución aplicada en `vite.config.ts`

**No** usar `entry` en el bloque del preload (eso fuerza lib ESM).  
Usar `rollupOptions.input` + `format: 'cjs'` + `entryFileNames: 'preload.cjs'` + `inlineDynamicImports: true`, como el simple API del plugin.

Output correcto actual:

```js
"use strict";const n=require("electron"),…
n.contextBridge.exposeInMainWorld("atak",{…});
```

`main` sigue siendo ESM (`dist-electron/main.js`) — eso está bien con `"type":"module"`.  
Solo el **preload** debe ser CJS puro.

### Qué NO reintroducir

- No volver a poner `entry: 'electron/preload.ts'` sin forzar `lib.formats: ['cjs']` de forma efectiva.
- No renombrar a `.mjs` esperando que sandbox+require lo cargue: la matriz del plugin dice que con sandbox default solo funciona `require`.
- No poner `import` en el archivo emitido de preload.

### Cómo verificar tras un cambio de build

```bash
node -e "const s=require('fs').readFileSync('dist-electron/preload.cjs','utf8'); console.log(/require\\(.electron.\\)/.test(s), !/\\bimport\\b/.test(s))"
# true true  → OK
```

Luego `npm run dev` y confirmar que `window.atak` existe en DevTools de la ventana main.

---

## Arquitectura de datos

```
LCU lockfile ──► electron/services/lcu.ts ──► eventos phase / champ-select / eog-stats
Live Client :2999 ──► electron/services/live-client.ts ──► broadcast 'live'
OP.GG MCP https://mcp-api.op.gg/mcp ──► electron/services/opgg.ts ──► IPC invoke
DDragon / CDragon ──► patch.ts + helpers en src/views/shared.tsx (iconos)
```

- **IPC bridge**: `electron/preload.ts` → `window.atak.*`
- **Main handlers**: `ipcMain.handle` en `electron/main.ts`
- **UI**: una sola SPA Vite; la ventana elige vista con `?view=`

Backend web de referencia (no es runtime del companion, pero contratos y UX):

- `E:\ATAKGG\sniperlol` — proxy OP.GG, stats, LCU proxy  
- `E:\ATAKGG\aka.gg` — MatchDetailPage + `MatchReplay2D` + ChampionDanceSlot  

OP.GG en companion se llama **directo al MCP** (mismo endpoint que sniperlol), no requiere sniperlol en local para el panel de players/build. Si se quiere reutilizar el backend: `ATAK_BACKEND` (default `https://atakback.revolution505.com`).

---

## Archivos clave

| Path | Rol |
|---|---|
| `vite.config.ts` | Build main ESM + preload CJS (no romper) |
| `electron/main.ts` | Ventanas, hotkeys, IPC, máquina de fases |
| `electron/preload.ts` | `contextBridge` → `window.atak` |
| `electron/services/lcu.ts` | Lockfile + gameflow + EOG + champ select |
| `electron/services/live-client.ts` | allgamedata :2999 (players, items, spells, runes) |
| `electron/services/opgg.ts` | Cliente MCP OP.GG (perfil + build) |
| `electron/services/patch.ts` | Versión DDragon + mapa champId |
| `src/App.tsx` | Router por `view` + guard preload |
| `src/views/EogView.tsx` | Post-partida visual (splash, items, tags, ambos equipos) |
| `src/views/PlayersView.tsx` | Ctrl+A: roster + OP.GG + build sidebar |
| `src/views/shared.tsx` | Hooks + URLs de assets |
| `src/styles.css` | Design system crimson/plata/negro |

---

## Hotkeys (main process)

| Combo | Acción |
|---|---|
| `F9` | Toggle HUD |
| `Ctrl+Shift+S` | Toggle scoreboard (solo si hay partida viva) |
| `F8` / `Ctrl+A` / `Ctrl+Shift+A` / `Alt+A` | Toggle panel players (abre siempre; UI reintenta datos) |
| Botón **JUGADORES · F8** en MainView | Mismo toggle vía IPC `toggle-players` |

**Nota:** `Ctrl+A` a menudo falla al registrar o lo come League/Windows. Preferir **F8**.
Si el hotkey no abre nada, mirar consola main: `[hotkey] register Ctrl+A: FAIL` vs `OK`.

Registrar en `app.whenReady` con `globalShortcut`. Al cerrar: `will-quit` → `unregisterAll`.

---

## OP.GG MCP (herramientas usadas)

Endpoint: `https://mcp-api.op.gg/mcp` (JSON-RPC `tools/call`, sin API key).

| Tool | Uso en companion |
|---|---|
| `lol_get_summoner_profile` / flujo full | Elo, WR, stats por campeón, tags |
| `lol_get_champion_analysis` | Runas, core items, boots, starter, skill order |

Región LCU (`LA1`, `NA1`…) se normaliza a OP.GG (`LAN`, `NA`…) en `opgg.ts`.

Cache en memoria (~30 min) para no martillar el MCP.

---

## Assets (siempre URLs remotas, nunca hardcodear patch)

- Champ icon: CommunityDragon `champion-icons/{id}.png` o DDragon `img/champion/{id}.png`
- Splash: `cdn/img/champion/splash/{ChampId}_0.jpg` (fallback “modelo 2D”)
- Items: `cdn/{version}/img/item/{id}.png`
- Spells: `cdn/{version}/img/spell/SummonerFlash.png` etc.
- Runes/keystones: DDragon perk-images / CDragon styles
- Rank emblems: CDragon `ranked-emblem/emblem-{tier}.png`

`patch.ts` resuelve la última versión; no usar `16.13.1` fijo (bug viejo del HUD).

---

## EOG — qué datos trae LCU

`GET /lol-end-of-game/v1/eog-stats-block` (campos variables entre clientes).  
Siempre leer con helper tolerante `st(obj, ...keys)` (ver EogView / overwolf `end_of_game.html`).

Campos útiles: teams[], localPlayer, gameLength, gameMode, items ITEM0–ITEM6, daño, visión, multi-kill, first blood, gold, CS.

Si falta match timeline V5 (replay 2D completo de aka.gg), el companion:

1. Muestra splash + scoreboard gráfico + timeline de eventos live cacheados.
2. Botón “Análisis completo” abre frontend ATAK (`ATAK_FRONTEND`).

Replay 2D oficial de aka.gg: `MatchReplay2D` + `GET /api/stats/match-replay/:regional/:matchId` (necesita match-v5). Integrar cuando haya `gameId` + región + backend arriba.

---

## Scripts

```bash
npm run dev       # Vite + electron (puerto 5177)
npm run typecheck
npm run build     # typecheck + vite build + electron-builder
npm start         # electron . (usa dist ya buildado)
```

Env útiles:

- `VITE_DEV_SERVER_URL` — inyectado por el plugin en dev  
- `ATAK_BACKEND` — default producción  
- `ATAK_FRONTEND` — default producción  

---

## Trabajo reciente (sesión Grok — champ select cinema + EOG 3D)

1. **Fix preload CJS** (`vite.config.ts`) — no tocar.
2. **Champ select cinematográfico 1280×720** (estilo client LoL / InFlames):
   - Columnas aliados | splash + meta OP.GG | enemigos.
   - Bans, loading cards, barra de timer, barras WR/PR/BR.
   - Runas/items/skills/counters + análisis de comp.
3. **EOG**:
   - **LP + rango** vía LCU `current-ranked-stats` (snapshot al entrar InProgress → ΔLP al final).
   - **Campeón 3D bailando** (`ChampionDance.tsx` + three.js + CDN modelviewer.lol, skin si `skinID` live).
   - **Timeline con minimapa** (`MapTimeline.tsx`, mapa DDragon + eventos live + scrub + gráfico kills).
4. **Deps**: `three` (+ `@types/three`).

---

## Próximos pasos sugeridos (no hechos / parciales)

- [ ] Replay 2D real (timeline Match-V5) embebido si backend responde `match-replay`
- [ ] Modelo 3D GLB (modelviewer.lol) opcional en EOG — hoy splash 2D
- [ ] Prefetch OP.GG en champ select y cache hasta EOG/Players
- [ ] Rate-limit / cola de requests OP.GG para 10 jugadores
- [ ] Tests de humo: preload require, IPC status, LCU lockfile paths
- [ ] Champ select más ancho (estilo Overwolf 1120) si se quiere roster dual completo

---

## Convenciones

- Español en UI del companion; comentarios técnicos en español/inglés mixto como el repo.
- Design system: crimson `#E1242E`, plata, negro `#0A0A0C` — `src/styles.css` y `design/ATAK-Screens.html`.
- Display font: **Friz Quadrata** (LoL) con fallback Cinzel.
- No reintroducir Overwolf SDK.
- No inventar field names de LCU: siempre multi-key `st()`.
- Preferir CommunityDragon/DDragon públicos sobre assets locales pesados.
- **No romper** `vite.config.ts` del preload CJS ni hacer force-push a prod sin probar `npm run typecheck` + `npm run dev`.

---

## Octubre 2026 — piel hextech, motion y ATAK Coach (IA)

- **Kit de diseño** `src/views/hextech.css` + `hextech.tsx` (paneles con esquinas cortadas y hairline dorado, `HxSlot` con splash de fondo, `HxHex`, `HxRuneTree` completo vía DDragon, `HxSkillGrid`, `HxFullBuild` con variantes, `HxRing`, `useItemData`). Lo usan champ select, HUD (320×420), panel F8, home y draft tool. El post-partida usa su propia piel (`post.css`, tokens Outfit/cyan).
- **Motion** común en `src/motion.tsx` (solo opacity/transform/width, easing `0.22,1,0.36,1`); `MotionConfig reducedMotion="user"` en `App.tsx`. Todas las ventanas llevan `backgroundThrottling: false` (si no, Chromium congela rAF con la ventana tapada y las animaciones se quedan a medias).
- **ATAK Coach** (`electron/services/draft-ai.ts`, IPC `draft-analyze`, UI `src/views/DraftAiPanel.tsx`): build personalizada por draft. Proveedores: Claude (`ANTHROPIC_API_KEY`) → Ollama local `atak-coach` (`ollama/Modelfile`, base qwen3:8b; `npm run ai:setup`) → reglas + OP.GG. La IA elige solo entre ids del catálogo (OP.GG + situacionales) y se valida contra DDragon (página de runas estructuralmente válida, 1 bota, ≤3 piezas distintas de la build base, hechizos vistos por OP.GG). Prueba sin Electron: `npx tsx scripts/draft-ai-smoke.ts`.
- **OP.GG**: `getChampionBuild` ahora trae `full_builds` (6 items: botas + core + 4º + 5º), `item_options` por slot y `spell_ids`; cuando el `core_items` del MCP es un core de nicho (pick < 30 %) el core se deriva de `last_items` (los legendarios más comprados).
- **Draft real**: cada celda del champ select lleva nombre, rango y maestría (LCU por puuid, `getCellInfo`) y tier/WR del campeón en su rol (IPC `champ-meta`). En ranked el LCU oculta el puuid enemigo.
- **Post-partida**: rango de los 10 (`_ranks` por puuid) y ELO medio por equipo.
- **Augments** (ARAM y Arena): barras de pickeo + sinergia sobre las cards (`AugBadgesView`); geometría de Arena `CARD_GEOM_ARENA` estimada, pendiente de calibrar.
- **Preview sin LoL**: `npx vite --config vite.preview.config.ts` → `http://localhost:5178/preview/?view=eog|champselect|hud|players|main|augbadges` (mock en `preview/mock-atak.ts`).
