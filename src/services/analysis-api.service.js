const OpenAI = require('openai');

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_SECONDS = 45;

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout: Number(process.env.OPENAI_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS) * 1000,
    });
  }
  return openaiClient;
}

function normalizeAnalysisEnvelope(envelope) {
  const payload = envelope?.payload || {};

  return {
    version: envelope?.version || '1.0',
    documentKind: normalizeDocumentKind(envelope?.documentKind),
    sourceType: envelope?.sourceType || '',
    confidence: envelope?.confidence || payload.confidence || '',
    payload,
    raw: envelope || {}
  };
}

function normalizeDocumentKind(documentKind) {
  const text = String(documentKind || '').trim().toLowerCase().replace(/\s+/g, '_');

  if (text === 'body_metrics' || text === 'health' || text === 'health_report') return 'body_metrics';
  if (text === 'nutrition' || text === 'nutrition_log' || text === 'food_log' || text === 'food_photo') return 'nutrition';
  if (text === 'transaction' || text === 'bill' || text === 'receipt' || text === 'transfer_slip') return 'transaction';

  return 'unknown';
}

module.exports = {
  analyzeLineImage,
  completeFoodPhotoLog,
  wakeAnalysisApi
};
