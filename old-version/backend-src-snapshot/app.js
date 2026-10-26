import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import router from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
// CORS: only our own frontend origin may call the API from a browser.
app.use(cors({ origin: env.clientOrigin.split(',').map((s) => s.trim()), methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/v1', apiLimiter, router);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
