import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moves the datasource connection URL out of schema.prisma and into
// this config file (used by `prisma migrate` / `prisma db`). At runtime the
// PrismaClient is instantiated with a driver adapter instead (see
// scripts/import-content/index.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
