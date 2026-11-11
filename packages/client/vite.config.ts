import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Относительные пути нужны, чтобы сборка работала внутри приложения Android.
  base: "./",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Адрес живого превью в песочнице агента.
    allowedHosts: [".e2b.app"],
  },
  build: {
    // Phaser целиком весит больше стандартного порога предупреждения.
    chunkSizeWarningLimit: 2000,
  },
});
