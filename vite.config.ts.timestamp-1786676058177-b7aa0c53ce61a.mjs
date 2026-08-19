// vite.config.ts
import { defineConfig } from "file:///E:/ATAKGG/_old-monorepo/atak-companion/node_modules/vite/dist/node/index.js";
import react from "file:///E:/ATAKGG/_old-monorepo/atak-companion/node_modules/@vitejs/plugin-react/dist/index.js";
import electron from "file:///E:/ATAKGG/_old-monorepo/atak-companion/node_modules/vite-plugin-electron/dist/index.mjs";
import renderer from "file:///E:/ATAKGG/_old-monorepo/atak-companion/node_modules/vite-plugin-electron-renderer/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: { external: ["electron"] }
          }
        }
      },
      {
        onstart: (o) => o.reload(),
        vite: {
          build: {
            outDir: "dist-electron",
            emptyOutDir: false,
            rollupOptions: {
              // input (no lib.entry) para no heredar formats:['es']
              input: "electron/preload.ts",
              external: ["electron"],
              output: {
                format: "cjs",
                entryFileNames: "preload.cjs",
                inlineDynamicImports: true
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  server: { port: 5177, strictPort: true },
  build: { outDir: "dist" }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxBVEFLR0dcXFxcX29sZC1tb25vcmVwb1xcXFxhdGFrLWNvbXBhbmlvblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRTpcXFxcQVRBS0dHXFxcXF9vbGQtbW9ub3JlcG9cXFxcYXRhay1jb21wYW5pb25cXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0U6L0FUQUtHRy9fb2xkLW1vbm9yZXBvL2F0YWstY29tcGFuaW9uL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IGVsZWN0cm9uIGZyb20gJ3ZpdGUtcGx1Z2luLWVsZWN0cm9uJztcbmltcG9ydCByZW5kZXJlciBmcm9tICd2aXRlLXBsdWdpbi1lbGVjdHJvbi1yZW5kZXJlcic7XG5cbi8vIEVsIHBhY2thZ2UgZXMgXCJ0eXBlXCI6XCJtb2R1bGVcIi4gdml0ZS1wbHVnaW4tZWxlY3Ryb24sIHNpIHZlIGVudHJ5ICsgdHlwZSBtb2R1bGUsXG4vLyBlbWl0ZSBlbCBwcmVsb2FkIGNvbW8gRVNNIChpbXBvcnQvZXhwb3J0KS4gRWxlY3Ryb24gY29uIHNhbmRib3ggcG9yIGRlZmVjdG9cbi8vIGNhcmdhIGVsIHByZWxvYWQgY29uIHJlcXVpcmUoKSBcdTIxOTIgU3ludGF4RXJyb3Igc2lsZW5jaW9zbyBcdTIxOTIgd2luZG93LmF0YWsgbm9cbi8vIGV4aXN0ZSBcdTIxOTIgcGFudGFsbGEgbmVncmEgLyBcImVsIHB1ZW50ZSBJUEMgbm8gY2FyZ1x1MDBGM1wiLlxuLy9cbi8vIFNvbHVjaVx1MDBGM246IE5PIHVzYXIgYGVudHJ5YCBlbiBlbCBwcmVsb2FkIChlc28gYWN0aXZhIGJ1aWxkLmxpYiBmb3JtYXRzOlsnZXMnXSkuXG4vLyBVc2FyIHJvbGx1cE9wdGlvbnMuaW5wdXQgKyBmb3JtYXQgY2pzICsgLmNqcywgY29tbyBoYWNlIGVsIHNpbXBsZSBBUEkuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBlbGVjdHJvbihbXG4gICAgICB7XG4gICAgICAgIGVudHJ5OiAnZWxlY3Ryb24vbWFpbi50cycsXG4gICAgICAgIHZpdGU6IHtcbiAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgb3V0RGlyOiAnZGlzdC1lbGVjdHJvbicsXG4gICAgICAgICAgICByb2xsdXBPcHRpb25zOiB7IGV4dGVybmFsOiBbJ2VsZWN0cm9uJ10gfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgb25zdGFydDogKG8pID0+IG8ucmVsb2FkKCksXG4gICAgICAgIHZpdGU6IHtcbiAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgb3V0RGlyOiAnZGlzdC1lbGVjdHJvbicsXG4gICAgICAgICAgICBlbXB0eU91dERpcjogZmFsc2UsXG4gICAgICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICAgIC8vIGlucHV0IChubyBsaWIuZW50cnkpIHBhcmEgbm8gaGVyZWRhciBmb3JtYXRzOlsnZXMnXVxuICAgICAgICAgICAgICBpbnB1dDogJ2VsZWN0cm9uL3ByZWxvYWQudHMnLFxuICAgICAgICAgICAgICBleHRlcm5hbDogWydlbGVjdHJvbiddLFxuICAgICAgICAgICAgICBvdXRwdXQ6IHtcbiAgICAgICAgICAgICAgICBmb3JtYXQ6ICdjanMnLFxuICAgICAgICAgICAgICAgIGVudHJ5RmlsZU5hbWVzOiAncHJlbG9hZC5janMnLFxuICAgICAgICAgICAgICAgIGlubGluZUR5bmFtaWNJbXBvcnRzOiB0cnVlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICBdKSxcbiAgICByZW5kZXJlcigpLFxuICBdLFxuICBzZXJ2ZXI6IHsgcG9ydDogNTE3Nywgc3RyaWN0UG9ydDogdHJ1ZSB9LFxuICBidWlsZDogeyBvdXREaXI6ICdkaXN0JyB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTRTLFNBQVMsb0JBQW9CO0FBQ3pVLE9BQU8sV0FBVztBQUNsQixPQUFPLGNBQWM7QUFDckIsT0FBTyxjQUFjO0FBU3JCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxNQUNQO0FBQUEsUUFDRSxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsVUFDSixPQUFPO0FBQUEsWUFDTCxRQUFRO0FBQUEsWUFDUixlQUFlLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBRTtBQUFBLFVBQzFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxTQUFTLENBQUMsTUFBTSxFQUFFLE9BQU87QUFBQSxRQUN6QixNQUFNO0FBQUEsVUFDSixPQUFPO0FBQUEsWUFDTCxRQUFRO0FBQUEsWUFDUixhQUFhO0FBQUEsWUFDYixlQUFlO0FBQUE7QUFBQSxjQUViLE9BQU87QUFBQSxjQUNQLFVBQVUsQ0FBQyxVQUFVO0FBQUEsY0FDckIsUUFBUTtBQUFBLGdCQUNOLFFBQVE7QUFBQSxnQkFDUixnQkFBZ0I7QUFBQSxnQkFDaEIsc0JBQXNCO0FBQUEsY0FDeEI7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsSUFDRCxTQUFTO0FBQUEsRUFDWDtBQUFBLEVBQ0EsUUFBUSxFQUFFLE1BQU0sTUFBTSxZQUFZLEtBQUs7QUFBQSxFQUN2QyxPQUFPLEVBQUUsUUFBUSxPQUFPO0FBQzFCLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
