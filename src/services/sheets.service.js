const { google } = require('googleapis');

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

async function getSheetRows(sheetName, range = 'A:K') {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`
  });

  return response.data.values || [];
}

async function appendRows(sheetName, range, values) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

async function ensureSheetWithHeaders(sheetName, headers) {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title'
  });

  const exists = (spreadsheet.data.sheets || []).some((sheet) => {
    return sheet.properties?.title === sheetName;
  });

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }
        ]
      }
    });
  }

  const endColumn = toColumnName(headers.length);
  const rows = await getSheetRows(sheetName, `A1:${endColumn}1`);
  const hasHeaders = rows[0]?.some((cell) => String(cell || '').trim() !== '');

  if (!hasHeaders) {
    await updateRows(sheetName, `A1:${endColumn}1`, [headers]);
  }
}

async function updateRows(sheetName, range, values) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

function toColumnName(columnCount) {
  let number = columnCount;
  let name = '';

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

module.exports = {
  getGoogleAuth,
  getSheetsClient,
  getSheetRows,
  ensureSheetWithHeaders,
  appendRows,
  updateRows
};
