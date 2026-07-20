const { getSheetRows, ensureSheetWithHeaders, updateRows, appendRows } = require('./sheets.service');

const SETTINGS_SHEET_NAME = 'UserSettings';
const SETTINGS_HEADERS = ['UserId', 'CutoffDay', 'UpdatedAt'];

// Simple in-memory cache to avoid reading sheet every time
const settingsCache = new Map();

async function ensureSettingsSheet() {
  await ensureSheetWithHeaders(SETTINGS_SHEET_NAME, SETTINGS_HEADERS);
}

async function getCutoffDay(userId) {
  if (!userId) return 15;

  // Check cache first
  if (settingsCache.has(userId)) {
    const cached = settingsCache.get(userId);
    // Cache for 5 minutes
    if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.cutoffDay;
    }
  }

  try {
    await ensureSettingsSheet();
    const rows = await getSheetRows(SETTINGS_SHEET_NAME, 'A:C');
    
    // Find row for this user
    const userRow = rows.slice(1).find(row => row[0] === userId);
    
    let cutoffDay = 15;
    if (userRow && userRow[1]) {
      const parsed = parseInt(userRow[1], 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
        cutoffDay = parsed;
      }
    }

    settingsCache.set(userId, {
      cutoffDay,
      timestamp: Date.now()
    });

    return cutoffDay;
  } catch (error) {
    console.error('Error getting cutoff day:', error);
    return 15; // default fallback
  }
}

async function setCutoffDay(userId, cutoffDay) {
  if (!userId) return 'ไม่สามารถตั้งค่าได้เนื่องจากไม่พบข้อมูลผู้ใช้งาน';

  const day = parseInt(cutoffDay, 10);
  if (isNaN(day) || day < 1 || day > 31) {
    return 'กรุณาระบุวันคัตออฟเป็นตัวเลขระหว่าง 1 ถึง 31 ครับ';
  }

  try {
    await ensureSettingsSheet();
    const rows = await getSheetRows(SETTINGS_SHEET_NAME, 'A:C');
    
    const nowIndex = rows.slice(1).findIndex(row => row[0] === userId);
    const nowIso = new Date().toISOString();

    if (nowIndex !== -1) {
      // Row number in Google Sheets is 1-indexed and has header row, so it is index + 2
      const sheetRowNumber = nowIndex + 2;
      // Update existing row (UserId is in column A, CutoffDay in B, UpdatedAt in C)
      await updateRows(SETTINGS_SHEET_NAME, `B${sheetRowNumber}:C${sheetRowNumber}`, [[day, nowIso]]);
    } else {
      // Append new row
      await appendRows(SETTINGS_SHEET_NAME, 'A:C', [[userId, day, nowIso]]);
    }

    // Update cache
    settingsCache.set(userId, {
      cutoffDay: day,
      timestamp: Date.now()
    });

    return `ตั้งค่าวันคัตออฟเป็นวันที่ ${day} เรียบร้อยแล้วครับ`;
  } catch (error) {
    console.error('Error setting cutoff day:', error);
    return 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง';
  }
}

module.exports = {
  getCutoffDay,
  setCutoffDay
};
