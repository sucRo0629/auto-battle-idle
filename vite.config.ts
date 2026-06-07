/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { editorApiPlugin } from './vite-plugin-editor-api.ts';

export default defineConfig({
  base: './',
  plugins: [editorApiPlugin()],
  test: {
    include: ['src/**/*.test.ts'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        menu: resolve(__dirname, 'menu.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
});
