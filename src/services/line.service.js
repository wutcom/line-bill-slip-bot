const line = require('@line/bot-sdk');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const lineClient = new line.Client(lineConfig);

async function replySafe(replyToken, text) {
  if (!replyToken) return;

  try {
    await lineClient.replyMessage(replyToken, { type: 'text', text });
  } catch (e) {
    console.error('Reply error:', e.originalError?.response?.data || e.message);
  }
}

async function pushSafe(userId, text) {
  if (!userId) return;

  try {
    await lineClient.pushMessage(userId, { type: 'text', text });
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

module.exports = {
  line,
  lineConfig,
  lineClient,
  replySafe,
  pushSafe,
  downloadLineImage
};
