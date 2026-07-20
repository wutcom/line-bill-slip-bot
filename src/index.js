require('dotenv').config();

const express = require('express');

const {
  line,
  lineConfig,
  replySafe,
  replyMessagesSafe,
  pushSafe,
  downloadLineImage
} = require('./services/line.service');

const { analyzeLineImage, completeFoodPhotoLog, wakeAnalysisApi } = require('./services/analysis-api.service');
const { getSheetRows, ensureSheetWithHeaders, appendRows } = require('./services/sheets.service');
const { getTodaySummary, getMonthlySummary } = require('./services/summary.service');
const { getBodyMetricsReport } = require('./services/body-metrics.service');

const {
  addBudgetPlan,
  getCurrentMonthPlans,
  getRemainingPlans,
  copyPreviousMonthPlans,
  markPlanPaid,
  getBudgetPaymentHistory,
  deleteBudgetPayment,
  deleteBudgetPlan,
  editBudgetPlan
} = require('./services/budget.service');

const { normalizeText } = require('./utils/text.util');

const app = express();
const processedMessages = new Set();
const pendingFoodPhotos = new Map();

const TRANSACTION_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const TRANSACTION_HEADERS = [
  'CreatedAt',
  'MessageId',
  'UserId',
  'DocumentType',
  'ShopOrBankName',
  'Amount',
  'TransactionDate',
  'ReferenceNo',
  'Category',
  'Description',
  'RawText',
  'ImageFileId',
  'ImageUrl',
  'ImageStoredAt',
  'OcrConfidence'
];
const BODY_METRICS_SHEET_NAME = process.env.BODY_METRICS_SHEET_NAME || 'BodyMetrics';
const BODY_METRICS_HEADERS = [
  'CreatedAt',
  'MessageId',
  'UserId',
  'ReportDate',
  'WeightKg',
  'Bmi',
  'BodyFatPct',
  'MuscleMassKg',
  'MusclePct',
  'BoneMassPct',
  'BmrKcal',
  'WaterPct',
  'FatMassKg',
  'FatFreeWeightKg',
  'RawText',
  'OcrConfidence'
];
const NUTRITION_LOGS_SHEET_NAME = process.env.NUTRITION_LOGS_SHEET_NAME || 'NutritionLogs';
const NUTRITION_LOGS_HEADERS = [
  'CreatedAt',
  'MessageId',
  'UserId',
  'LogDate',
  'MealName',
  'SourceType',
  'DetectedFood',
  'UserPortionText',
  'EstimatedKcal',
  'EstimatedKcalMin',
  'EstimatedKcalMax',
  'ProteinG',
  'ProteinGoalG',
  'CarbG',
  'CarbGoalG',
  'FatG',
  'FatGoalG',
  'WeightKg',
  'WaistInch',
  'SugarLevel',
  'SodiumLevel',
  'Confidence',
  'Note',
  'RawText'
];

app.get('/', (req, res) => {
  res.send('LINE Bill Slip Bot is running');
});

app.get('/help', (req, res) => {
  wakeAnalysisApiSoon();

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

    <h2>สุขภาพ</h2>
    <ul>
      <li>ส่งรูปรายงานน้ำหนัก/ไขมัน เพื่อบันทึกข้อมูลสุขภาพ</li>
      <li><code>กราฟสุขภาพ</code> ดูกราฟแนวโน้มน้ำหนัก ไขมัน กล้ามเนื้อย้อนหลัง</li>
      <li><code>กราฟสุขภาพ 30 วัน</code> กำหนดช่วงวันย้อนหลังเองได้</li>
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

    if (pendingFoodPhotos.has(userId) && isCancelText(text)) {
      pendingFoodPhotos.delete(userId);
      return replySafe(event.replyToken, 'ยกเลิกการบันทึกอาหารจากรูปล่าสุดแล้วครับ');
    }

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

    if (text.startsWith('ลบแผน ')) {
      return replySafe(event.replyToken, await deleteBudgetPlan(userId, text));
    }

    if (text === 'ลบแผน') {
      return replySafe(event.replyToken, 'ตัวอย่าง:\nลบแผน UOB');
    }

    if (text.startsWith('แก้ไขแผน ')) {
      return replySafe(event.replyToken, await editBudgetPlan(userId, text));
    }

    if (text === 'แก้ไขแผน') {
      return replySafe(event.replyToken, 'ตัวอย่าง:\nแก้ไขแผน UOB 30000');
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

    if (text === 'กราฟสุขภาพ' || text.startsWith('กราฟสุขภาพ ') || text === 'กราฟน้ำหนัก' || text.startsWith('กราฟน้ำหนัก ')) {
      return handleBodyMetricsChart(event, userId, text);
    }

    if (text === 'วิธีใช้') {
      wakeAnalysisApiSoon();

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
8. กด "ดูคงเหลือ" เพื่อดูยอดแผนคงเหลือ
9. พิมพ์ "ลบแผน UOB" เพื่อลบแผน
10. พิมพ์ "แก้ไขแผน UOB 30000" เพื่อแก้ไขยอดเงินในแผน
11. พิมพ์ "กราฟสุขภาพ" หรือ "กราฟสุขภาพ 30 วัน" เพื่อดูแนวโน้มน้ำหนัก/ไขมัน/กล้ามเนื้อย้อนหลัง`
      );
    }

    if (pendingFoodPhotos.has(userId)) {
      return handleFoodConfirmationReply(event, userId, text);
    }

    return replySafe(event.replyToken, 'กรุณาส่งรูปบิล/สลิป รูปสุขภาพ หรือรูปอาหารครับ');
  }

  if (event.message.type !== 'image') {
    return replySafe(event.replyToken, 'กรุณาส่งรูปบิล/สลิป รูปสุขภาพ หรือรูปอาหารครับ');
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
    const analysis = await analyzeLineImage(imageBuffer, { messageId, userId });
    const documentKind = normalizeDocumentKind(analysis.documentKind);

    if (documentKind === 'body_metrics') {
      const result = withEnvelopeConfidence(analysis);
      await ensureBodyMetricsSheet();

      const isDuplicate = await isDuplicateInBodyMetricsSheet(messageId, userId, result);

      if (isDuplicate) {
        return pushSafe(
          userId,
          `รายการสุขภาพนี้เคยถูกบันทึกแล้วครับ

น้ำหนัก: ${result.weightKg || '-'} kg
BMI: ${result.bmi || '-'}
ไขมัน: ${result.bodyFatPct || '-'}%
กล้ามเนื้อ: ${result.muscleMassKg || '-'} kg`
        );
      }

      await appendBodyMetricsToGoogleSheet({
        messageId,
        userId,
        ...result
      });

      return pushSafe(
        userId,
        `บันทึกข้อมูลสุขภาพเรียบร้อยครับ

น้ำหนัก: ${result.weightKg || '-'} kg
BMI: ${result.bmi || '-'}
ไขมัน: ${result.bodyFatPct || '-'}%
กล้ามเนื้อ: ${result.muscleMassKg || '-'} kg
BMR: ${result.bmrKcal || '-'} kcal`
      );
    }

    if (documentKind === 'nutrition') {
      const result = withEnvelopeConfidence(analysis);

      if (isFoodPhotoAnalysis(analysis)) {
        const draft = buildFoodPhotoDraft(result);

        pendingFoodPhotos.set(userId, {
          messageId,
          foodPhoto: result,
          draft,
          createdAt: Date.now()
        });

        return pushSafe(
          userId,
          formatFoodPhotoDraftMessage(draft)
        );
      }

      await ensureNutritionLogsSheet();

      const isDuplicate = await isDuplicateInNutritionLogsSheet(messageId);

      if (isDuplicate) {
        return pushSafe(
          userId,
          `รายการอาหารนี้เคยถูกบันทึกแล้วครับ

มื้อ: ${result.mealName || '-'}
แคลอรี่: ${result.mealKcal || result.totalKcal || '-'} kcal`
        );
      }

      await appendNutritionLogToGoogleSheet({
        messageId,
        userId,
        sourceType: analysis.sourceType || 'app_screenshot',
        logDate: result.logDate,
        mealName: result.mealName,
        detectedFood: result.detectedFood || result.foodItems,
        estimatedKcal: result.mealKcal || result.totalKcal,
        proteinG: result.proteinG,
        proteinGoalG: result.proteinGoalG,
        carbG: result.carbG,
        carbGoalG: result.carbGoalG,
        fatG: result.fatG,
        fatGoalG: result.fatGoalG,
        weightKg: result.weightKg,
        waistInch: result.waistInch,
        confidence: result.confidence,
        rawText: result.rawText
      });

      return pushSafe(
        userId,
        `บันทึกข้อมูลอาหารจากแอปเรียบร้อยครับ

มื้อ: ${result.mealName || '-'}
แคลอรี่: ${result.mealKcal || result.totalKcal || '-'} kcal
โปรตีน: ${result.proteinG || '-'} g
คาร์บ: ${result.carbG || '-'} g
ไขมัน: ${result.fatG || '-'} g`
      );
    }

    if (documentKind === 'unknown') {
      return pushSafe(
        userId,
        'ขออภัยครับ รูปนี้ไม่ใช่บิล/สลิป รายงานสุขภาพ หรือรูปอาหารที่ระบบอ่านได้'
      );
    }

    const result = withEnvelopeConfidence(analysis);

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
  await ensureTransactionSheet();

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

async function ensureTransactionSheet() {
  await ensureSheetWithHeaders(TRANSACTION_SHEET_NAME, TRANSACTION_HEADERS);
}

async function ensureBodyMetricsSheet() {
  await ensureSheetWithHeaders(BODY_METRICS_SHEET_NAME, BODY_METRICS_HEADERS);
}

async function isDuplicateInBodyMetricsSheet(messageId, userId, data) {
  const rows = await getSheetRows(BODY_METRICS_SHEET_NAME, 'A:P');
  const reportDate = normalizeText(getBodyMetricsReportDate(data));
  const weightKg = normalizeText(data.weightKg);
  const bmi = normalizeText(data.bmi);

  return rows.slice(1).some((row) => {
    const existingMessageId = normalizeText(row[1]);
    const existingUserId = normalizeText(row[2]);
    const existingReportDate = normalizeText(row[3]);
    const existingWeightKg = normalizeText(row[4]);
    const existingBmi = normalizeText(row[5]);

    if (messageId && existingMessageId === normalizeText(messageId)) return true;

    return Boolean(
      userId &&
      reportDate &&
      weightKg &&
      bmi &&
      existingUserId === normalizeText(userId) &&
      existingReportDate === reportDate &&
      existingWeightKg === weightKg &&
      existingBmi === bmi
    );
  });
}

async function handleFoodConfirmationReply(event, userId, text) {
  const pending = pendingFoodPhotos.get(userId);

  if (isConfirmText(text)) {
    await replySafe(event.replyToken, 'ยืนยันแล้วครับ กำลังบันทึกลงชีต');

    try {
      await ensureNutritionLogsSheet();

      const isDuplicate = await isDuplicateInNutritionLogsSheet(pending.messageId);

      if (isDuplicate) {
        pendingFoodPhotos.delete(userId);

        return pushSafe(
          userId,
          `รายการอาหารนี้เคยถูกบันทึกแล้วครับ

มื้อ: ${pending.draft.mealName || '-'}
แคลอรี่: ${pending.draft.estimatedKcal || '-'} kcal`
        );
      }

      await appendNutritionLogToGoogleSheet({
        messageId: pending.messageId,
        userId,
        sourceType: 'food_photo_confirmed',
        ...pending.draft,
        userPortionText: pending.draft.portionSummary || 'ยืนยันจากร่าง'
      });

      pendingFoodPhotos.delete(userId);

      return pushSafe(userId, formatFoodSavedMessage(pending.draft));
    } catch (error) {
      console.error('Confirm food photo error:', error);

      return pushSafe(
        userId,
        'ขออภัยครับ ยังบันทึกอาหารไม่ได้ ลองพิมพ์ "ยืนยัน" อีกครั้ง หรือส่งรูปใหม่ครับ'
      );
    }
  }

  const correctionText = getFoodCorrectionText(text);

  if (!correctionText) {
    return replySafe(
      event.replyToken,
      'ถ้าถูกต้องพิมพ์ "ยืนยัน" หรือถ้าจะแก้ พิมพ์เช่น "แก้ ข้าว 1 ทัพพี ไข่ดาว 1 ฟอง" ครับ'
    );
  }

  await replySafe(event.replyToken, 'รับข้อมูลแก้ไขแล้วครับ กำลังคำนวณใหม่และบันทึกลงชีต');

  try {
    const correctionAnalysis = await completeFoodPhotoLog(pending.foodPhoto, correctionText);
    const result = withEnvelopeConfidence(correctionAnalysis);
    await ensureNutritionLogsSheet();

    const isDuplicate = await isDuplicateInNutritionLogsSheet(pending.messageId);

    if (isDuplicate) {
      pendingFoodPhotos.delete(userId);

      return pushSafe(
        userId,
        `รายการอาหารนี้เคยถูกบันทึกแล้วครับ

มื้อ: ${result.mealName || '-'}
แคลอรี่: ${result.estimatedKcal || '-'} kcal`
      );
    }

    await appendNutritionLogToGoogleSheet({
      messageId: pending.messageId,
      userId,
      sourceType: correctionAnalysis.sourceType || 'food_photo_with_user_edit',
      ...result,
      userPortionText: result.userPortionText || correctionText
    });

    pendingFoodPhotos.delete(userId);

    return pushSafe(userId, formatFoodSavedMessage(result));
  } catch (error) {
    console.error('Process food portion reply error:', error);

    return pushSafe(
      userId,
      'ขออภัยครับ ยังบันทึกอาหารไม่ได้ ลองพิมพ์ "ยืนยัน" หรือ "แก้ มื้อเที่ยง ข้าว 2 ทัพพี ผัดพริกแกงหมู 1 ทัพพี ไข่ดาว 1 ฟอง"'
    );
  }
}

async function handleBodyMetricsChart(event, userId, text) {
  try {
    await ensureBodyMetricsSheet();

    const report = await getBodyMetricsReport(userId, text);

    if (report.chartUrl) {
      return replyMessagesSafe(event.replyToken, [
        { type: 'text', text: report.text },
        {
          type: 'image',
          originalContentUrl: report.chartUrl,
          previewImageUrl: report.chartUrl
        }
      ]);
    }

    return replySafe(event.replyToken, report.text);
  } catch (error) {
    console.error('Body metrics chart error:', error);

    return replySafe(
      event.replyToken,
      'ขออภัยครับ ดึงกราฟสุขภาพย้อนหลังไม่ได้ กรุณาลองใหม่อีกครั้ง'
    );
  }
}

async function ensureNutritionLogsSheet() {
  await ensureSheetWithHeaders(NUTRITION_LOGS_SHEET_NAME, NUTRITION_LOGS_HEADERS);
}

async function isDuplicateInNutritionLogsSheet(messageId) {
  const rows = await getSheetRows(NUTRITION_LOGS_SHEET_NAME, 'A:X');

  return rows.slice(1).some((row) => {
    return messageId && normalizeText(row[1]) === normalizeText(messageId);
  });
}

async function appendTransactionToGoogleSheet(data) {
  await ensureTransactionSheet();

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

async function appendNutritionLogToGoogleSheet(data) {
  await appendRows(NUTRITION_LOGS_SHEET_NAME, 'A:X', [[
    new Date().toISOString(),
    data.messageId || '',
    data.userId || '',
    data.logDate || getBangkokDate(),
    data.mealName || '',
    data.sourceType || '',
    data.detectedFood || '',
    data.userPortionText || '',
    toSheetNumber(data.estimatedKcal),
    toSheetNumber(data.estimatedKcalMin),
    toSheetNumber(data.estimatedKcalMax),
    toSheetNumber(data.proteinG),
    toSheetNumber(data.proteinGoalG),
    toSheetNumber(data.carbG),
    toSheetNumber(data.carbGoalG),
    toSheetNumber(data.fatG),
    toSheetNumber(data.fatGoalG),
    toSheetNumber(data.weightKg),
    toSheetNumber(data.waistInch),
    data.sugarLevel || '',
    data.sodiumLevel || '',
    data.confidence || '',
    data.note || '',
    data.rawText || ''
  ]]);
}

async function appendBodyMetricsToGoogleSheet(data) {
  await appendRows(BODY_METRICS_SHEET_NAME, 'A:P', [[
    new Date().toISOString(),
    data.messageId || '',
    data.userId || '',
    getBodyMetricsReportDate(data),
    toSheetNumber(data.weightKg),
    toSheetNumber(data.bmi),
    toSheetNumber(data.bodyFatPct),
    toSheetNumber(data.muscleMassKg),
    toSheetNumber(data.musclePct),
    toSheetNumber(data.boneMassPct),
    toSheetNumber(data.bmrKcal),
    toSheetNumber(data.waterPct),
    toSheetNumber(data.fatMassKg),
    toSheetNumber(data.fatFreeWeightKg),
    data.rawText || '',
    data.ocrConfidence || data.confidence || ''
  ]]);
}

function getBodyMetricsReportDate(data) {
  return data.reportDate || getBangkokDate();
}

function getBangkokDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = parts.reduce((map, part) => {
    map[part.type] = part.value;
    return map;
  }, {});

  return `${values.year}-${values.month}-${values.day}`;
}

function toSheetNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const match = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return '';

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : '';
}

function normalizeDocumentKind(documentKind) {
  const text = String(documentKind || '').trim().toLowerCase().replace(/\s+/g, '_');

  if (text === 'body_metrics' || text === 'health' || text === 'health_report') return 'body_metrics';
  if (text === 'nutrition' || text === 'nutrition_log' || text === 'food_log' || text === 'app_screenshot') return 'nutrition';
  if (text === 'food_photo' || text === 'meal_photo' || text === 'food') return 'nutrition';
  if (text === 'transaction' || text === 'bill' || text === 'receipt' || text === 'transfer_slip') return 'transaction';

  return 'unknown';
}

function isFoodPhotoAnalysis(analysis) {
  const sourceType = String(analysis.sourceType || analysis.payload?.sourceType || '').trim().toLowerCase();

  return sourceType === 'food_photo' || analysis.payload?.needsConfirmation === true;
}

function withEnvelopeConfidence(analysis) {
  return {
    ...(analysis.payload || {}),
    confidence: analysis.payload?.confidence || analysis.confidence || ''
  };
}

function buildFoodPhotoDraft(foodPhoto) {
  const fallback = getFoodPhotoFallback(foodPhoto);
  const detectedFood = normalizeFoodName(foodPhoto.detectedFood || foodPhoto.mealName) || fallback.detectedFood;
  const estimatedKcalMin = toSheetNumber(foodPhoto.estimatedKcalMin) || fallback.estimatedKcalMin;
  const estimatedKcalMax = toSheetNumber(foodPhoto.estimatedKcalMax) || fallback.estimatedKcalMax;
  const proteinGMin = toSheetNumber(foodPhoto.proteinGMin);
  const proteinGMax = toSheetNumber(foodPhoto.proteinGMax);
  const carbGMin = toSheetNumber(foodPhoto.carbGMin);
  const carbGMax = toSheetNumber(foodPhoto.carbGMax);
  const fatGMin = toSheetNumber(foodPhoto.fatGMin);
  const fatGMax = toSheetNumber(foodPhoto.fatGMax);

  return {
    logDate: foodPhoto.logDate || getBangkokDate(),
    mealName: normalizeMealName(foodPhoto.mealName) || guessMealName(),
    detectedFood,
    portionSummary: foodPhoto.portionSummary || fallback.portionSummary,
    estimatedKcal: toSheetNumber(foodPhoto.estimatedKcal) || midpoint(estimatedKcalMin, estimatedKcalMax) || fallback.estimatedKcal,
    estimatedKcalMin,
    estimatedKcalMax,
    proteinG: toSheetNumber(foodPhoto.proteinG) || midpoint(proteinGMin, proteinGMax) || fallback.proteinG,
    carbG: toSheetNumber(foodPhoto.carbG) || midpoint(carbGMin, carbGMax) || fallback.carbG,
    fatG: toSheetNumber(foodPhoto.fatG) || midpoint(fatGMin, fatGMax) || fallback.fatG,
    sugarLevel: foodPhoto.sugarLevel || 'unknown',
    sodiumLevel: foodPhoto.sodiumLevel || 'unknown',
    confidence: foodPhoto.confidence || 'medium',
    note: 'Photo-only estimate confirmed by user.',
    rawText: foodPhoto.rawObservation || ''
  };
}

function formatFoodPhotoDraftMessage(draft) {
  return `ผมประเมินจากรูปว่า:

มื้อ: ${draft.mealName || '-'}
อาหาร: ${draft.detectedFood || '-'}
ปริมาณที่เดา: ${draft.portionSummary || '-'}

ประมาณ:
แคลอรี่: ${formatRange(draft.estimatedKcalMin, draft.estimatedKcalMax, draft.estimatedKcal)} kcal
โปรตีน: ${draft.proteinG || '-'} g
คาร์บ: ${draft.carbG || '-'} g
ไขมัน: ${draft.fatG || '-'} g
ความมั่นใจ: ${draft.confidence || 'medium'}

ถ้าถูกต้อง พิมพ์ "ยืนยัน"
ถ้าจะแก้ พิมพ์ "แก้ ข้าว 1 ทัพพี ไข่ดาว 1 ฟอง"
ถ้าไม่บันทึก พิมพ์ "ยกเลิก"`;
}

function formatFoodSavedMessage(result) {
  return `บันทึกอาหารเรียบร้อยครับ

มื้อ: ${result.mealName || '-'}
อาหาร: ${result.detectedFood || '-'}
แคลอรี่: ${result.estimatedKcal || '-'} kcal
โปรตีน: ${result.proteinG || '-'} g
คาร์บ: ${result.carbG || '-'} g
ไขมัน: ${result.fatG || '-'} g
ความมั่นใจ: ${result.confidence || 'medium'}`;
}

function formatRange(min, max, fallback) {
  if (min && max) return `${min}-${max}`;
  return fallback || '-';
}

function getFoodPhotoFallback(foodPhoto) {
  const text = [
    foodPhoto.detectedFood,
    foodPhoto.portionSummary,
    foodPhoto.rawObservation,
    foodPhoto.note
  ].join(' ').toLowerCase();

  const hasRice = /rice|ข้าว/.test(text);
  const hasChicken = /chicken|ไก่/.test(text);
  const hasEgg = /egg|ไข่/.test(text);

  if (hasRice && hasChicken && hasEgg) {
    return {
      detectedFood: 'ข้าวไก่ราดข้าว + ไข่ดาว',
      portionSummary: 'ข้าว 1.5-2 ทัพพี, ไก่ 1 ส่วน, ไข่ดาว 1 ฟอง',
      estimatedKcalMin: 650,
      estimatedKcalMax: 950,
      estimatedKcal: 800,
      proteinG: 35,
      carbG: 85,
      fatG: 35
    };
  }

  if (hasRice) {
    return {
      detectedFood: 'ข้าวราดกับข้าว',
      portionSummary: 'ข้าว 1.5-2 ทัพพี, กับข้าว 1 ส่วน',
      estimatedKcalMin: 550,
      estimatedKcalMax: 850,
      estimatedKcal: 700,
      proteinG: 25,
      carbG: 80,
      fatG: 25
    };
  }

  return {
    detectedFood: 'อาหารจากภาพ',
    portionSummary: 'ประมาณ 1 จาน',
    estimatedKcalMin: 400,
    estimatedKcalMax: 800,
    estimatedKcal: 600,
    proteinG: 20,
    carbG: 50,
    fatG: 25
  };
}

function normalizeFoodName(value) {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();

  if (/chicken/.test(lower) && /rice/.test(lower) && /egg/.test(lower)) {
    return 'ข้าวไก่ราดข้าว + ไข่ดาว';
  }

  if (/chicken/.test(lower) && /rice/.test(lower)) {
    return 'ข้าวไก่ราดข้าว';
  }

  return text;
}

function normalizeMealName(value) {
  const text = String(value || '').trim();

  if (!text) return '';
  if (/มื้อเช้า|เช้า|breakfast/i.test(text)) return 'มื้อเช้า';
  if (/มื้อเที่ยง|เที่ยง|กลางวัน|lunch/i.test(text)) return 'มื้อเที่ยง';
  if (/มื้อเย็น|เย็น|dinner/i.test(text)) return 'มื้อเย็น';
  if (/ของว่าง|snack/i.test(text)) return 'ของว่าง';

  return '';
}

function midpoint(min, max) {
  if (min && max) return Math.round((Number(min) + Number(max)) / 2);
  return min || max || '';
}

function guessMealName() {
  const hour = Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    hour12: false
  }).format(new Date()));

  if (hour >= 5 && hour < 10) return 'มื้อเช้า';
  if (hour >= 10 && hour < 15) return 'มื้อเที่ยง';
  if (hour >= 15 && hour < 18) return 'ของว่าง';
  return 'มื้อเย็น';
}

function getFoodCorrectionText(text) {
  return String(text || '')
    .replace(/^(แก้ไข|แก้|edit)\s*/i, '')
    .trim();
}

function isConfirmText(text) {
  const normalized = normalizeText(text);

  return ['ยืนยัน', 'ถูกต้อง', 'ใช่', 'บันทึก', 'confirm', 'ok', 'okay'].includes(normalized);
}

function isCancelText(text) {
  const normalized = normalizeText(text);

  return ['ยกเลิก', 'cancel', 'ไม่บันทึก'].includes(normalized);
}

setInterval(() => {
  processedMessages.clear();
  clearOldPendingFoodPhotos();
  console.log('Processed message cache cleared');
}, 1000 * 60 * 60);

function clearOldPendingFoodPhotos() {
  const cutoff = Date.now() - (1000 * 60 * 60 * 6);

  for (const [userId, pending] of pendingFoodPhotos.entries()) {
    if ((pending.createdAt || 0) < cutoff) {
      pendingFoodPhotos.delete(userId);
    }
  }
}

function wakeAnalysisApiSoon() {
  setTimeout(() => {
    wakeAnalysisApi().catch((error) => {
      console.error('Background Python analysis API wake failed:', error.message);
    });
  }, 0);
}

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
