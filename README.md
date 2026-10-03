# ATAK Companion

Companion de escritorio para **League of Legends** — parte del ecosistema [ATAK.GG](https://atak.gg). Electron puro (sin Overwolf): se conecta al cliente de LoL en tu máquina (LCU API) y a la Live Client Data API, y te acompaña desde la selección de campeón hasta el post-partida.

> ⚠️ **Beta abierta.** Lo estamos compartiendo para recibir feedback — issues y sugerencias son bienvenidos.

## Qué hace

### 🗡️ Champ Select inteligente
- **Sugerencias de pick ajustadas a TU draft**: puntúa el meta de tu línea contra los picks enemigos reales (winrate por matchup vía OP.GG), los bans y los huecos de composición de tu equipo (AP/AD/tank/engage).
- **Rival de línea**: se detecta solo (o lo marcas con un clic) y las **runas, items y skills cambian a las del duelo concreto** — con guardarraíl: si no hay muestra estadística suficiente, cae a la build general de la línea y te lo dice.
- **Hover y lock desde el companion**: clic en una sugerencia la deja en intención de pick en el cliente; botón aparte para bloquear.
- **Runas en un clic**: crea la página recomendada en tu cliente y la deja activa (reutiliza siempre la misma página "ATAK", nunca borra las tuyas).
- Timer por fase, bans, comp analysis y tip escrito del matchup.

### 📊 In-game
- **HUD** del jugador local (F9).
- **Scoreboard 5v5 en vivo** (Ctrl+Shift+S).
- **Panel de jugadores** (F8): roster completo con elo, winrate, racha y build meta de cada uno (OP.GG).

### 🏆 Post-partida
- Scoreboard enriquecido con grades, tags de rendimiento, ΔLP y rango.
- **Campeón 3D** bailando (modelo del skin que jugaste).
- **Timeline sobre el minimapa** con los eventos de la partida.
- **Análisis de runas del duelo**: compara lo que llevaste contra lo recomendado para ese matchup — rama, keystone, % de coincidencia, items core que faltaron.

### 📡 Modo caster (torneos)
Overlay de transmisión para OBS con branding de liga, alimentado por el spectator.

## Instalación (desarrollo)

Requisitos: **Node 18+** y el cliente de League of Legends instalado.

```bash
npm install
npm run dev        # Vite + Electron (puerto 5177)
```

Build de distribución:

```bash
npm run build      # typecheck + vite build + electron-builder
```

El companion detecta el cliente de LoL automáticamente (lockfile). No necesita API key de Riot: usa la LCU API local y datos públicos (DDragon/CommunityDragon, OP.GG).

## Hotkeys

| Tecla | Acción |
|---|---|
| `F9` | HUD in-game |
| `Ctrl+Shift+S` | Scoreboard en vivo |
| `F8` | Panel de jugadores (elo/builds) |
| — | Champ select y post-partida se abren solos |

## Stack

Electron 31 · Vite 5 · React 18 · TypeScript · three.js

## Aviso

ATAK Companion no está avalado por Riot Games y no refleja los puntos de vista u opiniones de Riot Games ni de nadie oficialmente involucrado en producir o administrar League of Legends. League of Legends y Riot Games son marcas registradas de Riot Games, Inc.

## 0.3.0 — piel hextech, motion y ATAK Coach

- Rediseño "cliente de League" en home, champ select, HUD (320×420), panel F8, herramienta de draft y post-partida, con motion cinematográfico (`src/motion.tsx`, `src/views/hextech.*`).
- **ATAK Coach**: análisis IA del draft (champ select real y herramienta de draft) con runas, build de 6 items, situacionales y plan para ESA partida. Proveedores: Claude (`ANTHROPIC_API_KEY`) → Ollama local (`npm run ai:setup` crea `atak-coach` sobre qwen3:8b) → IA hosteada de ATAK → reglas + OP.GG. Ver `ollama/README.md`.
- Builds completas con variantes y alternativas por slot (OP.GG), rango de los 10 jugadores en el post-partida, datos de Riot (rango, maestría, hechizos) por celda en el draft, barras de pickeo sobre los augments (ARAM/Arena).
- Preview en navegador sin LoL: `npx vite --config vite.preview.config.ts` → `http://localhost:5178/preview/?view=champselect`.
