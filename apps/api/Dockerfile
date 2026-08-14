FROM node:24-alpine AS deps
WORKDIR /app
COPY . .
RUN npm ci

FROM deps AS build
RUN npm run build -w @testhistory/contracts \
  && npm run build -w @testhistory/allure-parser \
  && npm run build -w @testhistory/artifacts \
  && npm run build -w @testhistory/domain \
  && npm run build -w @testhistory/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages ./packages
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
