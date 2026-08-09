import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  plugins: [
    react(),
    electron([
      { entry: 'electron/main.ts', vite: { build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } } } },
      {
        entry: 'electron/preload.ts',
        onstart: (o) => o.reload(),
        // OJO: el package es "type":"module", así que un preload .js sería ESM
        // y Electron lo rechaza en silencio (window.atak nunca existe → pantalla
        // negra). Forzamos CJS con extensión .cjs.
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron'], output: { format: 'cjs', entryFileNames: 'preload.cjs' } },
          },
        },
      },
    ]),
    renderer(),
  ],
  server: { port: 5177, strictPort: true },
  build: { outDir: 'dist' },
});
