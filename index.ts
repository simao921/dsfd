import express from 'express';
import portalApi from './server/index';

const app = express();
app.use(portalApi);

export default app;
