const OpenAI = require('openai');

const openai = new OpenAI.OpenAI({
  apiKey: (process.env.OPENAI_API_KEY || '').trim()
});

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
  "category": "",
  "description": "",
  "rawText": ""
}

Category must be one of:
Food, Transport, Fuel, Shopping, Transfer, Utility, Health, Other

Rules:
- Food, restaurant, market, fruit, coffee, drink, cafe, bakery => Food
- Gas station, petrol, diesel, Shell, PT, PTT, Bangchak, Esso, Caltex => Fuel
- Taxi, train, bus, toll, parking, BTS, MRT, Grab, Bolt => Transport
- Electricity, water, internet, phone bill, mobile bill => Utility
- Hospital, pharmacy, medicine, clinic => Health
- Bank transfer without clear purpose => Transfer
- Supermarket, mall, online shopping, clothes, electronics => Shopping
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

async function analyzeLineImage(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You classify LINE image uploads and extract structured data. Return valid JSON only.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
Classify this image as one of:
- transaction: Thai bill, receipt, invoice, or bank transfer slip.
- body_metrics: body composition, smart scale, weight, BMI, BMR, body fat, water, muscle, bone, or health report screenshot.
- unknown: anything else.

If the image is body_metrics, do not treat the health numbers as money.

Return JSON exactly in this shape:
{
  "documentKind": "transaction or body_metrics or unknown",
  "transaction": {
    "documentType": "Bill or Transfer Slip",
    "shopOrBankName": "",
    "amount": "",
    "transactionDate": "",
    "referenceNo": "",
    "category": "",
    "description": "",
    "rawText": "",
    "confidence": ""
  },
  "bodyMetrics": {
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
    "rawText": "",
    "confidence": ""
  }
}

Transaction category must be one of:
Food, Transport, Fuel, Shopping, Transfer, Utility, Health, Other

Transaction category rules:
- Food, restaurant, market, fruit, coffee, drink, cafe, bakery => Food
- Gas station, petrol, diesel, Shell, PT, PTT, Bangchak, Esso, Caltex => Fuel
- Taxi, train, bus, toll, parking, BTS, MRT, Grab, Bolt => Transport
- Electricity, water, internet, phone bill, mobile bill => Utility
- Hospital, pharmacy, medicine, clinic => Health
- Bank transfer without clear purpose => Transfer
- Supermarket, mall, online shopping, clothes, electronics => Shopping
- If unsure => Other

Body metrics rules:
- reportDate is only a date printed inside the report. If no date is visible, use an empty string.
- Extract only visible values. Use empty string for missing values.
- Put numbers without units, for example 85.8 instead of 85.8 kg.
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

module.exports = {
  analyzeImage,
  analyzeLineImage
};
