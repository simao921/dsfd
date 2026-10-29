// Explicit Vercel catch-all function for every /api/* route.
// This avoids relying on framework auto-detection for the root Express entrypoint.
import app from '../server/index.ts';

export default app;
