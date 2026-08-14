FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENV CI=1 \
  npm_config_cache=/root/.npm

CMD ["npm", "run", "check"]
