const { PrismaClient } = require('@prisma/client');

let prisma;

function getPrisma() {
  if (!prisma) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }
  return prisma;
}

async function query(text, params = []) {
  const rows = await getPrisma().$queryRawUnsafe(text, ...params);
  return { rows };
}

async function withTransaction(work) {
  return getPrisma().$transaction(async (tx) => {
    tx.query = async (text, params = []) => {
      const rows = await tx.$queryRawUnsafe(text, ...params);
      return { rows };
    };
    return work(tx);
  });
}

async function closePool() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}

module.exports = {
  getPrisma,
  query,
  withTransaction,
  closePool
};
