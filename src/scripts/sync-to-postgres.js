require('dotenv').config();

const crypto = require('crypto');
const { getSheetRows } = require('../services/sheets.service');
const { withTransaction, closePool } = require('../services/db.service');
const { parseAmount } = require('../utils/money.util');

const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const BUDGET_SHEET_NAME = process.env.BUDGET_SHEET_NAME || 'BudgetPlan';
const BUDGET_PAYMENT_SHEET_NAME = process.env.BUDGET_PAYMENT_SHEET_NAME || 'BudgetPayments';

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

      await finishSyncRun(client, syncRunId, 'success', {
        rowsRead: transactionStats.rowsRead + budgetStats.rowsRead + budgetPaymentStats.rowsRead,
        rowsInserted: transactionStats.rowsInserted + budgetStats.rowsInserted + budgetPaymentStats.rowsInserted,
        rowsUpdated: transactionStats.rowsUpdated + budgetStats.rowsUpdated + budgetPaymentStats.rowsUpdated,
        metadata: {
          transactionStats,
          budgetStats,
          budgetPaymentStats
        }
      });

      console.log('Sync completed:', {
        transactionStats,
        budgetStats,
        budgetPaymentStats
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

async function createSyncRun(client, startedAt) {
  const run = await client.syncRun.create({
    data: {
      jobName: 'google-sheet-to-postgres',
      startedAt: startedAt,
      status: 'running'
    }
  });

  return run.id;
}

async function finishSyncRun(client, syncRunId, status, data = {}) {
  await client.syncRun.update({
    where: { id: syncRunId },
    data: {
      finishedAt: new Date(),
      status,
      rowsRead: data.rowsRead !== undefined ? data.rowsRead : undefined,
      rowsInserted: data.rowsInserted !== undefined ? data.rowsInserted : undefined,
      rowsUpdated: data.rowsUpdated !== undefined ? data.rowsUpdated : undefined,
      errorMessage: data.errorMessage !== undefined ? data.errorMessage : undefined,
      metadata: data.metadata !== undefined ? data.metadata : undefined
    }
  });
}

async function insertRowError(client, syncRunId, sheetName, sheetRow, error, rawData) {
  await client.syncRowError.create({
    data: {
      syncRunId,
      sheetName,
      sheetRow,
      errorMessage: error.message,
      rawData: rawData ? JSON.parse(JSON.stringify(rawData)) : null
    }
  });
}

async function loadCategoryMap(client) {
  const categories = await client.category.findMany({
    where: { isActive: true },
    select: { id: true, code: true }
  });

  return categories.reduce((map, cat) => {
    map[cat.code] = cat.id;
    return map;
  }, {});
}

async function upsertUser(client, lineUserId) {
  const user = await client.appUser.upsert({
    where: { lineUserId },
    update: { updatedAt: new Date() },
    create: { lineUserId }
  });

  return user.id;
}

async function upsertTransaction(client, data) {
  const transactionData = {
    documentType: data.documentType || null,
    expenseType: data.expenseType,
    shopOrBankName: data.shopOrBankName || null,
    amount: data.amount,
    transactionDate: data.transactionDate ? new Date(data.transactionDate) : null,
    referenceNo: data.referenceNo || null,
    categoryId: data.categoryId || null,
    categoryText: data.categoryText || null,
    description: data.description || null,
    rawText: data.rawText || null,
    imageFileId: data.imageFileId || null,
    imageUrl: data.imageUrl || null,
    imageStoredAt: data.imageStoredAt || null,
    ocrConfidence: data.ocrConfidence || null,
    status: data.status,
    sourceSheetRow: data.sourceSheetRow,
    sourceHash: data.sourceHash,
    syncedAt: new Date()
  };

  if (data.lineMessageId) {
    const existing = await client.transaction.findUnique({
      where: {
        unique_user_message: {
          userId: data.userId,
          lineMessageId: data.lineMessageId
        }
      },
      select: { id: true }
    });

    if (existing) {
      await client.transaction.update({
        where: { id: existing.id },
        data: {
          ...transactionData,
          updatedAt: new Date()
        }
      });
      return 'rowsUpdated';
    } else {
      await client.transaction.create({
        data: {
          ...transactionData,
          userId: data.userId,
          lineMessageId: data.lineMessageId,
          createdAt: data.createdAt || new Date()
        }
      });
      return 'rowsInserted';
    }
  }

  const existing = await client.transaction.findFirst({
    where: {
      userId: data.userId,
      sourceHash: data.sourceHash
    },
    select: { id: true }
  });

  if (existing) {
    await client.transaction.update({
      where: { id: existing.id },
      data: {
        ...transactionData,
        updatedAt: new Date()
      }
    });
    return 'rowsUpdated';
  } else {
    await client.transaction.create({
      data: {
        ...transactionData,
        userId: data.userId,
        createdAt: data.createdAt || new Date()
      }
    });
    return 'rowsInserted';
  }
}

async function upsertBudgetPlan(client, data) {
  const planMonthDate = data.planMonth ? new Date(data.planMonth) : null;
  
  const existing = await client.budgetPlan.findUnique({
    where: {
      unique_user_month_name: {
        userId: data.userId,
        planMonth: planMonthDate,
        planName: data.planName
      }
    },
    select: { id: true }
  });

  const planData = {
    categoryId: data.categoryId || null,
    planAmount: data.planAmount,
    status: data.status,
    remark: data.remark || null,
    sourceSheetRow: data.sourceSheetRow,
    updatedAt: data.updatedAt || new Date()
  };

  if (existing) {
    await client.budgetPlan.update({
      where: { id: existing.id },
      data: planData
    });
    return 'rowsUpdated';
  } else {
    await client.budgetPlan.create({
      data: {
        ...planData,
        userId: data.userId,
        planMonth: planMonthDate,
        planName: data.planName,
        createdAt: data.createdAt || new Date()
      }
    });
    return 'rowsInserted';
  }
}

async function findBudgetPlanId(client, userId, planMonth, planName) {
  const plan = await client.budgetPlan.findFirst({
    where: {
      userId,
      planMonth: planMonth ? new Date(planMonth) : undefined,
      planName
    },
    select: { id: true }
  });

  return plan?.id || null;
}

async function upsertBudgetPayment(client, data) {
  const existing = await client.budgetPayment.findUnique({
    where: { paymentId: data.paymentId },
    select: { paymentId: true }
  });

  const paymentData = {
    userId: data.userId,
    budgetPlanId: data.budgetPlanId || null,
    planMonth: data.planMonth ? new Date(data.planMonth) : null,
    planName: data.planName,
    amount: data.amount,
    paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
    note: data.note || null,
    status: data.status,
    sourceSheetRow: data.sourceSheetRow,
    updatedAt: data.updatedAt || new Date(),
    syncedAt: new Date()
  };

  if (existing) {
    await client.budgetPayment.update({
      where: { paymentId: data.paymentId },
      data: paymentData
    });
    return 'rowsUpdated';
  } else {
    await client.budgetPayment.create({
      data: {
        ...paymentData,
        paymentId: data.paymentId,
        createdAt: data.createdAt || new Date()
      }
    });
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
