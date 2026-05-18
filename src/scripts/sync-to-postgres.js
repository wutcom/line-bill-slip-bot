require('dotenv').config();

const crypto = require('crypto');
const { getSheetRows } = require('../services/sheets.service');
const { withTransaction, closePool } = require('../services/db.service');
const { parseAmount } = require('../utils/money.util');

const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const BUDGET_SHEET_NAME = process.env.BUDGET_SHEET_NAME || 'BudgetPlan';

const CATEGORY_CODES = {
  food: 'food',
  fuel: 'fuel',
  transport: 'transport',
  shopping: 'shopping',
  utility: 'utility',
  health: 'health',
  transfer: 'transfer',
  other: 'other'
};

async function main() {
  const startedAt = new Date();

  await withTransaction(async (client) => {
    const syncRunId = await createSyncRun(client, startedAt);

    try {
      const categoryMap = await loadCategoryMap(client);
      const transactionStats = await syncTransactions(client, categoryMap, syncRunId);
      const budgetStats = await syncBudgetPlans(client, categoryMap, syncRunId);

      await finishSyncRun(client, syncRunId, 'success', {
        rowsRead: transactionStats.rowsRead + budgetStats.rowsRead,
        rowsInserted: transactionStats.rowsInserted + budgetStats.rowsInserted,
        rowsUpdated: transactionStats.rowsUpdated + budgetStats.rowsUpdated,
        metadata: {
          transactionStats,
          budgetStats
        }
      });

      console.log('Sync completed:', {
        transactionStats,
        budgetStats
      });
    } catch (error) {
      await finishSyncRun(client, syncRunId, 'failed', {
        errorMessage: error.message
      });

      throw error;
    }
  });
}

async function syncTransactions(client, categoryMap, syncRunId) {
  const rows = await getSheetRows(TRANSACTION_SHEET_NAME, 'A:Z');
  const { headers, dataRows } = parseSheetRows(rows);
  const stats = createStats(dataRows.length);

  for (const row of dataRows) {
    try {
      const source = mapRow(headers, row.values, getLegacyTransactionHeaders());
      const userIdText = value(source, 'UserId');

      if (!userIdText) {
        continue;
      }

      const userId = await upsertUser(client, userIdText);
      const categoryText = value(source, 'Category') || 'Other';
      const categoryId = categoryMap[normalizeCategoryCode(categoryText)] || categoryMap.other;
      const lineMessageId = value(source, 'MessageId');
      const sourceHash = hashObject({
        sheet: TRANSACTION_SHEET_NAME,
        row: row.rowNumber,
        userId: userIdText,
        messageId: lineMessageId,
        referenceNo: value(source, 'ReferenceNo'),
        amount: value(source, 'Amount'),
        transactionDate: value(source, 'TransactionDate'),
        rawText: value(source, 'RawText')
      });

      const data = {
        userId,
        lineMessageId,
        documentType: normalizeDocumentType(value(source, 'DocumentType')),
        expenseType: normalizeExpenseType(value(source, 'ExpenseType'), categoryText),
        shopOrBankName: value(source, 'ShopOrBankName'),
        amount: parseAmount(value(source, 'Amount')),
        transactionDate: parseDate(value(source, 'TransactionDate')),
        referenceNo: value(source, 'ReferenceNo'),
        categoryId,
        categoryText,
        description: value(source, 'Description'),
        rawText: value(source, 'RawText'),
        imageFileId: value(source, 'ImageFileId'),
        imageUrl: value(source, 'ImageUrl'),
        imageStoredAt: parseTimestamp(value(source, 'ImageStoredAt')),
        ocrConfidence: parseNullableNumber(value(source, 'OcrConfidence')),
        status: normalizeTransactionStatus(value(source, 'Status')),
        sourceSheetRow: row.rowNumber,
        sourceHash,
        createdAt: parseTimestamp(value(source, 'CreatedAt')) || new Date()
      };

      const result = await upsertTransaction(client, data);
      stats[result]++;
    } catch (error) {
      await insertRowError(client, syncRunId, TRANSACTION_SHEET_NAME, row.rowNumber, error, row.values);
    }
  }

  return stats;
}

async function syncBudgetPlans(client, categoryMap, syncRunId) {
  const rows = await getSheetRows(BUDGET_SHEET_NAME, 'A:Z');
  const { headers, dataRows } = parseSheetRows(rows);
  const stats = createStats(dataRows.length);

  for (const row of dataRows) {
    try {
      const source = mapRow(headers, row.values, getLegacyBudgetHeaders());
      const userIdText = value(source, 'UserId');
      const planName = value(source, 'PlanName');

      if (!userIdText || !planName) {
        continue;
      }

      const userId = await upsertUser(client, userIdText);
      const planMonth = parseMonth(value(source, 'Month'));
      const categoryId = categoryMap[normalizeCategoryCode(value(source, 'Category'))] || null;

      if (!planMonth) {
        throw new Error(`Invalid budget month at row ${row.rowNumber}`);
      }

      const result = await upsertBudgetPlan(client, {
        userId,
        planMonth,
        planName,
        categoryId,
        planAmount: parseAmount(value(source, 'PlanAmount')),
        status: normalizeBudgetStatus(value(source, 'Status')),
        remark: value(source, 'Remark'),
        sourceSheetRow: row.rowNumber,
        createdAt: parseTimestamp(value(source, 'CreatedAt')) || new Date(),
        updatedAt: parseTimestamp(value(source, 'UpdatedAt')) || new Date()
      });

      stats[result]++;
    } catch (error) {
      await insertRowError(client, syncRunId, BUDGET_SHEET_NAME, row.rowNumber, error, row.values);
    }
  }

  return stats;
}

async function createSyncRun(client, startedAt) {
  const result = await client.query(
    `INSERT INTO sync_runs (job_name, started_at, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    ['google-sheet-to-postgres', startedAt]
  );

  return result.rows[0].id;
}

async function finishSyncRun(client, syncRunId, status, data = {}) {
  await client.query(
    `UPDATE sync_runs
     SET finished_at = NOW(),
         status = $2,
         rows_read = COALESCE($3, rows_read),
         rows_inserted = COALESCE($4, rows_inserted),
         rows_updated = COALESCE($5, rows_updated),
         error_message = $6,
         metadata = COALESCE($7, metadata)
     WHERE id = $1`,
    [
      syncRunId,
      status,
      data.rowsRead ?? null,
      data.rowsInserted ?? null,
      data.rowsUpdated ?? null,
      data.errorMessage ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null
    ]
  );
}

async function insertRowError(client, syncRunId, sheetName, sheetRow, error, rawData) {
  await client.query(
    `INSERT INTO sync_row_errors (sync_run_id, sheet_name, sheet_row, error_message, raw_data)
     VALUES ($1, $2, $3, $4, $5)`,
    [syncRunId, sheetName, sheetRow, error.message, JSON.stringify(rawData)]
  );
}

async function loadCategoryMap(client) {
  const result = await client.query('SELECT id, code FROM categories WHERE is_active = TRUE');

  return result.rows.reduce((map, row) => {
    map[row.code] = row.id;
    return map;
  }, {});
}

async function upsertUser(client, lineUserId) {
  const result = await client.query(
    `INSERT INTO app_users (line_user_id)
     VALUES ($1)
     ON CONFLICT (line_user_id) DO UPDATE
     SET updated_at = NOW()
     RETURNING id`,
    [lineUserId]
  );

  return result.rows[0].id;
}

async function upsertTransaction(client, data) {
  if (data.lineMessageId) {
    const result = await client.query(
      `INSERT INTO transactions (
         user_id, line_message_id, document_type, expense_type, shop_or_bank_name,
         amount, transaction_date, reference_no, category_id, category_text,
         description, raw_text, image_file_id, image_url, image_stored_at,
         ocr_confidence, status, source_sheet_row, source_hash, created_at, synced_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, NOW()
       )
       ON CONFLICT (user_id, line_message_id) DO UPDATE
       SET document_type = EXCLUDED.document_type,
           expense_type = EXCLUDED.expense_type,
           shop_or_bank_name = EXCLUDED.shop_or_bank_name,
           amount = EXCLUDED.amount,
           transaction_date = EXCLUDED.transaction_date,
           reference_no = EXCLUDED.reference_no,
           category_id = EXCLUDED.category_id,
           category_text = EXCLUDED.category_text,
           description = EXCLUDED.description,
           raw_text = EXCLUDED.raw_text,
           image_file_id = EXCLUDED.image_file_id,
           image_url = EXCLUDED.image_url,
           image_stored_at = EXCLUDED.image_stored_at,
           ocr_confidence = EXCLUDED.ocr_confidence,
           status = EXCLUDED.status,
           source_sheet_row = EXCLUDED.source_sheet_row,
           source_hash = EXCLUDED.source_hash,
           updated_at = NOW(),
           synced_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      buildTransactionParams(data)
    );

    return result.rows[0].inserted ? 'rowsInserted' : 'rowsUpdated';
  }

  const existing = await client.query(
    `SELECT id FROM transactions
     WHERE user_id = $1 AND source_hash = $2
     LIMIT 1`,
    [data.userId, data.sourceHash]
  );

  if (existing.rowCount > 0) {
    await client.query(
      `UPDATE transactions
       SET document_type = $2,
           expense_type = $3,
           shop_or_bank_name = $4,
           amount = $5,
           transaction_date = $6,
           reference_no = $7,
           category_id = $8,
           category_text = $9,
           description = $10,
           raw_text = $11,
           image_file_id = $12,
           image_url = $13,
           image_stored_at = $14,
           ocr_confidence = $15,
           status = $16,
           source_sheet_row = $17,
           source_hash = $18,
           updated_at = NOW(),
           synced_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, ...buildTransactionParams(data).slice(2, 19)]
    );

    return 'rowsUpdated';
  }

  await client.query(
    `INSERT INTO transactions (
       user_id, line_message_id, document_type, expense_type, shop_or_bank_name,
       amount, transaction_date, reference_no, category_id, category_text,
       description, raw_text, image_file_id, image_url, image_stored_at,
       ocr_confidence, status, source_sheet_row, source_hash, created_at, synced_at
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, NOW()
     )`,
    buildTransactionParams(data)
  );

  return 'rowsInserted';
}

function buildTransactionParams(data) {
  return [
    data.userId,
    data.lineMessageId || null,
    data.documentType || null,
    data.expenseType,
    data.shopOrBankName || null,
    data.amount,
    data.transactionDate,
    data.referenceNo || null,
    data.categoryId || null,
    data.categoryText || null,
    data.description || null,
    data.rawText || null,
    data.imageFileId || null,
    data.imageUrl || null,
    data.imageStoredAt,
    data.ocrConfidence,
    data.status,
    data.sourceSheetRow,
    data.sourceHash,
    data.createdAt
  ];
}

async function upsertBudgetPlan(client, data) {
  const result = await client.query(
    `INSERT INTO budget_plans (
       user_id, plan_month, plan_name, category_id, plan_amount,
       status, remark, source_sheet_row, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, plan_month, plan_name) DO UPDATE
     SET category_id = EXCLUDED.category_id,
         plan_amount = EXCLUDED.plan_amount,
         status = EXCLUDED.status,
         remark = EXCLUDED.remark,
         source_sheet_row = EXCLUDED.source_sheet_row,
         updated_at = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [
      data.userId,
      data.planMonth,
      data.planName,
      data.categoryId,
      data.planAmount,
      data.status,
      data.remark || null,
      data.sourceSheetRow,
      data.createdAt,
      data.updatedAt
    ]
  );

  return result.rows[0].inserted ? 'rowsInserted' : 'rowsUpdated';
}

function parseSheetRows(rows) {
  if (!rows || rows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const headers = rows[0].map((header) => String(header || '').trim());
  const dataRows = rows.slice(1)
    .map((values, index) => ({
      rowNumber: index + 2,
      values
    }))
    .filter((row) => row.values.some((cell) => String(cell || '').trim() !== ''));

  return { headers, dataRows };
}

function mapRow(headers, row, fallbackHeaders) {
  const effectiveHeaders = hasKnownHeader(headers)
    ? headers
    : fallbackHeaders;

  return effectiveHeaders.reduce((mapped, header, index) => {
    mapped[normalizeHeader(header)] = row[index] || '';
    return mapped;
  }, {});
}

function hasKnownHeader(headers) {
  const normalized = headers.map(normalizeHeader);

  return normalized.includes('userid') || normalized.includes('messageid') || normalized.includes('planname');
}

function value(source, name) {
  return String(source[normalizeHeader(name)] || '').trim();
}

function normalizeHeader(header) {
  return String(header || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function getLegacyTransactionHeaders() {
  return [
    'CreatedAt',
    'MessageId',
    'UserId',
    'DocumentType',
    'ShopOrBankName',
    'Amount',
    'TransactionDate',
    'ReferenceNo',
    'Category',
    'Description',
    'RawText'
  ];
}

function getLegacyBudgetHeaders() {
  return [
    'Month',
    'UserId',
    'PlanName',
    'PlanAmount',
    'PaidAmount',
    'Remaining',
    'Status',
    'CreatedAt',
    'UpdatedAt'
  ];
}

function createStats(rowsRead) {
  return {
    rowsRead,
    rowsInserted: 0,
    rowsUpdated: 0
  };
}

function normalizeCategoryCode(category) {
  const code = String(category || 'other').trim().toLowerCase();

  return CATEGORY_CODES[code] || 'other';
}

function normalizeDocumentType(documentType) {
  const text = String(documentType || '').trim().toLowerCase();

  if (text.includes('transfer') || text.includes('โอน')) return 'transfer_slip';
  if (text.includes('bill') || text.includes('receipt') || text.includes('บิล')) return 'receipt';
  return documentType || null;
}

function normalizeExpenseType(expenseType, categoryText) {
  const text = String(expenseType || '').trim().toLowerCase();

  if (['income', 'internal_transfer', 'excluded'].includes(text)) return text;
  if (normalizeCategoryCode(categoryText) === 'transfer') return 'expense';
  return 'expense';
}

function normalizeTransactionStatus(status) {
  const text = String(status || '').trim().toLowerCase();

  if (['needs_review', 'duplicate', 'ignored'].includes(text)) return text;
  return 'confirmed';
}

function normalizeBudgetStatus(status) {
  const text = String(status || '').trim().toLowerCase();

  if (['inactive', 'paid', 'archived'].includes(text)) return text;
  return 'active';
}

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;

  match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return buildIsoDate(match[1], match[2], match[3]);

  match = text.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
  if (match) {
    const month = getThaiMonthNumber(match[2]);
    if (month) return buildIsoDate(match[1], month, match[3]);
  }

  return null;
}

function parseMonth(value) {
  if (!value) return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{1,2})/);

  if (!match) return null;

  return `${match[1]}-${pad2(match[2])}-01`;
}

function parseTimestamp(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function buildIsoDate(day, month, year) {
  let y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (y > 2400) y -= 543;
  if (!y || !m || !d) return null;

  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function getThaiMonthNumber(monthText) {
  const key = String(monthText).replace(/\s/g, '');
  const months = {
    'ม.ค.': 1, 'มค': 1, 'มกราคม': 1,
    'ก.พ.': 2, 'กพ': 2, 'กุมภาพันธ์': 2,
    'มี.ค.': 3, 'มีค': 3, 'มีนาคม': 3,
    'เม.ย.': 4, 'เมย': 4, 'เมษายน': 4,
    'พ.ค.': 5, 'พค': 5, 'พฤษภาคม': 5,
    'มิ.ย.': 6, 'มิย': 6, 'มิถุนายน': 6,
    'ก.ค.': 7, 'กค': 7, 'กรกฎาคม': 7,
    'ส.ค.': 8, 'สค': 8, 'สิงหาคม': 8,
    'ก.ย.': 9, 'กย': 9, 'กันยายน': 9,
    'ต.ค.': 10, 'ตค': 10, 'ตุลาคม': 10,
    'พ.ย.': 11, 'พย': 11, 'พฤศจิกายน': 11,
    'ธ.ค.': 12, 'ธค': 12, 'ธันวาคม': 12
  };

  return months[key] || null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function hashObject(data) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

main()
  .catch((error) => {
    console.error('Sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
