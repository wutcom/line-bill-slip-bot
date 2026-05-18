# line-bill-slip-bot

LINE OA bot for reading bill / transfer slip images, saving OCR results to Google Sheets, and syncing data to PostgreSQL for reporting.

## Run Webhook Service

```bash
npm start
```

## Run Google Sheet to PostgreSQL Sync

```bash
npm run sync:postgres
```

Render Cron Job command:

```bash
npm run sync:postgres
```

Recommended schedule:

```text
0 23 * * *
```

This is 06:00 Asia/Bangkok when Render runs cron in UTC.

## Required Env Vars

Use `.env.example` as the template.

```text
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SHEET_NAME
BUDGET_SHEET_NAME
DATABASE_URL
```

For Render PostgreSQL external URLs, include SSL:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

## Database Setup

Run this file once in PostgreSQL:

```text
database-schema.sql
```
