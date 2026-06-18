FROM node:22-bookworm-slim AS bot

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install && npx prisma generate && npm prune --omit=dev

COPY src ./src

EXPOSE 3000
CMD ["npm", "start"]


FROM node:22-bookworm-slim AS dashboard

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY src ./src
COPY dashboard ./dashboard

WORKDIR /app/dashboard
RUN npm install \
  && npx prisma generate --schema=../prisma/schema.prisma \
  && npm run build \
  && npm prune --omit=dev

EXPOSE 3001
CMD ["sh", "-c", "npm run start -- -H 0.0.0.0 -p ${PORT:-3001}"]


FROM python:3.12-slim AS python-api

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY python_api/requirements.txt ./python_api/requirements.txt
RUN pip install --no-cache-dir -r python_api/requirements.txt

COPY python_api ./python_api

EXPOSE 8000
CMD ["python", "python_api/main.py"]
