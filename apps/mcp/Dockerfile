FROM node:24-alpine AS deps
WORKDIR /app
COPY . .
RUN npm ci

FROM deps AS build
RUN npm run build -w @testhistory/mcp

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/mcp/dist ./apps/mcp/dist
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"testhistory.health","arguments":{}}}' | node apps/mcp/dist/server.js | grep -q 'testhistory-mcp'
CMD ["node", "apps/mcp/dist/server.js"]
