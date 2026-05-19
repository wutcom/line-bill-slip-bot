const { Pool } = require('pg');

let pool;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the dashboard');
  }

  return databaseUrl;
}

function shouldUseSsl(databaseUrl) {
  return databaseUrl.includes('sslmode=require') || databaseUrl.includes('render.com');
}

function getPool() {
  if (!pool) {
    const connectionString = getDatabaseUrl();

    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString)
        ? { rejectUnauthorized: false }
        : undefined
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

module.exports = {
  query
};
