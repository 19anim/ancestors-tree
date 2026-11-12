/**
 * The API for Playwright: an in-memory MongoDB replica set, emails kept in memory, no Google.
 * Never used in production; started by playwright.config.ts.
 */
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { pino } from 'pino';
import { createApp } from '../src/app.ts';
import { connectDatabase } from '../src/db/connect.ts';
import { createMemoryMailer } from '../src/mail/mailer.ts';

const PORT = Number(process.env.PORT ?? 3100);
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:4173';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await connectDatabase(replSet.getUri(), { dbName: 'e2e' });

const { app } = createApp({
  logger: pino({ level: 'warn' }),
  version: 'e2e',
  httpLogging: false,
  appOrigin: APP_ORIGIN,
  trustProxyHops: 0,
  apiDocs: false,
  // Both browser projects sign up from the same IP within a minute.
  rateLimits: { auth: 1000, user: 1000 },
  // A fresh random secret per run: nothing to leak, sessions die with the process.
  auth: { jwtSecret: randomBytes(48).toString('base64'), secureCookies: false, bcryptCost: 4 },
  mailer: createMemoryMailer(),
});

const server = app.listen(PORT, () => {
  console.log(`E2E API on http://localhost:${PORT}`);
});

async function stop(): Promise<void> {
  server.close();
  await replSet.stop();
  process.exit(0);
}

process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
