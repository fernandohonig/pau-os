import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildApp } from './app.js';
import { createPrisma } from './prisma.js';

// Config lives in the monorepo-root .env. Load that first, then let a local
// services/api/.env (if any) override — neither call overwrites already-set vars.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const port = Number(process.env.API_PORT ?? 3000);
const host = process.env.API_HOST ?? 'localhost';

const db = createPrisma(connectionString);
const app = buildApp(db);

app
  .listen({ port, host })
  .then((address) => {
    // eslint-disable-next-line no-console
    console.info(`PAU OS API listening at ${address}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
