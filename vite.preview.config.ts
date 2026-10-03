// Vista previa en navegador SIN Electron: sirve la SPA con un window.atak
// simulado (preview/mock-atak.ts) para iterar diseño/motion sin abrir LoL.
//   npx vite --config vite.preview.config.ts   →  http://localhost:5178/preview/?view=eog
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5178, strictPort: true },
});
