require('dotenv').config();

const express = require('express');

const {
  line,
  lineConfig,
  replySafe,
  pushSafe,
  downloadLineImage
} = require('./services/line.service');

const { analyzeImage } = require('./services/openai.service');
const { getSheetRows, appendRows } = require('./services/sheets.service');
const { getTodaySummary, getMonthlySummary } = require('./services/summary.service');

const {
  addBudgetPlan,
  getCurrentMonthPlans,
  getRemainingPlans,
  copyPreviousMonthPlans,
  markPlanPaid,
  getBudgetPaymentHistory,
  deleteBudgetPayment
} = require('./services/budget.service');

const { normalizeText } = require('./utils/text.util');

const app = express();
const processedMessages = new Set();

const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

app.get('/', (req, res) => {
  res.send('LINE Bill Slip Bot is running');
});

app.get('/help', (req, res) => {
  const dashboardUrl = process.env.DASHBOARD_URL || 'https://web-dashboard-2mpq.onrender.com';

  res.type('html').send(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>วิธีใช้ LINE Bill Slip Bot</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, Tahoma, sans-serif;
      line-height: 1.6;
      color: #1f2933;
      background: #f6f7f9;
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 28px 20px 44px;
      background: #fff;
      min-height: 100vh;
    }
    h1 {
      margin: 0 0 16px;
      font-size: 28px;
    }
    h2 {
      margin: 28px 0 10px;
      font-size: 20px;
    }
    ul, ol {
      padding-left: 24px;
    }
    code {
      background: #eef2f7;
      border-radius: 6px;
      padding: 2px 6px;
    }
    .dashboard-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      margin-top: 10px;
      border-radius: 8px;
      background: #0f766e;
      color: white;
      padding: 0 18px;
      font-weight: 700;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <h1>วิธีใช้ LINE Bill Slip Bot</h1>
    <h2>บันทึกบิลหรือสลิป</h2>
    <ol>
      <li>กดเมนู <code>ส่งบิล</code></li>
      <li>ส่งรูปบิล ใบเสร็จ หรือสลิปโอนเงิน</li>
      <li>ระบบจะอ่าน OCR และบันทึกลง Google Sheet</li>
    </ol>

    <h2>ดูสรุป</h2>
    <ul>
      <li><code>ดูวันนี้</code> ดูยอดรวมของวันนี้</li>
      <li><code>เดือนนี้</code> ดูยอดรวมของเดือนนี้</li>
      <li><code>ดูคงเหลือ</code> ดูแผนที่ยังเหลือ</li>
    </ul>
    <a class="dashboard-link" href="${dashboardUrl}" target="_blank" rel="noopener noreferrer">เปิด Dashboard</a>

    <h2>จัดการแผนรายเดือน</h2>
    <ul>
      <li><code>เพิ่มแผน UOB 24677</code></li>
      <li><code>แผนเดือนนี้</code></li>
      <li><code>จ่ายแล้ว UOB 5000</code></li>
      <li><code>ประวัติจ่าย UOB</code></li>
      <li><code>ลบจ่าย PaymentId</code></li>
      <li><code>copy แผนเดือนก่อน</code></li>
    </ul>
  </main>
</body>
</html>`);
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

  const userId = event.source.userId || '';

  if (event.message.type === 'text') {
    const text = event.message.text.trim();

    if (text === 'แผนเดือนนี้') {
      return replySafe(event.replyToken, await getCurrentMonthPlans(userId));
    }

    if (text.startsWith('เพิ่มแผน ')) {
      return replySafe(event.replyToken, await addBudgetPlan(userId, text));
    }

    if (text === 'เพิ่มแผน') {
      return replySafe(event.replyToken, 'ตัวอย่าง:\nเพิ่มแผน UOB 24677\nเพิ่มแผน ค่าไฟ 3500');
    }

    if (text === 'ดูคงเหลือ') {
      return replySafe(event.replyToken, await getRemainingPlans(userId));
    }

    if (text === 'copy แผนเดือนก่อน') {
      return replySafe(event.replyToken, await copyPreviousMonthPlans(userId));
    }

    if (text.startsWith('จ่ายแล้ว ')) {
      return replySafe(event.replyToken, await markPlanPaid(userId, text));
    }

    if (text === 'จ่ายแล้ว') {
      return replySafe(event.replyToken, 'ตัวอย่าง:\nจ่ายแล้ว UOB 5000\nจ่ายแล้ว UOB 5000 งวด 1');
    }

    if (text.startsWith('ประวัติจ่าย ')) {
      return replySafe(event.replyToken, await getBudgetPaymentHistory(userId, text));
    }

    if (text === 'ประวัติจ่าย') {
      return replySafe(event.replyToken, 'ตัวอย่าง:\nประวัติจ่าย UOB');
    }

    if (text.startsWith('ลบจ่าย ')) {
      return replySafe(event.replyToken, await deleteBudgetPayment(userId, text));
    }

    if (text === 'ลบจ่าย') {
      return replySafe(event.replyToken, 'ตัวอย่าง:\nลบจ่าย 2c27b4f0');
    }

    if (text === 'ส่งบิล') {
      return replySafe(event.replyToken, 'กรุณาส่งรูปบิลหรือสลิปโอนเงินได้เลยครับ');
    }

    if (text === 'ดูวันนี้') {
      return replySafe(event.replyToken, await getTodaySummary(userId));
    }

    if (text === 'เดือนนี้') {
      return replySafe(event.replyToken, await getMonthlySummary(userId));
    }

    if (text === 'วิธีใช้') {
      return replySafe(
        event.replyToken,
        `วิธีใช้งาน

1. กด "ส่งบิล" แล้วส่งรูปบิล/สลิป
2. กด "ดูวันนี้" เพื่อสรุปวันนี้
3. กด "เดือนนี้" เพื่อสรุปเดือนนี้
4. พิมพ์ "เพิ่มแผน UOB 24677"
5. พิมพ์ "จ่ายแล้ว UOB 5000" เพื่อบันทึกการจ่ายรายครั้ง
6. พิมพ์ "ประวัติจ่าย UOB" เพื่อดูรายการจ่ายของแผน
7. พิมพ์ "ลบจ่าย PaymentId" หากบันทึกผิด
8. กด "ดูคงเหลือ" เพื่อดูยอดแผนคงเหลือ`
      );
    }

    return replySafe(event.replyToken, 'กรุณาส่งรูปบิลหรือสลิปโอนเงินครับ');
  }

  if (event.message.type !== 'image') {
    return replySafe(event.replyToken, 'กรุณาส่งรูปบิลหรือสลิปโอนเงินครับ');
  }

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

    await appendTransactionToGoogleSheet({
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

async function isDuplicateInGoogleSheet(messageId, data) {
  const rows = await getSheetRows(TRANSACTION_SHEET_NAME, 'A:K');

  const referenceNo = normalizeText(data.referenceNo);
  const amount = normalizeText(data.amount);
  const transactionDate = normalizeText(data.transactionDate);

  return rows.some((row) => {
    const existingMessageId = normalizeText(row[1]);
    const existingAmount = normalizeText(row[5]);
    const existingDate = normalizeText(row[6]);
    const existingReferenceNo = normalizeText(row[7]);

    if (messageId && existingMessageId === normalizeText(messageId)) return true;
    if (referenceNo && existingReferenceNo && existingReferenceNo === referenceNo) return true;
    if (amount && transactionDate && existingAmount === amount && existingDate === transactionDate) return true;

    return false;
  });
}

async function appendTransactionToGoogleSheet(data) {
  await appendRows(TRANSACTION_SHEET_NAME, 'A:O', [[
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
    data.rawText || '',
    data.imageFileId || '',
    data.imageUrl || '',
    data.imageStoredAt || '',
    data.ocrConfidence || data.confidence || ''
  ]]);
}

setInterval(() => {
  processedMessages.clear();
  console.log('Processed message cache cleared');
}, 1000 * 60 * 60);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
