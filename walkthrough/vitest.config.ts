import { defineConfig } from 'vitest/config';
// 60 s: the tests on the real GLAMOS inventory download it first when it is not cached (always on a CI runner)
export default defineConfig({ test: { include: ['walkthrough/**/*.test.ts', 'shared/**/*.test.ts', 'worker/**/*.test.ts'], testTimeout: 60000, hookTimeout: 60000 } });
