const sharp = require('sharp');

const API_VERSION = '1.0';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_TIMEOUT_SECONDS = 45;
const DEFAULT_FOOD_MODEL = 'gpt-4o-mini';
const DEFAULT_FOOD_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_IMAGE_MAX_WIDTH = 1280;
const DEFAULT_IMAGE_MAX_HEIGHT = 1280;
const DEFAULT_IMAGE_JPEG_QUALITY = 78;

async function analyzeLineImage(imageBuffer, metadata = {}) {
  const optimizedImage = await optimizeImageForAi(imageBuffer, metadata);
  const imageBase64 = optimizedImage.buffer.toString('base64');
  const mimeType = optimizedImage.mimeType;
  const imageRoute = await classifyImageRoute(imageBase64, mimeType);
  const messages = [
    {
      role: 'system',
      content: 'You classify LINE image uploads and extract structured data. Return valid JSON only.'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: buildImagePrompt()
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`
          }
        }
      ]
    }
  ];

  const data = await callOpenAIJson(messages, 'analyze-image', getProviderOptions(imageRoute));
  return normalizeAnalysisEnvelope(data);
}

async function optimizeImageForAi(imageBuffer, metadata = {}) {
  const originalBytes = imageBuffer.length;
  const maxWidth = Number(process.env.AI_IMAGE_MAX_WIDTH || DEFAULT_IMAGE_MAX_WIDTH);
  const maxHeight = Number(process.env.AI_IMAGE_MAX_HEIGHT || DEFAULT_IMAGE_MAX_HEIGHT);
  const quality = Number(process.env.AI_IMAGE_JPEG_QUALITY || DEFAULT_IMAGE_JPEG_QUALITY);

  try {
    const pipeline = sharp(imageBuffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality,
        mozjpeg: true
      });
    const buffer = await pipeline.toBuffer();

    console.log('AI image optimized:', {
      originalBytes,
      optimizedBytes: buffer.length,
      ratio: originalBytes ? Number((buffer.length / originalBytes).toFixed(2)) : null,
      maxWidth,
      maxHeight,
      quality
    });

    return {
      buffer,
      mimeType: 'image/jpeg'
    };
  } catch (error) {
    console.warn('AI image optimization failed, using original image:', {
      message: error.message,
      originalBytes
    });

    return {
      buffer: imageBuffer,
      mimeType: metadata.mimeType || 'image/jpeg'
    };
  }
}

async function completeFoodPhotoLog(preliminaryNutrition, userCorrectionText) {
  const correction = String(userCorrectionText || '').trim();

  if (!correction) {
    throw new Error('userCorrectionText is required');
  }

  const messages = [
    {
      role: 'system',
      content: 'You estimate Thai meal nutrition from a prior food-photo draft plus user correction text. Return valid JSON only.'
    },
    {
      role: 'user',
      content: `Prior nutrition draft:
${JSON.stringify(preliminaryNutrition || {}, null, 2)}

User correction text:
${correction}

Return the same envelope format:
{
  "version": "${API_VERSION}",
  "documentKind": "nutrition",
  "sourceType": "food_photo_with_user_edit",
  "confidence": "low or medium or high",
  "payload": {
    "logDate": "",
    "mealName": "",
    "detectedFood": "",
    "portionSummary": "",
    "userPortionText": "",
    "estimatedKcal": "",
    "estimatedKcalMin": "",
    "estimatedKcalMax": "",
    "proteinG": "",
    "carbG": "",
    "fatG": "",
    "sugarLevel": "low or medium or high or unknown",
    "sodiumLevel": "low or medium or high or unknown",
    "needsConfirmation": false,
    "note": "",
    "rawText": ""
  }
}

Rules:
- Prefer the user's correction text over the prior draft.
- If user only corrects one item, keep compatible details from the prior draft.
- mealName must be only one of: "มื้อเช้า", "มื้อเที่ยง", "มื้อเย็น", "ของว่าง", or empty string. Do not put the dish name in mealName.
- Put the dish/menu name in detectedFood only.
- Use numeric values without units.
- estimatedKcal should be the midpoint of estimatedKcalMin and estimatedKcalMax when a range is useful.
- rawText must include the user's correction text.`
    }
  ];

  const data = await callOpenAIJson(messages, 'complete-food-photo', getProviderOptions('food'));
  const envelope = normalizeAnalysisEnvelope(data);
  envelope.documentKind = 'nutrition';
  envelope.sourceType = 'food_photo_with_user_edit';
  envelope.payload.sourceType = 'food_photo_with_user_edit';
  envelope.payload.needsConfirmation = false;
  envelope.payload.userPortionText = envelope.payload.userPortionText || correction;

  return envelope;
}

async function wakeAnalysisApi() {
  console.log('AI analysis wake skipped: Node calls OpenAI-compatible API directly');
  return true;
}

async function classifyImageRoute(imageBase64, mimeType) {
  const messages = [
    {
      role: 'system',
      content: 'Classify a LINE image for routing. Return valid JSON only.'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Return JSON only:
{
  "route": "food or default",
  "reason": ""
}

Rules:
- route="food" for real food photos, cooked meals, plates, snacks, drinks, or food tracking app screenshots.
- route="default" for bills, receipts, transfer slips, body composition screenshots, health screenshots, and anything else.`
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`
          }
        }
      ]
    }
  ];

  try {
    const result = await callOpenAIJson(messages, 'classify-image-route', getProviderOptions('food'));
    const route = String(result?.route || '').trim().toLowerCase();

    if (route === 'food') {
      console.log('Image analysis provider route:', {
        route: 'food',
        reason: result?.reason || ''
      });
      return 'food';
    }
  } catch (error) {
    console.warn('Food route classification failed, using default provider:', {
      message: error.message
    });
  }

  console.log('Image analysis provider route:', { route: 'default' });
  return 'default';
}

async function callOpenAIJson(messages, context, providerOptions = {}) {
  const apiKey = String(providerOptions.apiKey || '').trim();

  if (!apiKey) {
    throw new Error(`${providerOptions.apiKeyName || 'OPENAI_API_KEY'} is required for image analysis`);
  }

  const baseUrl = String(providerOptions.baseUrl || DEFAULT_OPENAI_BASE_URL).trim().replace(/\/$/, '');
  const model = providerOptions.model || DEFAULT_MODEL;
  const timeoutSeconds = Number(providerOptions.timeoutSeconds || DEFAULT_OPENAI_TIMEOUT_SECONDS);
  const targetUrl = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const body = {
    model,
    response_format: { type: 'json_object' },
    messages
  };

  try {
    console.log('Calling OpenAI-compatible API from Node:', {
      context,
      provider: providerOptions.name || 'default',
      baseUrl: maskUrl(baseUrl),
      model
    });

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API returned ${response.status}: ${truncateText(responseText, 1000)}`);
    }

    const responseJson = parseJson(responseText, targetUrl);
    const content = responseJson?.choices?.[0]?.message?.content;
    const data = parseJsonContent(content);

    logOpenAIResult(context, data);
    return data;
  } catch (error) {
    console.error('OpenAI-compatible API call failed:', {
      context,
      provider: providerOptions.name || 'default',
      target: maskUrl(targetUrl),
      message: error.message
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderOptions(route) {
  if (route === 'food') {
    const foodBaseUrl = process.env.OPENAI_FOOD_BASE_URL || DEFAULT_FOOD_OPENAI_BASE_URL;
    const canReuseDefaultApiKey = normalizeBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL) === normalizeBaseUrl(foodBaseUrl);
    const apiKey = process.env.OPENAI_FOOD_API_KEY || (canReuseDefaultApiKey ? process.env.OPENAI_API_KEY : '');

    return {
      name: 'food-openai',
      apiKeyName: canReuseDefaultApiKey ? 'OPENAI_FOOD_API_KEY or OPENAI_API_KEY' : 'OPENAI_FOOD_API_KEY',
      apiKey,
      baseUrl: foodBaseUrl,
      model: process.env.OPENAI_FOOD_MODEL || DEFAULT_FOOD_MODEL,
      timeoutSeconds: process.env.OPENAI_FOOD_TIMEOUT_SECONDS || process.env.OPENAI_TIMEOUT_SECONDS || DEFAULT_OPENAI_TIMEOUT_SECONDS
    };
  }

  return {
    name: 'default',
    apiKeyName: 'OPENAI_API_KEY',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    timeoutSeconds: process.env.OPENAI_TIMEOUT_SECONDS || DEFAULT_OPENAI_TIMEOUT_SECONDS
  };
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '').toLowerCase();
}

function parseJson(value, targetUrl) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`OpenAI-compatible API returned invalid JSON from ${maskUrl(targetUrl)} body=${truncateText(value, 500)}`);
  }
}

function parseJsonContent(content) {
  const text = String(content || '').trim();

  if (!text) {
    throw new Error('OpenAI-compatible API returned empty message content');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    throw new Error(`OpenAI-compatible API message content is not valid JSON: ${truncateText(text, 500)}`);
  }
}

function buildImagePrompt() {
  return `Classify this image and return one JSON envelope.

Envelope:
{
  "version": "${API_VERSION}",
  "documentKind": "transaction or body_metrics or nutrition or unknown",
  "sourceType": "transfer_slip or receipt or body_metrics_screenshot or app_screenshot or food_photo or unknown",
  "confidence": "low or medium or high",
  "payload": {}
}

Payload for transaction:
{
  "documentType": "Bill or Transfer Slip",
  "shopOrBankName": "",
  "amount": "",
  "transactionDate": "",
  "referenceNo": "",
  "category": "Food or Transport or Fuel or Shopping or Transfer or Utility or Health or Other",
  "description": "",
  "rawText": ""
}

Payload for body_metrics:
{
  "reportDate": "",
  "weightKg": "",
  "bmi": "",
  "bodyFatPct": "",
  "muscleMassKg": "",
  "musclePct": "",
  "boneMassPct": "",
  "bmrKcal": "",
  "waterPct": "",
  "fatMassKg": "",
  "fatFreeWeightKg": "",
  "rawText": ""
}

Payload for nutrition from food tracking app screenshot:
{
  "logDate": "",
  "mealName": "",
  "sourceType": "app_screenshot",
  "totalKcal": "",
  "mealKcal": "",
  "exerciseKcal": "",
  "proteinG": "",
  "proteinGoalG": "",
  "carbG": "",
  "carbGoalG": "",
  "fatG": "",
  "fatGoalG": "",
  "weightKg": "",
  "waistInch": "",
  "foodItems": "",
  "needsConfirmation": false,
  "rawText": ""
}

Payload for nutrition from real food photo:
{
  "logDate": "",
  "mealName": "",
  "sourceType": "food_photo",
  "detectedFood": "",
  "portionSummary": "",
  "estimatedKcal": "",
  "estimatedKcalMin": "",
  "estimatedKcalMax": "",
  "proteinG": "",
  "carbG": "",
  "fatG": "",
  "sugarLevel": "low or medium or high or unknown",
  "sodiumLevel": "low or medium or high or unknown",
  "needsConfirmation": true,
  "note": "",
  "rawText": ""
}

Thai food photo rules:
- If the image shows rice with chicken and fried egg, use detectedFood like "ข้าวไก่ผัด/ไก่ราดข้าว + ไข่ดาว" or the closest Thai dish, not English.
- If the dish is uncertain but contains rice + protein + fried egg, still return a usable Thai estimate instead of blanks.
- For a typical Thai rice plate with fried egg, use estimatedKcalMin around 650 and estimatedKcalMax around 950 unless visual portion suggests otherwise.
- Use portionSummary in Thai, for example "ข้าว 1.5-2 ทัพพี, ไก่ 1 ส่วน, ไข่ดาว 1 ฟอง".
- Never leave estimatedKcal, estimatedKcalMin, estimatedKcalMax, proteinG, carbG, or fatG blank for food_photo. Use a reasonable visual estimate.
- mealName must be only one of: "มื้อเช้า", "มื้อเที่ยง", "มื้อเย็น", "ของว่าง", or empty string. Do not put the dish name in mealName.
- Put the dish/menu name in detectedFood only.

Classification rules:
- transaction: Thai bill, receipt, invoice, bank transfer slip, payment slip.
- body_metrics: body composition, smart scale, weight, BMI, BMR, body fat, water, muscle, bone, health report screenshot.
- nutrition with sourceType app_screenshot: food tracking app screenshot with calories, macro numbers, meal sections, or food list text.
- nutrition with sourceType food_photo: real camera photo of cooked food, plate, meal, snack, or drink.
- unknown: anything else.

Extraction rules:
- Use empty string for values that are not visible.
- Use numeric values without units.
- For food photos, make a best visual draft and set needsConfirmation=true.
- For food photos, respond in Thai for mealName, detectedFood, portionSummary, and note.
- For food photos, always provide estimatedKcalMin/estimatedKcalMax and midpoint estimatedKcal.
- For app screenshots, extract visible values directly and set needsConfirmation=false.
- For body metrics, reportDate is only a date printed inside the image; use empty string if no date is visible.
- For transaction category: food/restaurant/market/coffee=>Food, fuel/gas=>Fuel, taxi/train/parking=>Transport, electricity/water/internet/phone=>Utility, hospital/pharmacy=>Health, bank transfer without clear purpose=>Transfer, shopping/mall/online=>Shopping, unsure=>Other.`;
}

function normalizeAnalysisEnvelope(envelope) {
  const payload = envelope?.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
  let documentKind = normalizeDocumentKind(envelope?.documentKind);
  let sourceType = String(envelope?.sourceType || payload.sourceType || '').trim();

  if (documentKind === 'nutrition') {
    if (!sourceType || sourceType === 'unknown') {
      sourceType = truthy(payload.needsConfirmation) ? 'food_photo' : 'app_screenshot';
    }
    payload.sourceType = sourceType;
  }

  return {
    version: envelope?.version || API_VERSION,
    documentKind,
    sourceType: sourceType || 'unknown',
    confidence: normalizeConfidence(envelope?.confidence || payload.confidence),
    payload,
    raw: envelope || {}
  };
}

function normalizeDocumentKind(documentKind) {
  const text = String(documentKind || '').trim().toLowerCase().replace(/\s+/g, '_');

  if (text === 'body_metrics' || text === 'health' || text === 'health_report') return 'body_metrics';
  if (text === 'nutrition' || text === 'nutrition_log' || text === 'food_log' || text === 'food_photo' || text === 'meal_photo') return 'nutrition';
  if (text === 'transaction' || text === 'bill' || text === 'receipt' || text === 'transfer_slip') return 'transaction';

  return 'unknown';
}

function normalizeConfidence(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['low', 'medium', 'high'].includes(text)) return text;
  return 'medium';
}

function truthy(value) {
  if (typeof value === 'boolean') return value;
  return ['true', 'yes', '1'].includes(String(value || '').trim().toLowerCase());
}

function logOpenAIResult(context, data) {
  const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {};
  const summary = {
    context,
    documentKind: data?.documentKind,
    sourceType: data?.sourceType || payload.sourceType,
    confidence: data?.confidence || payload.confidence,
    payloadKeys: Object.keys(payload).sort(),
    payloadPreview: truncateText(JSON.stringify(payload), 1200)
  };

  console.log('OpenAI result summary:', summary);
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...[truncated]`;
}

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    return url;
  }
}

module.exports = {
  analyzeLineImage,
  completeFoodPhotoLog,
  wakeAnalysisApi
};
