const { query } = require('../db');

async function getUsers() {
  const result = await query(
    `SELECT id, line_user_id, COALESCE(display_name, line_user_id) AS display_name
     FROM app_users
     WHERE is_active = TRUE
     ORDER BY updated_at DESC, id DESC`
  );

  return result.rows;
}

async function resolveUserId(inputUserId) {
  if (inputUserId) {
    const result = await query(
      `SELECT id
       FROM app_users
       WHERE id::text = $1 OR line_user_id = $1
       LIMIT 1`,
      [String(inputUserId)]
    );

    return result.rows[0]?.id || null;
  }

  const result = await query(
    `SELECT id
     FROM app_users
     WHERE is_active = TRUE
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`
  );

  return result.rows[0]?.id || null;
}

module.exports = {
  getUsers,
  resolveUserId
};
