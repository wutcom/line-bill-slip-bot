require('dotenv').config();

const crypto = require('crypto');
const { getSheetRows } = require('../services/sheets.service');
const { withTransaction, closePool } = require('../services/db.service');
const { parseAmount } = require('../utils/money.util');

const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const BUDGET_SHEET_NAME = process.env.BUDGET_SHEET_NAME || 'BudgetPlan';
const BUDGET_PAYMENT_SHEET_NAME = process.env.BUDGET_PAYMENT_SHEET_NAME || 'BudgetPayments';
const BODY_METRICS_SHEET_NAME = process.env.BODY_METRICS_SHEET_NAME || 'BodyMetrics';
const FOOD_LOGS_SHEET_NAME = process.env.NUTRITION_LOGS_SHEET_NAME || 'NutritionLogs';

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
      const budgetPaymentStats = await syncBudgetPayments(client, syncRunId);
      const bodyMetricsStats = await syncBodyMetrics(client, syncRunId);
      const foodLogStats = await syncFoodLogs(client, syncRunId);

      await finishSyncRun(client, syncRunId, 'success', {
        rowsRead: transactionStats.rowsRead + budgetStats.rowsRead + budgetPaymentStats.rowsRead + bodyMetricsStats.rowsRead + foodLogStats.rowsRead,
        rowsInserted: transactionStats.rowsInserted + budgetStats.rowsInserted + budgetPaymentStats.rowsInserted + bodyMetricsStats.rowsInserted + foodLogStats.rowsInserted,
        rowsUpdated: transactionStats.rowsUpdated + budgetStats.rowsUpdated + budgetPaymentStats.rowsUpdated + bodyMetricsStats.rowsUpdated + foodLogStats.rowsUpdated,
        metadata: {
          transactionStats,
          budgetStats,
          budgetPaymentStats,
          bodyMetricsStats,
          foodLogStats
        }
      });

      console.log('Sync completed:', {
        transactionStats,
        budgetStats,
        budgetPaymentStats,
        bodyMetricsStats,
        foodLogStats
      });
    } catch (error) {
      console.error('Original sync error occurred:', error);
      try {
        await finishSyncRun(client, syncRunId, 'failed', {
          errorMessage: error.message
        });
      } catch (finishError) {
        console.error('Failed to record finishSyncRun due to transaction abort:', finishError);
      }

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
      console.error('upsertTransaction error:', error);
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

async function syncBudgetPayments(client, syncRunId) {
  const rows = await getSheetRows(BUDGET_PAYMENT_SHEET_NAME, 'A:Z');
  const { headers, dataRows } = parseSheetRows(rows);
  const stats = createStats(dataRows.length);

  for (const row of dataRows) {
    try {
      const source = mapRow(headers, row.values, getLegacyBudgetPaymentHeaders());
      const paymentId = value(source, 'PaymentId');
      const userIdText = value(source, 'UserId');
      const planName = value(source, 'PlanName');

      if (!paymentId || !userIdText || !planName) {
        continue;
      }

      const userId = await upsertUser(client, userIdText);
      const planMonth = parseMonth(value(source, 'PlanMonth'));

      if (!planMonth) {
        throw new Error(`Invalid budget payment month at row ${row.rowNumber}`);
      }

      const budgetPlanId = await findBudgetPlanId(client, userId, planMonth, planName);
      const result = await upsertBudgetPayment(client, {
        paymentId,
        userId,
        budgetPlanId,
        planMonth,
        planName,
        amount: parseAmount(value(source, 'Amount')),
        paymentDate: parseDate(value(source, 'PaymentDate')),
        note: value(source, 'Note'),
        status: normalizeBudgetPaymentStatus(value(source, 'Status')),
        sourceSheetRow: row.rowNumber,
        createdAt: parseTimestamp(value(source, 'CreatedAt')) || new Date(),
        updatedAt: parseTimestamp(value(source, 'UpdatedAt')) || new Date()
      });

      stats[result]++;
    } catch (error) {
      await insertRowError(client, syncRunId, BUDGET_PAYMENT_SHEET_NAME, row.rowNumber, error, row.values);
    }
  }

  return stats;
}

async function syncBodyMetrics(client, syncRunId) {
  const rows = await getSheetRows(BODY_METRICS_SHEET_NAME, 'A:Z');
  const { headers, dataRows } = parseSheetRows(rows);
  const stats = createStats(dataRows.length);

  for (const row of dataRows) {
    try {
      const source = mapRow(headers, row.values, getLegacyBodyMetricsHeaders());
      const userIdText = value(source, 'UserId');

      if (!userIdText) {
        continue;
      }

      const userId = await upsertUser(client, userIdText);
      const recordedDate = parseDate(value(source, 'RecordedDate'));

      if (!recordedDate) {
        throw new Error(`Invalid recorded date at row ${row.rowNumber}`);
      }

      const weightVal = parseNullableNumber(value(source, 'Weight'));
      const heightVal = parseNullableNumber(value(source, 'Height'));
      const bmiVal = parseNullableNumber(value(source, 'BMI')) || computeBmi(weightVal, heightVal);

      const sourceHash = hashObject({
        sheet: BODY_METRICS_SHEET_NAME,
        row: row.rowNumber,
        userId: userIdText,
        recordedDate,
        weight: weightVal,
        height: heightVal
      });

      const result = await upsertBodyMetric(client, {
        userId,
        recordedDate,
        weight: weightVal,
        height: heightVal,
        bmi: bmiVal,
        bodyFatPct: parseNullableNumber(value(source, 'BodyFatPct')),
        muscleMass: parseNullableNumber(value(source, 'MuscleMass')),
        waist: parseNullableNumber(value(source, 'Waist')),
        bpSystolic: parseNullableInt(value(source, 'BpSystolic')),
        bpDiastolic: parseNullableInt(value(source, 'BpDiastolic')),
        note: value(source, 'Note'),
        sourceSheetRow: row.rowNumber,
        sourceHash
      });

      stats[result]++;
    } catch (error) {
      await insertRowError(client, syncRunId, BODY_METRICS_SHEET_NAME, row.rowNumber, error, row.values);
    }
  }

  return stats;
}

async function upsertBodyMetric(client, data) {
  const recordedDateObj = data.recordedDate ? new Date(data.recordedDate) : null;

  const existingRes = await client.query(
    `SELECT id FROM body_metrics WHERE user_id = $1 AND recorded_date = $2`,
    [data.userId, recordedDateObj]
  );

  if (existingRes.rows.length > 0) {
    const existingId = existingRes.rows[0].id;
    await client.query(
      `UPDATE body_metrics
       SET weight = $1, height = $2, bmi = $3, body_fat_pct = $4, muscle_mass = $5,
           waist = $6, bp_systolic = $7, bp_diastolic = $8, note = $9,
           source_sheet_row = $10, source_hash = $11, synced_at = $12, updated_at = $13
       WHERE id = $14`,
      [
        data.weight,
        data.height,
        data.bmi,
        data.bodyFatPct,
        data.muscleMass,
        data.waist,
        data.bpSystolic,
        data.bpDiastolic,
        data.note || null,
        data.sourceSheetRow,
        data.sourceHash,
        new Date(), // syncedAt
        new Date(), // updatedAt
        existingId
      ]
    );
    return 'rowsUpdated';
  } else {
    await client.query(
      `INSERT INTO body_metrics (
         user_id, recorded_date, weight, height, bmi, body_fat_pct, muscle_mass,
         waist, bp_systolic, bp_diastolic, note, source_sheet_row, source_hash,
         synced_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        data.userId,
        recordedDateObj,
        data.weight,
        data.height,
        data.bmi,
        data.bodyFatPct,
        data.muscleMass,
        data.waist,
        data.bpSystolic,
        data.bpDiastolic,
        data.note || null,
        data.sourceSheetRow,
        data.sourceHash,
        new Date(), // syncedAt
        new Date(), // createdAt
        new Date() // updatedAt
      ]
    );
    return 'rowsInserted';
  }
}

function computeBmi(weight, height) {
  if (!weight || !height) return null;
  const heightM = height > 3 ? height / 100 : height;
  if (heightM <= 0) return null;
  return Math.round((weight / (heightM * heightM)) * 100) / 100;
}

function parseNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

async function createSyncRun(client, startedAt) {
  const res = await client.query(
    `INSERT INTO sync_runs (job_name, started_at, status) 
     VALUES ($1, $2, $3) 
     RETURNING id`,
    ['google-sheet-to-postgres', startedAt, 'running']
  );
  return res.rows[0].id;
}

async function finishSyncRun(client, syncRunId, status, data = {}) {
  const fields = ['finished_at = $1', 'status = $2'];
  const values = [new Date(), status];
  let paramIndex = 3;

  if (data.rowsRead !== undefined) {
    fields.push(`rows_read = $${paramIndex++}`);
    values.push(data.rowsRead);
  }
  if (data.rowsInserted !== undefined) {
    fields.push(`rows_inserted = $${paramIndex++}`);
    values.push(data.rowsInserted);
  }
  if (data.rowsUpdated !== undefined) {
    fields.push(`rows_updated = $${paramIndex++}`);
    values.push(data.rowsUpdated);
  }
  if (data.errorMessage !== undefined) {
    fields.push(`error_message = $${paramIndex++}`);
    values.push(data.errorMessage);
  }
  if (data.metadata !== undefined) {
    fields.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(data.metadata));
  }

  values.push(syncRunId);
  const queryText = `UPDATE sync_runs SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await client.query(queryText, values);
}

async function insertRowError(client, syncRunId, sheetName, sheetRow, error, rawData) {
  await client.query(
    `INSERT INTO sync_row_errors (sync_run_id, sheet_name, sheet_row, error_message, raw_data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      syncRunId,
      sheetName,
      sheetRow,
      error.message,
      rawData ? JSON.stringify(rawData) : null,
      new Date()
    ]
  );
}

async function loadCategoryMap(client) {
  const res = await client.query(
    `SELECT id, code FROM categories WHERE is_active = true`
  );
  return res.rows.reduce((map, cat) => {
    map[cat.code] = cat.id;
    return map;
  }, {});
}

async function upsertUser(client, lineUserId) {
  const res = await client.query(
    `INSERT INTO app_users (line_user_id, updated_at)
     VALUES ($1, $2)
     ON CONFLICT (line_user_id) 
     DO UPDATE SET updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [lineUserId, new Date()]
  );
  return res.rows[0].id;
}

async function upsertTransaction(client, data) {
  if (data.lineMessageId) {
    const existingRes = await client.query(
      `SELECT id FROM transactions WHERE user_id = $1 AND line_message_id = $2`,
      [data.userId, data.lineMessageId]
    );

    if (existingRes.rows.length > 0) {
      const existingId = existingRes.rows[0].id;
      await client.query(
        `UPDATE transactions
         SET document_type = $1, expense_type = $2, shop_or_bank_name = $3, amount = $4,
             transaction_date = $5, reference_no = $6, category_id = $7, category_text = $8,
             description = $9, raw_text = $10, image_file_id = $11, image_url = $12,
             image_stored_at = $13, ocr_confidence = $14, status = $15, source_sheet_row = $16,
             source_hash = $17, synced_at = $18, updated_at = $19
         WHERE id = $20`,
        [
          data.documentType || null,
          data.expenseType,
          data.shopOrBankName || null,
          data.amount,
          data.transactionDate ? new Date(data.transactionDate) : null,
          data.referenceNo || null,
          data.categoryId || null,
          data.categoryText || null,
          data.description || null,
          data.rawText || null,
          data.imageFileId || null,
          data.imageUrl || null,
          data.imageStoredAt || null,
          data.ocrConfidence || null,
          data.status,
          data.sourceSheetRow,
          data.sourceHash,
          new Date(), // syncedAt
          new Date(), // updatedAt
          existingId
        ]
      );
      return 'rowsUpdated';
    } else {
      await client.query(
        `INSERT INTO transactions (
           user_id, line_message_id, document_type, expense_type, shop_or_bank_name, amount,
           transaction_date, reference_no, category_id, category_text, description, raw_text,
           image_file_id, image_url, image_stored_at, ocr_confidence, status, source_sheet_row,
           source_hash, synced_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          data.userId,
          data.lineMessageId,
          data.documentType || null,
          data.expenseType,
          data.shopOrBankName || null,
          data.amount,
          data.transactionDate ? new Date(data.transactionDate) : null,
          data.referenceNo || null,
          data.categoryId || null,
          data.categoryText || null,
          data.description || null,
          data.rawText || null,
          data.imageFileId || null,
          data.imageUrl || null,
          data.imageStoredAt || null,
          data.ocrConfidence || null,
          data.status,
          data.sourceSheetRow,
          data.sourceHash,
          new Date(), // syncedAt
          data.createdAt || new Date(), // createdAt
          new Date() // updatedAt
        ]
      );
      return 'rowsInserted';
    }
  }

  const existingRes = await client.query(
    `SELECT id FROM transactions WHERE user_id = $1 AND source_hash = $2`,
    [data.userId, data.sourceHash]
  );

  if (existingRes.rows.length > 0) {
    const existingId = existingRes.rows[0].id;
    await client.query(
      `UPDATE transactions
       SET document_type = $1, expense_type = $2, shop_or_bank_name = $3, amount = $4,
           transaction_date = $5, reference_no = $6, category_id = $7, category_text = $8,
           description = $9, raw_text = $10, image_file_id = $11, image_url = $12,
           image_stored_at = $13, ocr_confidence = $14, status = $15, source_sheet_row = $16,
           source_hash = $17, synced_at = $18, updated_at = $19
       WHERE id = $20`,
      [
        data.documentType || null,
        data.expenseType,
        data.shopOrBankName || null,
        data.amount,
        data.transactionDate ? new Date(data.transactionDate) : null,
        data.referenceNo || null,
        data.categoryId || null,
        data.categoryText || null,
        data.description || null,
        data.rawText || null,
        data.imageFileId || null,
        data.imageUrl || null,
        data.imageStoredAt || null,
        data.ocrConfidence || null,
        data.status,
        data.sourceSheetRow,
        data.sourceHash,
        new Date(), // syncedAt
        new Date(), // updatedAt
        existingId
      ]
    );
    return 'rowsUpdated';
  } else {
    await client.query(
      `INSERT INTO transactions (
         user_id, line_message_id, document_type, expense_type, shop_or_bank_name, amount,
         transaction_date, reference_no, category_id, category_text, description, raw_text,
         image_file_id, image_url, image_stored_at, ocr_confidence, status, source_sheet_row,
         source_hash, synced_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        data.userId,
        null, // lineMessageId
        data.documentType || null,
        data.expenseType,
        data.shopOrBankName || null,
        data.amount,
        data.transactionDate ? new Date(data.transactionDate) : null,
        data.referenceNo || null,
        data.categoryId || null,
        data.categoryText || null,
        data.description || null,
        data.rawText || null,
        data.imageFileId || null,
        data.imageUrl || null,
        data.imageStoredAt || null,
        data.ocrConfidence || null,
        data.status,
        data.sourceSheetRow,
        data.sourceHash,
        new Date(), // syncedAt
        data.createdAt || new Date(), // createdAt
        new Date() // updatedAt
      ]
    );
    return 'rowsInserted';
  }
}

async function upsertBudgetPlan(client, data) {
  const planMonthDate = data.planMonth ? new Date(data.planMonth) : null;

  const existingRes = await client.query(
    `SELECT id FROM budget_plans WHERE user_id = $1 AND plan_month = $2 AND plan_name = $3`,
    [data.userId, planMonthDate, data.planName]
  );

  if (existingRes.rows.length > 0) {
    const existingId = existingRes.rows[0].id;
    await client.query(
      `UPDATE budget_plans
       SET category_id = $1, plan_amount = $2, status = $3, remark = $4,
           source_sheet_row = $5, updated_at = $6
       WHERE id = $7`,
      [
        data.categoryId || null,
        data.planAmount,
        data.status,
        data.remark || null,
        data.sourceSheetRow,
        data.updatedAt || new Date(),
        existingId
      ]
    );
    return 'rowsUpdated';
  } else {
    await client.query(
      `INSERT INTO budget_plans (
         user_id, plan_month, plan_name, category_id, plan_amount, status, remark,
         source_sheet_row, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        data.userId,
        planMonthDate,
        data.planName,
        data.categoryId || null,
        data.planAmount,
        data.status,
        data.remark || null,
        data.sourceSheetRow,
        data.createdAt || new Date(),
        data.updatedAt || new Date()
      ]
    );
    return 'rowsInserted';
  }
}

async function findBudgetPlanId(client, userId, planMonth, planName) {
  const planMonthDate = planMonth ? new Date(planMonth) : null;
  const res = await client.query(
    `SELECT id FROM budget_plans 
     WHERE user_id = $1 AND (plan_month = $2 OR $2 IS NULL) AND plan_name = $3
     LIMIT 1`,
    [userId, planMonthDate, planName]
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

async function upsertBudgetPayment(client, data) {
  const existingRes = await client.query(
    `SELECT payment_id FROM budget_payments WHERE payment_id = $1`,
    [data.paymentId]
  );

  if (existingRes.rows.length > 0) {
    await client.query(
      `UPDATE budget_payments
       SET user_id = $1, budget_plan_id = $2, plan_month = $3, plan_name = $4,
           amount = $5, payment_date = $6, note = $7, status = $8,
           source_sheet_row = $9, updated_at = $10, synced_at = $11
       WHERE payment_id = $12`,
      [
        data.userId,
        data.budgetPlanId || null,
        data.planMonth ? new Date(data.planMonth) : null,
        data.planName,
        data.amount,
        data.paymentDate ? new Date(data.paymentDate) : null,
        data.note || null,
        data.status,
        data.sourceSheetRow,
        data.updatedAt || new Date(),
        new Date(), // syncedAt
        data.paymentId
      ]
    );
    return 'rowsUpdated';
  } else {
    await client.query(
      `INSERT INTO budget_payments (
         payment_id, user_id, budget_plan_id, plan_month, plan_name, amount,
         payment_date, note, status, source_sheet_row, created_at, updated_at, synced_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        data.paymentId,
        data.userId,
        data.budgetPlanId || null,
        data.planMonth ? new Date(data.planMonth) : null,
        data.planName,
        data.amount,
        data.paymentDate ? new Date(data.paymentDate) : null,
        data.note || null,
        data.status,
        data.sourceSheetRow,
        data.createdAt || new Date(),
        data.updatedAt || new Date(),
        new Date() // syncedAt
      ]
    );
    return 'rowsInserted';
  }
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

  return normalized.includes('userid') || normalized.includes('messageid') || normalized.includes('planname') || normalized.includes('recordeddate') || normalized.includes('detectedfood') || normalized.includes('logdate');
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
    'RawText',
    'ImageFileId',
    'ImageUrl',
    'ImageStoredAt',
    'OcrConfidence'
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

function getLegacyBudgetPaymentHeaders() {
  return [
    'PaymentId',
    'PlanMonth',
    'UserId',
    'PlanName',
    'Amount',
    'PaymentDate',
    'Note',
    'Status',
    'CreatedAt',
    'UpdatedAt'
  ];
}

function getLegacyBodyMetricsHeaders() {
  return [
    'RecordedDate',
    'UserId',
    'Weight',
    'Height',
    'BMI',
    'BodyFatPct',
    'MuscleMass',
    'Waist',
    'BpSystolic',
    'BpDiastolic',
    'Note'
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

function normalizeBudgetPaymentStatus(status) {
  const text = String(status || '').trim().toLowerCase();

  if (text === 'deleted') return 'deleted';
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

// Ensure database query numeric parameter parsing parses values correctly
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

async function syncFoodLogs(client, syncRunId) {
  const rows = await getSheetRows(FOOD_LOGS_SHEET_NAME, 'A:Z');
  const { headers, dataRows } = parseSheetRows(rows);
  const stats = createStats(dataRows.length);

  const requiredHeaders = [
    'CreatedAt', 'MessageId', 'UserId', 'LogDate', 'MealName', 'SourceType', 
    'DetectedFood', 'UserPortionText', 'EstimatedKcal', 'EstimatedKcalMin', 
    'EstimatedKcalMax', 'ProteinG', 'ProteinGoalG', 'CarbG', 'CarbGoalG', 
    'FatG', 'FatGoalG', 'WeightKg', 'WaistInch', 'SugarLevel', 'SodiumLevel', 
    'Confidence', 'Note', 'RawText'
  ];
  
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const req of requiredHeaders) {
    if (!normalizedHeaders.includes(normalizeHeader(req))) {
      throw new Error(`Missing required header: ${req}`);
    }
  }

  for (const row of dataRows) {
    try {
      const source = mapRow(headers, row.values, requiredHeaders);
      const logDateText = value(source, 'LogDate');
      const logDate = parseDate(logDateText);

      if (!logDate) {
        console.warn(`Skipping row ${row.rowNumber} due to invalid LogDate: "${logDateText}"`);
        continue;
      }

      const messageId = value(source, 'MessageId');
      let sourceRowId = messageId ? `${messageId}_${logDate}` : `row_${row.rowNumber}`;
      
      const data = {
        sourceRowId,
        createdAt: parseTimestamp(value(source, 'CreatedAt')),
        messageId: messageId || null,
        userId: value(source, 'UserId') || null,
        logDate: new Date(logDate),
        mealName: value(source, 'MealName') || null,
        sourceType: value(source, 'SourceType') || null,
        detectedFood: value(source, 'DetectedFood') || null,
        userPortionText: value(source, 'UserPortionText') || null,
        estimatedKcal: parseNullableNumber(value(source, 'EstimatedKcal')),
        estimatedKcalMin: parseNullableNumber(value(source, 'EstimatedKcalMin')),
        estimatedKcalMax: parseNullableNumber(value(source, 'EstimatedKcalMax')),
        proteinG: parseNullableNumber(value(source, 'ProteinG')),
        proteinGoalG: parseNullableNumber(value(source, 'ProteinGoalG')),
        carbG: parseNullableNumber(value(source, 'CarbG')),
        carbGoalG: parseNullableNumber(value(source, 'CarbGoalG')),
        fatG: parseNullableNumber(value(source, 'FatG')),
        fatGoalG: parseNullableNumber(value(source, 'FatGoalG')),
        weightKg: parseNullableNumber(value(source, 'WeightKg')),
        waistInch: parseNullableNumber(value(source, 'WaistInch')),
        sugarLevel: value(source, 'SugarLevel') || null,
        sodiumLevel: value(source, 'SodiumLevel') || null,
        confidence: parseNullableNumber(value(source, 'Confidence')),
        note: value(source, 'Note') || null,
        rawText: value(source, 'RawText') || null,
        source: 'google_sheet'
      };

      const result = await upsertFoodLog(client, data);
      stats[result]++;
    } catch (error) {
      console.error('upsertFoodLog error at row:', row.rowNumber, error);
      await insertRowError(client, syncRunId, FOOD_LOGS_SHEET_NAME, row.rowNumber, error, row.values);
    }
  }

  return stats;
}

async function upsertFoodLog(client, data) {
  const existingRes = await client.query(
    `SELECT id FROM food_logs WHERE source_row_id = $1`,
    [data.sourceRowId]
  );

  if (existingRes.rows.length > 0) {
    const existingId = existingRes.rows[0].id;
    await client.query(
      `UPDATE food_logs
       SET created_at = $1, message_id = $2, user_id = $3, log_date = $4,
           meal_name = $5, source_type = $6, detected_food = $7, user_portion_text = $8,
           estimated_kcal = $9, estimated_kcal_min = $10, estimated_kcal_max = $11,
           protein_g = $12, protein_goal_g = $13, carb_g = $14, carb_goal_g = $15,
           fat_g = $16, fat_goal_g = $17, weight_kg = $18, waist_inch = $19,
           sugar_level = $20, sodium_level = $21, confidence = $22, note = $23,
           raw_text = $24, source = $25, updated_at = $26
       WHERE id = $27`,
      [
        data.createdAt,
        data.messageId,
        data.userId,
        data.logDate,
        data.mealName,
        data.sourceType,
        data.detectedFood,
        data.userPortionText,
        data.estimatedKcal,
        data.estimatedKcalMin,
        data.estimatedKcalMax,
        data.proteinG,
        data.proteinGoalG,
        data.carbG,
        data.carbGoalG,
        data.fatG,
        data.fatGoalG,
        data.weightKg,
        data.waistInch,
        data.sugarLevel,
        data.sodiumLevel,
        data.confidence,
        data.note,
        data.rawText,
        data.source,
        new Date(), // updatedAt
        existingId
      ]
    );
    return 'rowsUpdated';
  } else {
    await client.query(
      `INSERT INTO food_logs (
         source_row_id, created_at, message_id, user_id, log_date, meal_name,
         source_type, detected_food, user_portion_text, estimated_kcal, estimated_kcal_min,
         estimated_kcal_max, protein_g, protein_goal_g, carb_g, carb_goal_g, fat_g,
         fat_goal_g, weight_kg, waist_inch, sugar_level, sodium_level, confidence,
         note, raw_text, source, synced_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      [
        data.sourceRowId,
        data.createdAt || new Date(),
        data.messageId,
        data.userId,
        data.logDate,
        data.mealName,
        data.sourceType,
        data.detectedFood,
        data.userPortionText,
        data.estimatedKcal,
        data.estimatedKcalMin,
        data.estimatedKcalMax,
        data.proteinG,
        data.proteinGoalG,
        data.carbG,
        data.carbGoalG,
        data.fatG,
        data.fatGoalG,
        data.weightKg,
        data.waistInch,
        data.sugarLevel,
        data.sodiumLevel,
        data.confidence,
        data.note,
        data.rawText,
        data.source,
        new Date(), // syncedAt
        new Date() // updatedAt
      ]
    );
    return 'rowsInserted';
  }
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
