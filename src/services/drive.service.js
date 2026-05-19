const { google } = require('googleapis');
const { Readable } = require('stream');
const { getGoogleAuth } = require('./sheets.service');

function getDriveClient() {
  return google.drive({
    version: 'v3',
    auth: getGoogleAuth()
  });
}

async function uploadReceiptImage({ imageBuffer, userId, messageId, documentType }) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!rootFolderId) {
    console.warn('GOOGLE_DRIVE_FOLDER_ID is not set. Skipping Google Drive image upload.');
    return null;
  }

  const drive = getDriveClient();
  const monthKey = getCurrentMonthKey();
  const typeFolderName = isTransferSlip(documentType) ? 'slips' : 'receipts';
  const typeFolderId = await ensureFolder(drive, typeFolderName, rootFolderId);
  const monthFolderId = await ensureFolder(drive, monthKey, typeFolderId);
  const userFolderId = await ensureFolder(drive, sanitizeFileName(userId || 'unknown-user'), monthFolderId);
  const fileName = `${monthKey}_${sanitizeFileName(userId || 'unknown')}_${sanitizeFileName(messageId)}.jpg`;

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [userFolderId]
    },
    media: {
      mimeType: 'image/jpeg',
      body: Readable.from(imageBuffer)
    },
    fields: 'id, webViewLink'
  });

  return {
    imageFileId: response.data.id,
    imageUrl: response.data.webViewLink,
    imageStoredAt: new Date().toISOString()
  };
}

async function ensureFolder(drive, name, parentId) {
  const response = await drive.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${escapeDriveQuery(name)}'`,
      `'${escapeDriveQuery(parentId)}' in parents`,
      'trashed = false'
    ].join(' and '),
    fields: 'files(id, name)',
    pageSize: 1
  });

  if (response.data.files?.length) {
    return response.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });

  return created.data.id;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isTransferSlip(documentType) {
  const text = String(documentType || '').toLowerCase();
  return text.includes('transfer') || text.includes('โอน');
}

function sanitizeFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'unknown';
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

module.exports = {
  getDriveClient,
  uploadReceiptImage
};
