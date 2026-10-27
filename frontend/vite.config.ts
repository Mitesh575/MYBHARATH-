import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(process.cwd(), "frontend"),
  build: { outDir: resolve(process.cwd(), "dist"), emptyOutDir: true },
  server: { host: "0.0.0.0" },
});
