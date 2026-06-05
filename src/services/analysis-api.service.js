const DEFAULT_ANALYSIS_API_TIMEOUT_MS = 60000;

async function analyzeLineImage(imageBuffer, metadata = {}) {
  const response = await postAnalysis('/analyze-image', {
    imageBase64: imageBuffer.toString('base64'),
    mimeType: metadata.mimeType || 'image/jpeg',
    messageId: metadata.messageId || '',
    userId: metadata.userId || ''
  });

  return normalizeAnalysisEnvelope(response);
}

async function completeFoodPhotoLog(preliminaryNutrition, userCorrectionText) {
  const response = await postAnalysis('/complete-food-photo', {
    preliminaryNutrition,
    userCorrectionText
  });

  return normalizeAnalysisEnvelope(response);
}

async function postAnalysis(path, body) {
  const baseUrl = (process.env.PYTHON_ANALYSIS_API_URL || '').replace(/\/$/, '');

  if (!baseUrl) {
    throw new Error('PYTHON_ANALYSIS_API_URL is required');
  }

  const targetUrl = `${baseUrl}${path}`;
  console.log('Calling Python analysis API:', {
    path,
    target: maskUrl(targetUrl)
  });

  const controller = new AbortController();
  const timeoutMs = Number(process.env.PYTHON_ANALYSIS_API_TIMEOUT_MS || DEFAULT_ANALYSIS_API_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      'content-type': 'application/json'
    };

    if (process.env.PYTHON_ANALYSIS_API_KEY) {
      headers['x-api-key'] = process.env.PYTHON_ANALYSIS_API_KEY;
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    const responseMeta = {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      bodySnippet: text.slice(0, 300)
    };
    const data = parseJsonResponse(text, targetUrl, responseMeta);

    if (!response.ok) {
      throw new Error(data.error || `Python analysis API returned ${response.status} from ${maskUrl(targetUrl)}`);
    }

    return data;
  } catch (error) {
    console.error('Python analysis API call failed:', {
      path,
      target: maskUrl(targetUrl),
      message: error.message
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonResponse(text, targetUrl, responseMeta = {}) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    const detail = [
      `Python analysis API returned non-JSON from ${maskUrl(targetUrl)}`,
      `status=${responseMeta.status || '-'}`,
      `contentType=${responseMeta.contentType || '-'}`,
      `body=${JSON.stringify(responseMeta.bodySnippet || '')}`
    ].join(' ');

    throw new Error(detail);
  }
}

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
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
  completeFoodPhotoLog
};
