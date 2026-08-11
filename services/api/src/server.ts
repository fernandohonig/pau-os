import 'dotenv/config';
import { buildApp } from './app.js';
import { createPrisma } from './prisma.js';

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
