import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export class DatabaseUnavailableError extends Error {
  readonly code = 'DB_UNAVAILABLE';

  constructor() {
    super('Database is not available');
    this.name = 'DatabaseUnavailableError';
  }
}

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

export function getPrisma(): PrismaClient {
  if (!isDatabaseConfigured()) {
    throw new DatabaseUnavailableError();
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
    });
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
