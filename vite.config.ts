import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// GitHub Pages serves a project site from /<repo>/, so the base path must match
// the repository name. Override with VITE_BASE for a custom domain (use '/').
export default defineConfig({
  base: process.env.VITE_BASE ?? '/spellbook/',
  plugins: [svelte()],
  resolve: {
    alias: {
      '@core': src('core'),
      '@app': src('app'),
      '@ui': src('ui'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
