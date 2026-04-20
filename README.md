# weaviate-web-client

基于 Vue 3 + Element Plus 的 Weaviate 向量库 Web 客户端，功能与验收以 `docs/WEAVIATE_CLIENT_SPEC.md` 为准。英文说明见 [`README_EN.md`](README_EN.md)。

## 架构（BFF）

浏览器**不直连** Weaviate，只请求**同域** `/weaviate`，由 **Node BFF**（`server/`、`tsx`）按请求头 `Authorization` / `X-Weaviate-Target` 转发到真实实例；服务端加载官方 [`weaviate-client`](https://www.npmjs.com/package/weaviate-client)（见 `server/weaviateOfficialClient.ts`），便于后续把读写在 BFF 内改为 SDK 调用。

| 环境 | 行为 |
|------|------|
| `npm run dev` | 并发：`dev:bff`（默认 `127.0.0.1:8787`）+ Vite；Vite 将 `/weaviate`、`/embedding` 代理到 BFF（`VITE_WEAVIATE_BFF_TARGET`） |
| `npm run build` 产物 / Docker | 静态资源由 Nginx 提供；`/weaviate`、`/embedding` 反代到容器内 Node BFF（`PORT`，默认与镜像中 `3000` 一致） |

连接失败（`ERR_NETWORK`）时的提示可在 **Vite 环境** 中覆盖（未设置则用 i18n 默认句）：

| 变量 | 生效场景 |
|------|-----------|
| `VITE_CONNECTION_NETWORK_MESSAGE_DEVELOPMENT` | 仅 `npm run dev`（`import.meta.env.DEV === true`） |
| `VITE_CONNECTION_NETWORK_MESSAGE_PRODUCTION` | 仅生产包：`npm run build` 产物、`vite preview`、镜像部署等（`import.meta.env.PROD === true`） |
| `VITE_CONNECTION_NETWORK_MESSAGE` | 上述未配置时的通用回退 |

优先级：**分环境变量** > **通用变量** > **多语言默认**。见仓库根目录 `.env.example`。

### 嵌入 API

OpenAI 兼容嵌入请求走同域 **`/embedding`**（`X-Embedding-Target` 为用户配置的 API 根地址，如 `https://api.openai.com/v1`），由 **BFF** 转发，避免浏览器直连第三方嵌入服务时的 CORS。无有效请求头时 BFF 可回退 `EMBEDDING_PROXY_TARGET`（默认 `https://api.openai.com/v1`）。

## 本地开发

```bash
npm install
npm run dev
```

将**同时**启动 Node BFF 与 Vite（`concurrently`）。浏览器访问开发服务器地址（默认 `http://localhost:5173`）。

若只需前端、且自行在外部提供 `/weaviate` 转发，可只运行 `npm run dev:vite`，并保证 `VITE_WEAVIATE_BFF_TARGET` 指向可达的 BFF。

- BFF 无有效 `X-Weaviate-Target` 时回退 `WEAVIATE_PROXY_TARGET` / `VITE_WEAVIATE_PROXY_TARGET`（默认 `http://127.0.0.1:8080`）。
- `vite preview` 同样通过 Vite 配置将 `/weaviate` 代理到 BFF，**请先**运行 `npm run start:proxy`（或 Docker 中的 Node）。

## 构建

默认 `npm run build` 使用 Vite 的 **production** 模式（与 `npm run build:prod` 等价），并加载根目录 `.env`、`.env.production` 等。

按**打包环境**切换时，使用 `--mode` 与对应的 `.env.[mode]` 文件，例如预发 **staging**：

```bash
npm run build:staging   # 读取 .env.staging + 通用 .env
npm run preview:staging # 预览 staging 构建产物时的 server 侧环境（若需在 vite.config 里用 env）
```

| 脚本 | 说明 |
|------|------|
| `build` / `build:prod` | `production` 模式 |
| `build:staging` | `staging` 模式（需自建 `.env.staging`） |
| `dev:staging` | 与 `dev` 相同，但 Vite 使用 `staging` 模式 |
| `preview:staging` | 预览时 `staging` 模式（与默认 `preview` 相对） |

```bash
npm run build
npm run start:proxy   # 另开终端：BFF 监听 8787（或设置 PORT）
npm run preview       # 默认将 /weaviate 转到 VITE_WEAVIATE_BFF_TARGET
```

## Docker 部署

镜像是 **Node 24 bookworm-slim + Nginx** 双进程：Nginx 提供 `dist` 静态资源并把 `/weaviate` **反代**到本机 **Node BFF（tsx + `server/`）**。基础镜像为官方 `node:24-bookworm-slim`，容器内 `apt` 安装 `nginx`。详见根目录 `Dockerfile`、`docker/nginx-default.conf`、`docker/entrypoint.sh`。

**1. 本地编译**

```bash
npm ci
npm run build
```

**2. 构建镜像**

```bash
docker build -t weaviate-web-client:latest .
```

**3. 运行容器**

`WEAVIATE_PROXY_TARGET` 为未带 `X-Weaviate-Target` 时的回退地址（与开发时 `VITE_WEAVIATE_PROXY_TARGET` 语义一致）：

```bash
docker run --rm -e WEAVIATE_PROXY_TARGET=http://host.docker.internal:8080 -p 8080:80 weaviate-web-client:latest
```

示例将容器 **80** 映射到本机 **8080**，浏览器访问 `http://localhost:8080`。静态资源走 Nginx；Weaviate API 走同域 `/weaviate`，由 Node BFF 按请求头转发。

若仅部署静态文件而无 BFF，需自行在网关实现与 `weaviate-proxy-core` 等价的转发（不推荐，将失去统一鉴权与官方客户端扩展点）。

## 技术栈

Vue 3、TypeScript、Vite、Pinia、Vue Router、Element Plus、Axios（经 BFF 访问 Weaviate REST/GraphQL）；Node 侧集成 `weaviate-client`、`http-proxy`。
