-- LINE Bill Slip Bot database schema
-- Run this in PostgreSQL before wiring the cron sync service.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'expense',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_type_check
    CHECK (category_type IN ('expense', 'income', 'transfer', 'other'))
);

CREATE TABLE IF NOT EXISTS budget_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_month DATE NOT NULL,
  plan_name TEXT NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  plan_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  remark TEXT,
  source_sheet_row INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT budget_plans_amount_check CHECK (plan_amount >= 0),
  CONSTRAINT budget_plans_status_check CHECK (status IN ('active', 'inactive', 'paid', 'archived')),
  CONSTRAINT budget_plans_unique_user_month_name UNIQUE (user_id, plan_month, plan_name)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  line_message_id TEXT,
  document_type TEXT,
  expense_type TEXT NOT NULL DEFAULT 'expense',
  shop_or_bank_name TEXT,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  transaction_date DATE,
  reference_no TEXT,
  category_id BIGINT REFERENCES categories(id),
  category_text TEXT,
  description TEXT,
  raw_text TEXT,
  image_file_id TEXT,
  image_url TEXT,
  image_stored_at TIMESTAMPTZ,
  ocr_confidence NUMERIC(5,4),
  status TEXT NOT NULL DEFAULT 'confirmed',
  source_sheet_row INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  CONSTRAINT transactions_amount_check CHECK (amount >= 0),
  CONSTRAINT transactions_expense_type_check CHECK (expense_type IN ('expense', 'income', 'internal_transfer', 'excluded')),
  CONSTRAINT transactions_status_check CHECK (status IN ('confirmed', 'needs_review', 'duplicate', 'ignored')),
  CONSTRAINT transactions_ocr_confidence_check CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
  CONSTRAINT transactions_unique_user_message UNIQUE (user_id, line_message_id)
);

CREATE TABLE IF NOT EXISTS receipt_files (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  transaction_id BIGINT REFERENCES transactions(id) ON DELETE SET NULL,
  line_message_id TEXT,
  drive_file_id TEXT NOT NULL,
  drive_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT receipt_files_unique_drive_file UNIQUE (drive_file_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  CONSTRAINT sync_runs_status_check CHECK (status IN ('running', 'success', 'failed'))
);

CREATE TABLE IF NOT EXISTS sync_row_errors (
  id BIGSERIAL PRIMARY KEY,
  sync_run_id BIGINT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  sheet_row INTEGER,
  error_message TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS body_metrics (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL,
  weight NUMERIC(6,2),
  height NUMERIC(6,2),
  bmi NUMERIC(5,2),
  body_fat_pct NUMERIC(5,2),
  muscle_mass NUMERIC(6,2),
  waist NUMERIC(6,2),
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  note TEXT,
  source_sheet_row INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  CONSTRAINT body_metrics_unique_user_date UNIQUE (user_id, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date
  ON body_metrics (user_id, recorded_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date
  ON transactions (user_id, category_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_reference_no
  ON transactions (reference_no);

CREATE INDEX IF NOT EXISTS idx_transactions_source_hash
  ON transactions (source_hash);

CREATE INDEX IF NOT EXISTS idx_budget_plans_user_month
  ON budget_plans (user_id, plan_month);

CREATE INDEX IF NOT EXISTS idx_receipt_files_user_stored_at
  ON receipt_files (user_id, stored_at);

INSERT INTO categories (code, name, category_type, sort_order)
VALUES
  ('food', 'Food', 'expense', 10),
  ('fuel', 'Fuel', 'expense', 20),
  ('transport', 'Transport', 'expense', 30),
  ('shopping', 'Shopping', 'expense', 40),
  ('utility', 'Utility', 'expense', 50),
  ('health', 'Health', 'expense', 60),
  ('transfer', 'Transfer', 'expense', 70),
  ('other', 'Other', 'expense', 999)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  category_type = EXCLUDED.category_type,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

COMMIT;
