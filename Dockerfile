# syntax=docker/dockerfile:1
# 本地先构建前端再放入本镜像：npm ci && npm run build
# 浏览器一律经同域 /weaviate 由容器内 Node BFF 转发（见 docker/nginx-default.conf）。
#
#   docker build -t weaviate-web-client:latest .

FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && sed -i '/sites-enabled/d' /etc/nginx/nginx.conf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ /usr/share/nginx/html/
COPY docker/nginx-default.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
# 后台迁移任务在 Node 中加载（tsx）；需与 server/migrationJob 的 import 链一致，且勿引入 weaviate.ts（Pinia）
COPY tsconfig.json ./
COPY src/utils/connectionUrl.ts ./src/utils/connectionUrl.ts
COPY src/utils/weaviateVectors.ts ./src/utils/weaviateVectors.ts
COPY src/api/graphqlTransport.ts ./src/api/graphqlTransport.ts
COPY src/api/weaviateCore.ts ./src/api/weaviateCore.ts
COPY src/api/weaviateRemote.ts ./src/api/weaviateRemote.ts
COPY src/api/migrationTypes.ts ./src/api/migrationTypes.ts
COPY src/api/migrationRun.ts ./src/api/migrationRun.ts
COPY server/ ./server/
COPY docker/entrypoint.sh /entrypoint.sh
# Windows 构建上下文常为 CRLF，strip 后 shebang 才能被内核正确识别
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV BIND_HOST=0.0.0.0
EXPOSE 80

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
