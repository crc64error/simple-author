import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    open: !process.env.TAURI_ENV_PLATFORM,
  },
  envPrefix: ['VITE_', 'TAURI_'],
});