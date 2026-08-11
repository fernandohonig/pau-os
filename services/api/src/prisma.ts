import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../prisma/generated/client/client.js';

/** Create a PrismaClient backed by the PostgreSQL driver adapter (Prisma 7). */
export function createPrisma(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type Db = PrismaClient;
