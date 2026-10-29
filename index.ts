// Vercel's Express adapter detects the application from this root entrypoint.
import express from 'express';
import portalApi from './server/index.ts';

const app = express();
app.use(portalApi);

export default app;
