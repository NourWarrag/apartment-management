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
        TEST_DATABASE_URL: env.TEST_DATABASE_URL ?? env.DATABASE_URL,
        FEATURE_BOOKINGS: 'true',
        FEATURE_PAYMENTS: 'true',
        FEATURE_TICKETS: 'true',
        FEATURE_STAFF: 'true',
        FEATURE_REPORTS: 'true',
        FEATURE_MULTI_BUILDING: 'true',
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
