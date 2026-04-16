import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env vars regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // 1. Set the base path for your subdomain/folder structure
    base: '/PaletteIQ/',

    plugins: [react(), tailwindcss()],

    // 2. Define the key so it's accessible in your code as process.env.GEMINI_API_KEY
    // We prioritize VITE_GEMINI_API_KEY as it's the standard for Netlify/Vite
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },

    // Ensure build output goes to a clean folder
    build: {
      outDir: 'dist',
    }
  };
});
