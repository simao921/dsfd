import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const site = process.env.SITE ?? 'public';
const sitePorts: Record<string, number> = {
  public: 3000,
  admin: 3001,
  clients: 3002,
  workers: 3003,
};

if (!(site in sitePorts)) {
  throw new Error(`Unknown SITE "${site}". Use public, admin, clients or workers.`);
}

export default defineConfig({
  root: path.join(repoRoot, 'apps', site),
  plugins: [react()],
  envPrefix: ['VITE_'],
  server: {
    host: '0.0.0.0',
    port: sitePorts[site],
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: process.env.VERCEL ? path.join(repoRoot, 'apps', site, 'dist') : path.join(repoRoot, 'dist', 'apps', site),
    emptyOutDir: false,
    sourcemap: false,
  },
});
