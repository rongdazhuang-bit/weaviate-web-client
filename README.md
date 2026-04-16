# weaviate-web-client

基于 Vue 3 + Element Plus 的 Weaviate 向量库 Web 客户端，功能与验收以 `docs/WEAVIATE_CLIENT_SPEC.md` 为准。

## 本地开发

```bash
npm install
npm run dev
```

浏览器访问开发服务器地址（默认 `http://localhost:5173`）。

**开发环境（`npm run dev`）**下，前端会**自动**通过 Vite 同域路径 `/weaviate` 转发到你填写的实例地址（请求头 `X-Weaviate-Target`），以减轻浏览器直连 Weaviate 的 CORS 问题；未带头时回退环境变量 `VITE_WEAVIATE_PROXY_TARGET`（默认 `http://127.0.0.1:8080`）。

**生产构建**（`npm run build` / `preview`）为浏览器直连 `连接地址`，若遇跨域，请将 Weaviate 与前端置于同域反向代理之后。

### 嵌入 API

OpenAI 兼容的嵌入接口在浏览器中可能受 CORS 限制，可经网关或同域代理访问。

## 构建

```bash
npm run build
npm run preview
```

## 技术栈

Vue 3、TypeScript、Vite、Pinia、Vue Router、Element Plus、Axios（Weaviate REST/GraphQL 直连）。
