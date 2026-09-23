import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

export interface HarvestState {
  running: boolean;
  log: string[];
  ok?: boolean;
  error?: string;
}

/** Keeps the response small; the UI only ever shows the tail. */
const LOG_LIMIT = 300;

/**
 * Dev-only `/__harvest` endpoint: POST re-runs `npm run harvest:fresh`, GET polls its output.
 * A production build is static, so the button that drives this is compiled out.
 */
function harvestEndpoint(): Plugin {
  let state: HarvestState = { running: false, log: [] };

  return {
    name: 'harvest-endpoint',
    apply: 'serve',
    configureServer(server) {
      const start = (): void => {
        state = { running: true, log: ['Startar om skörden…'] };
        const child = spawn('npm', ['run', 'harvest:fresh'], {
          cwd: server.config.root,
          env: { ...process.env, FORCE_COLOR: '0' },
        });
        const absorb = (chunk: Buffer): void => {
          const lines = chunk.toString('utf8').split('\n').filter((line) => line.trim() !== '');
          state.log = [...state.log, ...lines].slice(-LOG_LIMIT);
        };
        child.stdout.on('data', absorb);
        child.stderr.on('data', absorb);
        child.on('error', (error) => {
          state = { ...state, running: false, ok: false, error: error.message };
        });
        child.on('close', (code) => {
          state = { ...state, running: false, ok: code === 0 };
          if (code !== 0) state.error = `Skörden avslutades med kod ${code}.`;
        });
      };

      server.middlewares.use('/__harvest', (req, res) => {
        const reply = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') return reply(200, state);
        if (req.method !== 'POST') return reply(405, { error: `${req.method} stöds inte.` });
        if (state.running) return reply(409, { ...state, error: 'En skörd pågår redan.' });
        start();
        return reply(202, state);
      });
    },
  };
}

export default defineConfig({
  // Served from a repository sub-path on GitHub Pages, so assets resolve relative to
  // index.html rather than the domain root. Keeps the build portable: sub-path, preview
  // and a future root domain all work without the repository name in source.
  base: './',
  plugins: [react(), harvestEndpoint()],
  // The harvest rewrites these mid-session; the UI reloads them itself rather than
  // letting the watcher blow the page away while the run is still reporting progress.
  server: { watch: { ignored: ['**/public/data/**'] } },
  resolve: {
    alias: {
      '~shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
