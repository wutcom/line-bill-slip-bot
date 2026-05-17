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
4. บันทึกลง Google Sheet`
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
  "description": "",
  "rawText": ""
}
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

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
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
      data.description || '',
      data.rawText || ''
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME || 'Sheet1'}!A:J`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values
    }
  });
}

setInterval(() => {
  processedMessages.clear();
  console.log('Processed message cache cleared');
}, 1000 * 60 * 60);

async function getMonthlySummary(userId) {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME || 'Sheet1'}!A:J`
  });

  const rows = response.data.values || [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let total = 0;
  let count = 0;
  const byShop = {};

  rows.slice(1).forEach((row) => {
    const createdAt = row[0];       // CreatedAt
    const rowUserId = row[2];       // UserId
    const shopName = row[4] || '-'; // ShopOrBankName
    const amountText = row[5] || '0';

    if (userId && rowUserId !== userId) return;

    const date = new Date(createdAt);
    if (isNaN(date.getTime())) return;

    if (
      date.getFullYear() === currentYear &&
      date.getMonth() === currentMonth
    ) {
      const amount = parseAmount(amountText);

      total += amount;
      count++;

      byShop[shopName] = (byShop[shopName] || 0) + amount;
    }
  });

  if (count === 0) {
    return 'เดือนนี้ยังไม่มีรายการบันทึกครับ';
  }

  const topShops = Object.entries(byShop)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([shop, amount], index) => {
      return `${index + 1}. ${shop}: ${formatMoney(amount)} บาท`;
    })
    .join('\n');

  return `สรุปรายการเดือนนี้

จำนวนรายการ: ${count}
ยอดรวม: ${formatMoney(total)} บาท

Top ร้านค้า/ธนาคาร:
${topShops}`;
}

function parseAmount(value) {
  if (!value) return 0;

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/บาท/g, '')
    .replace(/THB/g, '')
    .replace(/[^\d.-]/g, '');

  return Number(cleaned) || 0;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function getTodaySummary(userId) {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME || 'Sheet1'}!A:J`
  });

  const rows = response.data.values || [];

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  let total = 0;
  let count = 0;
  const byShop = {};

  rows.slice(1).forEach((row) => {
    const createdAt = row[0];
    const rowUserId = row[2];
    const shopName = row[4] || '-';
    const amountText = row[5] || '0';

    if (userId && rowUserId !== userId) return;

    if (!createdAt || !createdAt.startsWith(todayKey)) return;

    const amount = parseAmount(amountText);

    total += amount;
    count++;

    byShop[shopName] = (byShop[shopName] || 0) + amount;
  });

  if (count === 0) {
    return 'วันนี้ยังไม่มีรายการบันทึกครับ';
  }

  const topShops = Object.entries(byShop)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([shop, amount], index) => {
      return `${index + 1}. ${shop}: ${formatMoney(amount)} บาท`;
    })
    .join('\n');

  return `สรุปรายการวันนี้

จำนวนรายการ: ${count}
ยอดรวม: ${formatMoney(total)} บาท

Top ร้านค้า/ธนาคาร:
${topShops}`;
}

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
