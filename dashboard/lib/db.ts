import { Pool, QueryResult, QueryResultRow } from 'pg';

let pool: Pool | undefined;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the dashboard');
  }

  return databaseUrl;
}

function shouldUseSsl(databaseUrl: string): boolean {
  return databaseUrl.includes('sslmode=require') || databaseUrl.includes('render.com');
}

function getPool(): Pool {
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

export async function query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}


