import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), '');
  return {
    test: {
      fileParallelism: false,
      env: {
        DATABASE_URL: env.TEST_DATABASE_URL ?? env.DATABASE_URL,
      },
      alias: {
        '@hotel/shared': path.resolve(__dirname, '../shared/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@hotel/shared': path.resolve(__dirname, '../shared/index.ts'),
      },
    },
  };
});
