import { query } from '../db';
import { getCurrentMonthKey, getMonthBounds } from '../dates';
import { resolveUserId } from './users';

export interface Transaction {
  id: number;
  transactionDate: string;
  categoryName: string;
  categoryCode: string;
  shopOrBankName: string;
  amount: number;
  documentType: string;
  expenseType: string;
  referenceNo: string;
  description: string;
  imageUrl: string;
  ocrConfidence: number | null;
  status: string;
  syncedAt: Date | string | null;
}

export interface TransactionsData {
  userId: number | null;
  month: string;
  page: number;
  pageSize: number;
  total: number;
  rows: Transaction[];
}

export interface TransactionFilters {
  userId?: string | number | null;
  month?: string | null;
  category?: string | null;
  status?: string | null;
  search?: string | null;
  page?: number | string;
  pageSize?: number | string;
}

export async function getTransactions({
  userId,
  month,
  category,
  status,
  search,
  page = 1,
  pageSize = 25
}: TransactionFilters = {}): Promise<TransactionsData> {
  const resolvedUserId = await resolveUserId(userId);
  const bounds = getMonthBounds(month || getCurrentMonthKey());
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 25, 1), 100);

  if (!resolvedUserId) {
    return emptyTransactions(bounds.monthKey, safePage, safePageSize);
  }

  const where = [
    't.user_id = $1',
    't.transaction_date >= $2::date',
    't.transaction_date < $3::date'
  ];
  const params: any[] = [resolvedUserId, bounds.monthStart, bounds.nextMonthStart];

  if (category) {
    params.push(category);
    where.push(`COALESCE(c.code, lower(t.category_text), 'other') = lower($${params.length})`);
  }

  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    where.push(`lower(
      COALESCE(t.shop_or_bank_name, '') || ' ' ||
      COALESCE(t.reference_no, '') || ' ' ||
      COALESCE(t.description, '') || ' ' ||
      COALESCE(t.raw_text, '')
    ) LIKE $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  const countResult = await query<{ total: string | number }>(
    `SELECT COUNT(*)::int AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${whereSql}`,
    params
  );

  const offset = (safePage - 1) * safePageSize;
  const rowsResult = await query<{
    id: number;
    transaction_date: string;
    category_name: string;
    category_code: string;
    shop_or_bank_name: string | null;
    amount: string | number;
    document_type: string | null;
    expense_type: string | null;
    reference_no: string | null;
    description: string | null;
    image_url: string | null;
    ocr_confidence: string | number | null;
    status: string | null;
    synced_at: Date | string | null;
  }>(
    `SELECT
       t.id,
       t.transaction_date::text AS transaction_date,
       COALESCE(c.name, t.category_text, 'Other') AS category_name,
       COALESCE(c.code, lower(t.category_text), 'other') AS category_code,
       t.shop_or_bank_name,
       t.amount,
       t.document_type,
       t.expense_type,
       t.reference_no,
       t.description,
       t.image_url,
       t.ocr_confidence,
       t.status,
       t.synced_at
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${whereSql}
     ORDER BY t.transaction_date DESC NULLS LAST, t.created_at DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, safePageSize, offset]
  );

  return {
    userId: resolvedUserId,
    month: bounds.monthKey,
    page: safePage,
    pageSize: safePageSize,
    total: Number(countResult.rows[0]?.total || 0),
    rows: rowsResult.rows.map(mapTransaction)
  };
}

export async function getTransactionCsv(filters: TransactionFilters = {}): Promise<string> {
  const data = await getTransactions({ ...filters, page: 1, pageSize: 100 });
  const headers = [
    'Date',
    'Category',
    'ShopOrBank',
    'Amount',
    'DocumentType',
    'ExpenseType',
    'ReferenceNo',
    'Status',
    'ImageUrl'
  ];

  const lines = [
    headers.join(','),
    ...data.rows.map((row) => [
      row.transactionDate,
      row.categoryName,
      row.shopOrBankName,
      row.amount,
      row.documentType,
      row.expenseType,
      row.referenceNo,
      row.status,
      row.imageUrl
    ].map(csvCell).join(','))
  ];

  return lines.join('\n');
}

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    transactionDate: row.transaction_date,
    categoryName: row.category_name,
    categoryCode: row.category_code,
    shopOrBankName: row.shop_or_bank_name || '-',
    amount: Number(row.amount || 0),
    documentType: row.document_type || '-',
    expenseType: row.expense_type || '-',
    referenceNo: row.reference_no || '',
    description: row.description || '',
    imageUrl: row.image_url || '',
    ocrConfidence: row.ocr_confidence === null ? null : Number(row.ocr_confidence),
    status: row.status || '-',
    syncedAt: row.synced_at
  };
}

function csvCell(value: any): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function emptyTransactions(month: string, page: number, pageSize: number): TransactionsData {
  return {
    userId: null,
    month,
    page,
    pageSize,
    total: 0,
    rows: []
  };
}

