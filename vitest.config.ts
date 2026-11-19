import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // main.ts and start.ts are the Foundry lifecycle boundary and are covered by the live
      // check, not by unit tests. routing, history and local-message run without a client.
      include: ['src/routing.ts', 'src/history.ts', 'src/local-message.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
