import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // process.cwd() ensures it looks in your root folder for .env files
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/PaletteIQ/',
    plugins: [react(), tailwindcss()],
    
    // This is the "Safety Bridge"
    // It makes sure that whether you use process.env or import.meta.env, 
    // the app doesn't crash if the variable is missing.
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || ""),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
