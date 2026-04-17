# syntax=docker/dockerfile:1
# 本地先构建前端（须带 Docker 同域代理开关），再放入本镜像。
#   npm ci && npm run build
# 建议在 .env.production 或构建命令前设置:
#   VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true
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
COPY server/ ./server/
COPY docker/entrypoint.sh /entrypoint.sh
# Windows 构建上下文常为 CRLF，strip 后 shebang 才能被内核正确识别
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV BIND_HOST=0.0.0.0
EXPOSE 80

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
