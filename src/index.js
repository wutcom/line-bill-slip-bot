import 'dotenv/config';
import express from 'express';
import line from '@line/bot-sdk';
import OpenAI from 'openai';
import { google } from 'googleapis';

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const lineClient = new line.Client(lineConfig);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.send('LINE Bill Slip Bot is running');
});

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message') return;

  if (event.message.type !== 'image') {
    return lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'กรุณาส่งรูปบิลหรือสลิปโอนเงินครับ'
    });
  }

  try {
    const imageBuffer = await downloadLineImage(event.message.id);
    const result = await analyzeImage(imageBuffer);

    await appendToGoogleSheet({
      userId: event.source.userId || '',
      ...result
    });

    const replyText =
`บันทึกข้อมูลเรียบร้อยครับ

ประเภท: ${result.documentType || '-'}
ร้านค้า/ธนาคาร: ${result.shopOrBankName || '-'}
ยอดเงิน: ${result.amount || '-'}
วันที่: ${result.transactionDate || '-'}
เลขอ้างอิง: ${result.referenceNo || '-'}`;

    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText
    });
  } catch (error) {
    console.error('Process image error:', error);

    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขออภัยครับ ไม่สามารถอ่านรูปนี้ได้ กรุณาลองส่งรูปใหม่อีกครั้ง'
    });
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
        content: 'You extract information from Thai bills and bank transfer slips. Return valid JSON only.'
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

async function appendToGoogleSheet(data) {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const values = [[
    new Date().toISOString(),
    data.userId,
    data.documentType,
    data.shopOrBankName,
    data.amount,
    data.transactionDate,
    data.referenceNo,
    data.description,
    data.rawText
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${process.env.SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values
    }
  });
}

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
