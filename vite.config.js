import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: '/Flow-LPS-Uploader/',
  build: {rollupOptions: {input: {main: resolve(process.cwd(), 'index.html'), redirect: resolve(process.cwd(), 'redirect.html')}}}
});
