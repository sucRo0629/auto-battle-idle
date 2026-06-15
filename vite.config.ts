/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { editorApiPlugin } from './vite-plugin-editor-api.ts';

export default defineConfig({
  base: './',
  plugins: [editorApiPlugin()],
  server: {
    watch: {
      // エディタ保存で JSON が更新されてもエディタ画面はフルリロードしない（選択状態が消えるのを防ぐ）。
      // ゲーム側の import キャッシュは vite-plugin-editor-api が保存後に明示的に無効化する。
      ignored: ['**/data/classes.json', '**/data/skills/**', '**/data/enemies.json'],
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 120_000,
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
