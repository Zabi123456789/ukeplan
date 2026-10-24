/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base: './' gjør at bygget fungerer fra en undermappe (GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Én side med kalender, datoer og bønneberegning: ca. 200 kB komprimert er greit her.
  build: { chunkSizeWarningLimit: 800 },
  test: { include: ["src/**/*.test.ts"] },
});
