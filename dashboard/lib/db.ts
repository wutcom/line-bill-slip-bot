import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export interface QueryResult<T> {
  rows: T[];
}

export async function query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  const rows = await prisma.$queryRawUnsafe<T[]>(text, ...params);
  return { rows };
}
