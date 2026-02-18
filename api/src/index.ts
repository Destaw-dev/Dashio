import path from 'path';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: path.resolve(__dirname, '../.env') });

import 'express-async-errors';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { connectDb, isDbConnected } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import analyticsRoutes from './routes/analytics';
import customersRoutes from './routes/customers';
import adminRoutes from './routes/admin';

const app = express();
const DEFAULT_PORT = 5000;
const requestedPort = Number(process.env.PORT) || DEFAULT_PORT;

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000' || 'http://localhost:3001', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    db: isDbConnected() ? 'connected' : 'disconnected',
  });
});

app.use('/auth', authRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/customers', customersRoutes);
app.use('/admin', adminRoutes);

app.use(errorHandler);

async function start(): Promise<void> {
  await connectDb();
  function tryListen(port: number): void {
    const server = app.listen(port, () => {
      console.log(`API running at port:${port}`);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port === requestedPort) {
        console.warn(`Port ${port} in use, trying ${port + 1}...`);
        tryListen(port + 1);
      } else {
        throw err;
      }
    });
  }
  tryListen(requestedPort);
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });
}

export { app };
