FROM node:24-alpine AS deps
WORKDIR /app
COPY . .
RUN npm ci

FROM deps AS build
RUN npm run build -w @testhistory/contracts \
  && npm run build -w @testhistory/artifacts \
  && npm run build -w @testhistory/domain \
  && npm run build -w @testhistory/worker

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages ./packages
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "const required=['DATABASE_URL','REDIS_URL','RABBITMQ_URL','S3_ENDPOINT','S3_BUCKET']; process.exit(required.every((key)=>process.env[key]) && Number.isFinite(Number(process.env.WORKER_HEARTBEAT_MS||30000)) ? 0 : 1)"
CMD ["node", "apps/worker/dist/index.js"]
