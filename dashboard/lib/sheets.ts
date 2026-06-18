import { google } from 'googleapis';

function getGoogleAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsClient() {
  return google.sheets({
    version: 'v4',
    auth: getGoogleAuth()
  });
}

async function getSheetRows(sheetName: string, range: string = 'A:K') {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`
  });

  return response.data.values || [];
}

async function updateRows(sheetName: string, range: string, values: any[][]) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

function parseColumnRange(range: string) {
  const match = String(range || '').match(/^([A-Z]+)(?::([A-Z]+))?$/i);

  if (!match) {
    throw new Error(`Unsupported append range: ${range}`);
  }

  const startColumn = match[1].toUpperCase();
  const endColumn = (match[2] || match[1]).toUpperCase();

  return {
    startColumn,
    endColumn
  };
}

function findNextRow(rows: any[][]) {
  for (let index = rows.length - 1; index >= 0; index--) {
    const hasValue = (rows[index] || []).some((cell) => String(cell || '').trim() !== '');

    if (hasValue) {
      return index + 2;
    }
  }

  return 1;
}

export async function appendRows(sheetName: string, range: string, values: any[][]) {
  const { startColumn, endColumn } = parseColumnRange(range);
  const existingRows = await getSheetRows(sheetName, `${startColumn}:${endColumn}`);
  const nextRow = findNextRow(existingRows);
  const targetRange = `${startColumn}${nextRow}:${endColumn}${nextRow + values.length - 1}`;

  await updateRows(sheetName, targetRange, values);
}
