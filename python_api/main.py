import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


API_VERSION = "1.0"
DEFAULT_MODEL = "gpt-4o-mini"
MAX_BODY_BYTES = 15 * 1024 * 1024


def load_env_file(path=None):
    if path is None:
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")

    if not os.path.exists(path):
        fallback_path = ".env"
        if not os.path.exists(fallback_path):
            return
        path = fallback_path

    with open(path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            text = line.strip()
            if not text or text.startswith("#") or "=" not in text:
                continue

            key, value = text.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value.replace("\\n", "\n")


class AnalysisHandler(BaseHTTPRequestHandler):
    server_version = "LineAnalysisPythonAPI/1.0"

    def do_HEAD(self):
        if self.path in ("/", "/health"):
            return self.write_empty(200)

        return self.write_empty(404)

    def do_GET(self):
        if self.path in ("/", "/health"):
            return self.write_json(200, {"status": "ok", "service": "python-analysis-api"})

        return self.write_json(404, {"error": "not found"})

    def do_POST(self):
        if not self.is_authorized():
            return self.write_json(401, {"error": "unauthorized"})

        try:
            payload = self.read_json_body()

            if self.path == "/analyze-image":
                result = analyze_image(payload)
            elif self.path == "/complete-food-photo":
                result = complete_food_photo(payload)
            else:
                return self.write_json(404, {"error": "not found"})

            return self.write_json(200, result)
        except ValueError as exc:
            return self.write_json(400, {"error": str(exc)})
        except Exception as exc:
            print(f"Request failed: {exc}", file=sys.stderr)
            return self.write_json(500, {"error": "analysis failed"})

    def is_authorized(self):
        api_key = os.environ.get("PYTHON_ANALYSIS_API_KEY", "").strip()
        if not api_key:
            return True

        return self.headers.get("x-api-key", "") == api_key

    def read_json_body(self):
        length = int(self.headers.get("content-length", "0"))
        if length <= 0:
            raise ValueError("request body is required")
        if length > MAX_BODY_BYTES:
            raise ValueError("request body is too large")

        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("invalid JSON body") from exc

    def write_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def write_empty(self, status):
        self.send_response(status)
        self.send_header("content-length", "0")
        self.end_headers()

    def log_message(self, fmt, *args):
        print(f"{self.log_date_time_string()} {fmt % args}", file=sys.stderr)


def analyze_image(request):
    image_base64 = str(request.get("imageBase64", "")).strip()
    mime_type = str(request.get("mimeType", "image/jpeg")).strip() or "image/jpeg"

    if not image_base64:
        raise ValueError("imageBase64 is required")

    validate_base64(image_base64)

    messages = [
        {
            "role": "system",
            "content": "You classify LINE image uploads and extract structured data. Return valid JSON only.",
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": build_image_prompt(),
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_base64}"
                    },
                },
            ],
        },
    ]

    data = call_openai_json(messages)
    return normalize_envelope(data)


def complete_food_photo(request):
    preliminary = request.get("preliminaryNutrition") or {}
    correction = str(request.get("userCorrectionText", "")).strip()

    if not correction:
        raise ValueError("userCorrectionText is required")

    messages = [
        {
            "role": "system",
            "content": "You estimate Thai meal nutrition from a prior food-photo draft plus user correction text. Return valid JSON only.",
        },
        {
            "role": "user",
            "content": f"""
Prior nutrition draft:
{json.dumps(preliminary, ensure_ascii=False, indent=2)}

User correction text:
{correction}

Return the same envelope format:
{{
  "version": "{API_VERSION}",
  "documentKind": "nutrition",
  "sourceType": "food_photo_with_user_edit",
  "confidence": "low or medium or high",
  "payload": {{
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
  }}
}}

Rules:
- Prefer the user's correction text over the prior draft.
- If user only corrects one item, keep compatible details from the prior draft.
- Use Thai meal names when present, such as มื้อเช้า, มื้อเที่ยง, มื้อเย็น, ของว่าง.
- Use numeric values without units.
- estimatedKcal should be the midpoint of estimatedKcalMin and estimatedKcalMax when a range is useful.
- rawText must include the user's correction text.
""",
        },
    ]

    data = call_openai_json(messages)
    envelope = normalize_envelope(data)
    envelope["documentKind"] = "nutrition"
    envelope["sourceType"] = "food_photo_with_user_edit"
    envelope["payload"]["needsConfirmation"] = False
    envelope["payload"]["userPortionText"] = envelope["payload"].get("userPortionText") or correction
    return envelope


def build_image_prompt():
    return f"""
Classify this image and return one JSON envelope.

Envelope:
{{
  "version": "{API_VERSION}",
  "documentKind": "transaction or body_metrics or nutrition or unknown",
  "sourceType": "transfer_slip or receipt or body_metrics_screenshot or app_screenshot or food_photo or unknown",
  "confidence": "low or medium or high",
  "payload": {{}}
}}

Payload for transaction:
{{
  "documentType": "Bill or Transfer Slip",
  "shopOrBankName": "",
  "amount": "",
  "transactionDate": "",
  "referenceNo": "",
  "category": "Food or Transport or Fuel or Shopping or Transfer or Utility or Health or Other",
  "description": "",
  "rawText": ""
}}

Payload for body_metrics:
{{
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
}}

Payload for nutrition from food tracking app screenshot:
{{
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
}}

Payload for nutrition from real food photo:
{{
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
}}

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
- For app screenshots, extract visible values directly and set needsConfirmation=false.
- For body metrics, reportDate is only a date printed inside the image; use empty string if no date is visible.
- For transaction category: food/restaurant/market/coffee=>Food, fuel/gas=>Fuel, taxi/train/parking=>Transport, electricity/water/internet/phone=>Utility, hospital/pharmacy=>Health, bank transfer without clear purpose=>Transfer, shopping/mall/online=>Shopping, unsure=>Other.
"""


def call_openai_json(messages):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required")

    print("Calling OpenAI from Python analysis API", flush=True)

    body = {
        "model": os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        "response_format": {"type": "json_object"},
        "messages": messages,
    }

    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=int(os.environ.get("OPENAI_TIMEOUT_SECONDS", "60"))) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI HTTP {exc.code}: {detail}") from exc

    content = response_body["choices"][0]["message"]["content"]
    return json.loads(content)


def normalize_envelope(data):
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    document_kind = normalize_document_kind(data.get("documentKind"))
    source_type = str(data.get("sourceType") or payload.get("sourceType") or "").strip()

    if document_kind == "nutrition":
        if source_type in ("", "unknown"):
            source_type = "food_photo" if truthy(payload.get("needsConfirmation")) else "app_screenshot"
        payload["sourceType"] = source_type

    return {
        "version": str(data.get("version") or API_VERSION),
        "documentKind": document_kind,
        "sourceType": source_type or "unknown",
        "confidence": normalize_confidence(data.get("confidence") or payload.get("confidence")),
        "payload": payload,
    }


def normalize_document_kind(value):
    text = re.sub(r"\s+", "_", str(value or "").strip().lower())
    if text in ("transaction", "bill", "receipt", "transfer_slip"):
        return "transaction"
    if text in ("body_metrics", "health", "health_report"):
        return "body_metrics"
    if text in ("nutrition", "nutrition_log", "food_log", "food_photo", "meal_photo"):
        return "nutrition"
    return "unknown"


def normalize_confidence(value):
    text = str(value or "").strip().lower()
    if text in ("low", "medium", "high"):
        return text
    return "medium"


def truthy(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in ("true", "yes", "1")


def validate_base64(value):
    try:
        base64.b64decode(value, validate=True)
    except Exception as exc:
        raise ValueError("imageBase64 must be valid base64") from exc


def main():
    load_env_file()

    host = os.environ.get("PYTHON_ANALYSIS_API_HOST", "0.0.0.0")
    port = int(os.environ.get("PYTHON_ANALYSIS_API_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AnalysisHandler)
    print(f"Python analysis API listening on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
