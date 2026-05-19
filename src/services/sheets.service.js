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

async function updateRows(sheetName, range, values) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

module.exports = {
  getGoogleAuth,
  getSheetsClient,
  getSheetRows,
  appendRows,
  updateRows
};
