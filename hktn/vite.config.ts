/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Я убрал root: 'src', как мы и договаривались
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: { // Теперь эта секция валидна!
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
