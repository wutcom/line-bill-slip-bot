import { query } from '../db';

export interface AppUser {
  id: number;
  line_user_id: string;
  display_name: string;
}

export async function getUsers(): Promise<AppUser[]> {
  const result = await query<AppUser>(
    `SELECT id, line_user_id, COALESCE(display_name, line_user_id) AS display_name
     FROM app_users
     WHERE is_active = TRUE
     ORDER BY updated_at DESC, id DESC`
  );

  return result.rows;
}

export async function resolveUserId(inputUserId?: number | string | null): Promise<number | null> {
  if (inputUserId) {
    const result = await query<{ id: number }>(
      `SELECT id
       FROM app_users
       WHERE id::text = $1 OR line_user_id = $1
       LIMIT 1`,
      [String(inputUserId)]
    );

    return result.rows[0]?.id || null;
  }

  const result = await query<{ id: number }>(
    `SELECT id
     FROM app_users
     WHERE is_active = TRUE
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`
  );

  return result.rows[0]?.id || null;
}

