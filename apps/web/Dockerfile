FROM node:24-alpine AS deps
WORKDIR /app
COPY . .
RUN npm ci

FROM deps AS build
RUN npm run build --workspace=@testhistory/web

FROM nginx:1.27-alpine AS runtime
ENV TESTHISTORY_API_UPSTREAM=http://api:8080
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN mkdir -p /etc/nginx/templates \
  && printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  server_name _;' \
    '' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '' \
    '  location = /index.html {' \
    '    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;' \
    '    expires -1;' \
    '  }' \
    '' \
    '  location / {' \
    '    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;' \
    '    try_files $uri /index.html;' \
    '  }' \
    '' \
    '  location /api/ {' \
    '    proxy_pass ${TESTHISTORY_API_UPSTREAM}/api/;' \
    '  }' \
    '' \
    '  location /health {' \
    '    proxy_pass ${TESTHISTORY_API_UPSTREAM}/health;' \
    '  }' \
    '}' \
    > /etc/nginx/templates/default.conf.template
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/
