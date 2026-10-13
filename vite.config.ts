import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// GitHub Pages serves a project site from /<repo>/. The deploy workflow passes
// the real repository name through VITE_BASE, so renaming the repository needs
// no code change. Use '/' for a custom domain or local preview.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [svelte()],
  resolve: {
    alias: {
      '@core': src('core'),
      '@app': src('app'),
      '@render': src('render'),
      '@ui': src('ui'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
