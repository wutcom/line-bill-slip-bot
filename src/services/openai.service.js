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
- nutrition_log: screenshot from a food tracking app with calories, macros, meal, or food list text.
- food_photo: real camera photo of cooked food, plate, meal, snack, or drink.
- unknown: anything else.

If the image is body_metrics, do not treat the health numbers as money.
If the image is food_photo, provide only a preliminary visual estimate and ask for portion details later.

Return JSON exactly in this shape:
{
  "documentKind": "transaction or body_metrics or nutrition_log or food_photo or unknown",
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
  },
  "nutritionLog": {
    "logDate": "",
    "mealName": "",
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
    "rawText": "",
    "confidence": ""
  },
  "foodPhoto": {
    "detectedFood": "",
    "estimatedKcalMin": "",
    "estimatedKcalMax": "",
    "proteinGMin": "",
    "proteinGMax": "",
    "carbGMin": "",
    "carbGMax": "",
    "fatGMin": "",
    "fatGMax": "",
    "portionQuestions": "",
    "confidence": "",
    "rawObservation": ""
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

Nutrition log screenshot rules:
- Extract visible macro values and goals when shown, for example 41/139 g means proteinG=41 and proteinGoalG=139.
- foodItems can be a compact semicolon-separated list.

Food photo rules:
- detectedFood should be a concise Thai/English description of the likely foods.
- Use ranges for nutrition because photo-only estimates are uncertain.
- portionQuestions should ask for meal name, rice/noodle amount, protein type, serving size, egg count, drink/sauce if relevant.
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

async function completeFoodPhotoLog(preliminaryFoodPhoto, userPortionText) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You estimate Thai meal nutrition from visual analysis plus user-provided portion details. Return valid JSON only.'
      },
      {
        role: 'user',
        content: `
Preliminary food photo analysis:
${JSON.stringify(preliminaryFoodPhoto || {}, null, 2)}

User portion details:
${userPortionText}

Estimate nutrition for a Google Sheet log. Prefer the user's portion details over the visual guess.
Use common Thai serving assumptions:
- cooked rice 1 ladle/tup-phee is about 80-100 kcal depending on size; 2 ladles is often 160-220 kcal.
- fried egg is often 180-250 kcal.
- stir-fried curry/pad prik gaeng with pork 1 ladle is often 250-400 kcal depending on oil and meat.
- If uncertain, keep ranges and set confidence to medium.

Return JSON exactly in this shape:
{
  "logDate": "",
  "mealName": "",
  "detectedFood": "",
  "userPortionText": "",
  "estimatedKcal": "",
  "estimatedKcalMin": "",
  "estimatedKcalMax": "",
  "proteinG": "",
  "carbG": "",
  "fatG": "",
  "sugarLevel": "low or medium or high or unknown",
  "sodiumLevel": "low or medium or high or unknown",
  "confidence": "low or medium or high",
  "note": "",
  "rawText": ""
}

Rules:
- logDate is empty unless the user explicitly says a date.
- mealName should be breakfast/lunch/dinner/snack in Thai if user says มื้อเช้า/มื้อเที่ยง/มื้อเย็น/ของว่าง.
- Put numbers without units.
- estimatedKcal should be the midpoint of the range.
- rawText should include the user's portion text.
`
      }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

module.exports = {
  analyzeImage,
  analyzeLineImage,
  completeFoodPhotoLog
};
