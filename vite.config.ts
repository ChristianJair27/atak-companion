import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// El package es "type":"module". vite-plugin-electron, si ve entry + type module,
// emite el preload como ESM (import/export). Electron con sandbox por defecto
// carga el preload con require() → SyntaxError silencioso → window.atak no
// existe → pantalla negra / "el puente IPC no cargó".
//
// Solución: NO usar `entry` en el preload (eso activa build.lib formats:['es']).
// Usar rollupOptions.input + format cjs + .cjs, como hace el simple API.
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      {
        onstart: (o) => o.reload(),
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              // input (no lib.entry) para no heredar formats:['es']
              input: 'electron/preload.ts',
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  server: { port: 5177, strictPort: true },
  build: { outDir: 'dist' },
});
