import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['walkthrough/**/*.test.ts', 'shared/**/*.test.ts', 'worker/**/*.test.ts'] } });
