# weaviate-web-client

Weaviate vector database web UI built with Vue 3 and Element Plus. Feature set and acceptance follow `docs/WEAVIATE_CLIENT_SPEC.md`.

## Architecture (BFF)

The browser **never** talks to Weaviate directly. It only calls same-origin **`/weaviate`**. **Embedding** (OpenAI-compatible) uses same-origin **`/embedding`** with **`X-Embedding-Target`** for the upstream API base URL. A **Node BFF** (`server/`, `tsx`) forwards both via `http-proxy`. The server loads the official [`weaviate-client`](https://www.npmjs.com/package/weaviate-client) (see `server/weaviateOfficialClient.ts`) for future SDK-backed Weaviate routes.

| Environment | Behavior |
|-------------|----------|
| `npm run dev` | Runs `dev:bff` and Vite; Vite proxies `/weaviate` and `/embedding` to the BFF (`VITE_WEAVIATE_BFF_TARGET`) |
| Production / Docker | Nginx serves static assets; `/weaviate` and `/embedding` are reverse-proxied to in-container Node BFF (`PORT`, default `3000`) |

Optional copy for connection `ERR_NETWORK` messages can be set via Vite env vars — see `.env.example`. Same precedence as in the Chinese README: **per-environment** > **generic** > **i18n default**.

## Local development

```bash
npm install
npm run dev
```

This starts the Node BFF and Vite together (`concurrently`). Open the dev server URL (default `http://localhost:5173`).

To run only Vite and supply `/weaviate` elsewhere, use `npm run dev:vite` and point `VITE_WEAVIATE_BFF_TARGET` at a reachable BFF.

If `X-Weaviate-Target` is missing, the BFF falls back to `WEAVIATE_PROXY_TARGET` / `VITE_WEAVIATE_PROXY_TARGET` (default `http://127.0.0.1:8080`). If `X-Embedding-Target` is missing, the BFF falls back to `EMBEDDING_PROXY_TARGET` (default `https://api.openai.com/v1`).

For `vite preview`, configure the same `/weaviate` proxy in `vite.config.ts` and start the BFF first (`npm run start:proxy` or the Docker Node process).

## Build

`npm run build` uses Vite **production** mode and loads `.env`, `.env.production`, etc.

```bash
npm run build
npm run start:proxy   # separate terminal: BFF on 8787 unless PORT is set
npm run preview
```

## Docker

Image: **Node 24 bookworm-slim + Nginx**. Nginx serves `dist` and reverse-proxies `/weaviate` and `/embedding` to the local Node BFF. See `Dockerfile`, `docker/nginx-default.conf`, `docker/entrypoint.sh`.

```bash
npm ci && npm run build
docker build -t weaviate-web-client:latest .
docker run --rm -e WEAVIATE_PROXY_TARGET=http://host.docker.internal:8080 -p 8080:80 weaviate-web-client:latest
```

## Stack

Vue 3, TypeScript, Vite, Pinia, Vue Router, Element Plus, Axios (Weaviate via BFF); Node: `weaviate-client`, `http-proxy`.
