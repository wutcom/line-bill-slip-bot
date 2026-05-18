require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const OpenAI = require('openai');
const { google } = require('googleapis');

const app = express();

const processedMessages = new Set();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const lineClient = new line.Client(lineConfig);

const openai = new OpenAI.OpenAI({
  apiKey: (process.env.OPENAI_API_KEY || '').trim()
});

app.get('/', (req, res) => {
  res.send('LINE Bill Slip Bot is running');
});

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    res.status(200).end();
    await Promise.all(req.body.events.map(handleEvent));
  } catch (error) {
    console.error('Webhook error:', error);
  }
});

async function handleEvent(event) {
  if (event.type !== 'message') return;

  if (event.message.type === 'text') {
    const text = event.message.text.trim();

    if (text === 'ส่งบิล') {
      return replySafe(event.replyToken, 'กรุณาส่งรูปบิลหรือสลิปโอนเงินได้เลยครับ');
    }

    if (text === 'ดูวันนี้') {
      const userId = event.source.userId || '';
      const summary = await getTodaySummary(userId);
      return replySafe(event.replyToken, summary);
    }

    if (text === 'เดือนนี้') {
      const userId = event.source.userId || '';
      const summary = await getMonthlySummary(userId);
      return replySafe(event.replyToken, summary);
    }

    if (text === 'วิธีใช้') {
      return replySafe(
        event.replyToken,
        `วิธีใช้งาน

1. กดเมนู "ส่งบิล"
2. ส่งรูปบิลหรือสลิปโอนเงิน
3. ระบบจะอ่านข้อมูลอัตโนมัติ
4. บันทึกลง Google Sheet
5. กด "ดูวันนี้" หรือ "เดือนนี้" เพื่อดูสรุป`
      );
    }

    return replySafe(event.replyToken, 'กรุณาส่งรูปบิลหรือสลิปโอนเงินครับ');
  }

  if (event.message.type !== 'image') {
    return replySafe(event.replyToken, 'กรุณาส่งรูปบิลหรือสลิปโอนเงินครับ');
  }

  const userId = event.source.userId || '';
  const messageId = event.message.id;

  if (processedMessages.has(messageId)) {
    console.log('Duplicate message skipped:', messageId);
    return;
  }

  processedMessages.add(messageId);

  await replySafe(event.replyToken, 'ได้รับรูปแล้วครับ กำลังประมวลผล กรุณารอสักครู่');

  try {
    const imageBuffer = await downloadLineImage(messageId);
    const result = await analyzeImage(imageBuffer);

    const isDuplicate = await isDuplicateInGoogleSheet(messageId, result);

    if (isDuplicate) {
      console.log('Duplicate data skipped:', messageId);

      return pushSafe(
        userId,
        `รายการนี้เคยถูกบันทึกแล้วครับ

หมวดหมู่: ${result.category || '-'}
ร้านค้า/ธนาคาร: ${result.shopOrBankName || '-'}
ยอดเงิน: ${result.amount || '-'}
วันที่: ${result.transactionDate || '-'}
เลขอ้างอิง: ${result.referenceNo || '-'}`
      );
    }

    await appendToGoogleSheet({
      messageId,
      userId,
      ...result
    });

    await pushSafe(
      userId,
      `บันทึกข้อมูลเรียบร้อยครับ

ประเภท: ${result.documentType || '-'}
หมวดหมู่: ${result.category || '-'}
ร้านค้า/ธนาคาร: ${result.shopOrBankName || '-'}
ยอดเงิน: ${result.amount || '-'}
วันที่: ${result.transactionDate || '-'}
เลขอ้างอิง: ${result.referenceNo || '-'}`
    );
  } catch (error) {
    console.error('Process image error:', error);

    await pushSafe(
      userId,
      'ขออภัยครับ ไม่สามารถอ่านหรือบันทึกรูปนี้ได้ กรุณาลองส่งรูปใหม่อีกครั้ง'
    );
  }
}

async function replySafe(replyToken, text) {
  if (!replyToken) return;

  try {
    await lineClient.replyMessage(replyToken, {
      type: 'text',
      text
    });
  } catch (e) {
    console.error('Reply error:', e.originalError?.response?.data || e.message);
  }
}

async function pushSafe(userId, text) {
  if (!userId) return;

  try {
    await lineClient.pushMessage(userId, {
      type: 'text',
      text
    });
  } catch (e) {
    console.error('Push error:', e.originalError?.response?.data || e.message);
  }
}

async function downloadLineImage(messageId) {
  const stream = await lineClient.getMessageContent(messageId);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function analyzeImage(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You extract information from Thai bills and bank transfer slips. Return valid JSON only.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
Extract data from this image.

Return JSON:
{
  "documentType": "Bill or Transfer Slip",
  "shopOrBankName": "",
  "amount": "",
  "transactionDate": "",
  "referenceNo": "",
  "category": "",
  "description": "",
  "rawText": ""
}

Category must be one of:
Food, Transport, Fuel, Shopping, Transfer, Utility, Health, Other

Rules:
- If it is food, restaurant, market, fruit, coffee, drink, cafe, bakery => Food
- If it is gas station, petrol, diesel, fuel, Shell, PT, PTT, Bangchak, Esso, Caltex => Fuel
- If it is taxi, train, bus, toll, parking, BTS, MRT, Grab, Bolt => Transport
- If it is electricity, water, internet, phone bill, mobile bill => Utility
- If it is hospital, pharmacy, medicine, clinic => Health
- If it is bank transfer without clear purpose => Transfer
- If it is supermarket, mall, online shopping, clothes, electronics => Shopping
- If unsure => Other
`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

function getGoogleAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsClient() {
  const auth = getGoogleAuth();

  return google.sheets({
    version: 'v4',
    auth
  });
}

async function isDuplicateInGoogleSheet(messageId, data) {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME || 'Sheet1'}!A:K`
  });

  const rows = response.data.values || [];

  const referenceNo = normalizeText(data.referenceNo);
  const amount = normalizeText(data.amount);
  const transactionDate = normalizeText(data.transactionDate);

  return rows.some((row) => {
    const existingMessageId = normalizeText(row[1]);
    const existingAmount = normalizeText(row[5]);
    const existingDate = normalizeText(row[6]);
    const existingReferenceNo = normalizeText(row[7]);

    if (messageId && existingMessageId === normalizeText(messageId)) {
      return true;
    }

    if (
      referenceNo &&
      existingReferenceNo &&
      existingReferenceNo === referenceNo
    ) {
      return true;
    }

    if (
      amount &&
      transactionDate &&
      existingAmount === amount &&
      existingDate === transactionDate
    ) {
      return true;
    }

    return false;
  });
}

async function appendToGoogleSheet(data) {
  const sheets = getSheetsClient();

  const values = [
    [
      new Date().toISOString(),
      data.messageId || '',
      data.userId || '',
      data.documentType || '',
      data.shopOrBankName || '',
      data.amount || '',
      data.transactionDate || '',
      data.referenceNo || '',
      data.category || '',
      data.description || '',
      data.rawText || ''
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME || 'Sheet1'}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values
    }
  });
}

async function getTodaySummary(userId) {
  const rows = await getSheetRows();

  let total = 0;
  let count = 0;
  const byCategory = {};
  const byShop = {};

  rows.slice(1).forEach((row) => {
    const rowUserId = row[2];
    const shopName = row[4] || '-';
    const amountText = row[5] || '0';
    const transactionDate = row[6] || '';
    const category = row[8] || 'Other';

    if (userId && rowUserId !== userId) return;
    if (!isToday(transactionDate)) return;

    const amount = parseAmount(amountText);

    total += amount;
    count++;

    byCategory[category] = (byCategory[category] || 0) + amount;
    byShop[shopName] = (byShop[shopName] || 0) + amount;
  });

  if (count === 0) {
    return 'วันนี้ยังไม่มีรายการบันทึกครับ';
  }

  return buildSummaryMessage('สรุปรายการวันนี้', count, total, byCategory, byShop);
}

async function getMonthlySummary(userId) {
  const rows = await getSheetRows();

  let total = 0;
  let count = 0;
  const byCategory = {};
  const byShop = {};

  rows.slice(1).forEach((row) => {
    const rowUserId = row[2];
    const shopName = row[4] || '-';
    const amountText = row[5] || '0';
    const transactionDate = row[6] || '';
    const category = row[8] || 'Other';

    if (userId && rowUserId !== userId) return;
    if (!isCurrentMonth(transactionDate)) return;

    const amount = parseAmount(amountText);

    total += amount;
    count++;

    byCategory[category] = (byCategory[category] || 0) + amount;
    byShop[shopName] = (byShop[shopName] || 0) + amount;
  });

  if (count === 0) {
    return 'เดือนนี้ยังไม่มีรายการบันทึกครับ';
  }

  return buildSummaryMessage('สรุปรายการเดือนนี้', count, total, byCategory, byShop);
}

async function getSheetRows() {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME || 'Sheet1'}!A:K`
  });

  return response.data.values || [];
}

function buildSummaryMessage(title, count, total, byCategory, byShop) {
  const categoryText = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => `- ${category}: ${formatMoney(amount)} บาท`)
    .join('\n');

  const shopText = Object.entries(byShop)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([shop, amount], index) => {
      return `${index + 1}. ${shop}: ${formatMoney(amount)} บาท`;
    })
    .join('\n');

  return `${title}

จำนวนรายการ: ${count}
ยอดรวม: ${formatMoney(total)} บาท

แยกตามหมวดหมู่:
${categoryText || '-'}

Top ร้านค้า/ธนาคาร:
${shopText || '-'}`;
}

function isToday(dateText) {
  if (!dateText) return false;

  const parsedDate = parseTransactionDate(dateText);
  if (!parsedDate) return false;

  const today = new Date();

  return (
    parsedDate.getFullYear() === today.getFullYear() &&
    parsedDate.getMonth() === today.getMonth() &&
    parsedDate.getDate() === today.getDate()
  );
}

function isCurrentMonth(dateText) {
  if (!dateText) return false;

  const parsedDate = parseTransactionDate(dateText);
  if (!parsedDate) return false;

  const today = new Date();

  return (
    parsedDate.getFullYear() === today.getFullYear() &&
    parsedDate.getMonth() === today.getMonth()
  );
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  let match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    return buildDate(match[1], match[2], match[3]);
  }

  match = text.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
  if (match) {
    const month = getThaiMonthNumber(match[2]);
    if (month) {
      return buildDate(match[1], month, match[3]);
    }
  }

  match = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match) {
    return buildDate(match[3], match[2], match[1]);
  }

  return null;
}

function buildDate(day, month, year) {
  let y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (y > 2400) {
    y -= 543;
  }

  const date = new Date(y, m - 1, d);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getThaiMonthNumber(monthText) {
  const key = String(monthText).replace(/\s/g, '');

  const months = {
    'ม.ค.': 1,
    'มค': 1,
    'มกราคม': 1,
    'ก.พ.': 2,
    'กพ': 2,
    'กุมภาพันธ์': 2,
    'มี.ค.': 3,
    'มีค': 3,
    'มีนาคม': 3,
    'เม.ย.': 4,
    'เมย': 4,
    'เมษายน': 4,
    'พ.ค.': 5,
    'พค': 5,
    'พฤษภาคม': 5,
    'มิ.ย.': 6,
    'มิย': 6,
    'มิถุนายน': 6,
    'ก.ค.': 7,
    'กค': 7,
    'กรกฎาคม': 7,
    'ส.ค.': 8,
    'สค': 8,
    'สิงหาคม': 8,
    'ก.ย.': 9,
    'กย': 9,
    'กันยายน': 9,
    'ต.ค.': 10,
    'ตค': 10,
    'ตุลาคม': 10,
    'พ.ย.': 11,
    'พย': 11,
    'พฤศจิกายน': 11,
    'ธ.ค.': 12,
    'ธค': 12,
    'ธันวาคม': 12
  };

  return months[key] || null;
}

function parseAmount(value) {
  if (!value) return 0;

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/บาท/g, '')
    .replace(/THB/gi, '')
    .replace(/[^\d.-]/g, '');

  return Number(cleaned) || 0;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

setInterval(() => {
  processedMessages.clear();
  console.log('Processed message cache cleared');
}, 1000 * 60 * 60);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
