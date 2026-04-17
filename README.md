# weaviate-web-client

基于 Vue 3 + Element Plus 的 Weaviate 向量库 Web 客户端，功能与验收以 `docs/WEAVIATE_CLIENT_SPEC.md` 为准。英文说明见 [`README_EN.md`](README_EN.md)。

## 本地开发

```bash
npm install
npm run dev
```

浏览器访问开发服务器地址（默认 `http://localhost:5173`）。

**开发环境（`npm run dev`）**下，前端会**自动**通过 Vite 同域路径 `/weaviate` 转发到你填写的实例地址（请求头 `X-Weaviate-Target`），以减轻浏览器直连 Weaviate 的 CORS 问题；未带头时回退环境变量 `VITE_WEAVIATE_PROXY_TARGET`（默认 `http://127.0.0.1:8080`）。

**生产构建**默认浏览器**直连**登录页填写的 `连接地址`；若在构建时设置 `VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true`（见下方 Docker），则与开发环境一样走同域 `/weaviate`，由网关或本仓库 **Docker 内 Nginx→Node** 转发。直连遇跨域时，需将 Weaviate 与前端置于同域反向代理之后。

连接失败（`ERR_NETWORK`）时的提示可在 **Vite 环境** 中覆盖（未设置则用 i18n 默认句）：

| 变量 | 生效场景 |
|------|-----------|
| `VITE_CONNECTION_NETWORK_MESSAGE_DEVELOPMENT` | 仅 `npm run dev`（`import.meta.env.DEV === true`） |
| `VITE_CONNECTION_NETWORK_MESSAGE_PRODUCTION` | 仅生产包：`npm run build` 产物、`vite preview`、镜像部署等（`import.meta.env.PROD === true`） |
| `VITE_CONNECTION_NETWORK_MESSAGE` | 上述未配置时的通用回退 |

优先级：**分环境变量** > **通用变量** > **多语言默认**。见仓库根目录 `.env.example`。

### 嵌入 API

OpenAI 兼容的嵌入接口在浏览器中可能受 CORS 限制，可经网关或同域代理访问。

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
| `dev:staging` | 开发服务器以 `staging` 模式加载 env |
| `preview:staging` | 预览时 `staging` 模式（与默认 `preview` 相对） |

```bash
npm run build
npm run preview
```

## Docker 部署

镜像是 **Node 24 bookworm-slim + Nginx** 双进程：Nginx 提供 `dist` 静态资源并把 `/weaviate` **反代**到本机 **Node（tsx + `server/`）**，逻辑与开发环境 Vite 插件一致。基础镜像为官方 `node:24-bookworm-slim`，容器内 `apt` 安装 `nginx`。详见根目录 `Dockerfile`、`docker/nginx-default.conf`、`docker/entrypoint.sh`。

**1. 本地编译（务必打开同域代理开关，否则生产包仍会直连 Weaviate）**

在 `.env.production` 中设置 `VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true`，或一次性：

```bash
npm ci
set VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true&& npm run build
```

（PowerShell：`$env:VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY='true'; npm run build`）

**2. 构建镜像**

```bash
docker build -t weaviate-web-client:latest .
```

**3. 运行容器**

`WEAVIATE_PROXY_TARGET` 为未带 `X-Weaviate-Target` 时的回退地址（与开发时 `VITE_WEAVIATE_PROXY_TARGET` 语义一致）：

```bash
docker run --rm -e WEAVIATE_PROXY_TARGET=http://host.docker.internal:8080 -p 8080:80 weaviate-web-client:latest
```

示例将容器 **80** 映射到本机 **8080**，浏览器访问 `http://localhost:8080`。静态资源走 Nginx；Weaviate API 走同域 `/weaviate`，由 Node 按请求头转发。

仅静态部署、不需要容器内代理时，构建时不要设置 `VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY`，并可改用只含 Nginx 的镜像方案（需自行维护）。

## 技术栈

Vue 3、TypeScript、Vite、Pinia、Vue Router、Element Plus、Axios（Weaviate REST/GraphQL 直连）。
