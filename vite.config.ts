import { defineConfig } from 'vitest/config';

// Agent worktrees and verification runs live inside the repo; keep them out of the dev
// server's file watcher (they trigger full reloads mid-run) and out of the test run.
const SCRATCH = ['**/.claude/**', '**/.verify/**', '**/node_modules/**'];

export default defineConfig({
  server: { watch: { ignored: SCRATCH } },
  test: { exclude: SCRATCH },
});
