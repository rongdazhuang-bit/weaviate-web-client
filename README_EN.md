# weaviate-web-client

A Weaviate vector database web client built with Vue 3 and Element Plus. Features and acceptance criteria are defined in `docs/WEAVIATE_CLIENT_SPEC.md`. Chinese readme: [`README.md`](README.md).

## Local development

```bash
npm install
npm run dev
```

Open the dev server URL in your browser (default `http://localhost:5173`).

In **development** (`npm run dev`), the app **automatically** proxies Weaviate requests through the same-origin path `/weaviate` to the instance URL you enter (via the `X-Weaviate-Target` header), reducing CORS issues from direct browser access to Weaviate. If the header is missing, it falls back to the `VITE_WEAVIATE_PROXY_TARGET` environment variable (default `http://127.0.0.1:8080`).

**Production builds** default to **direct** browser access to the Weaviate URL from the login form. If you set `VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true` at build time (see Docker below), requests use same-origin `/weaviate` instead (Nginx→Node or your gateway). For direct access, use a same reverse proxy when you see cross-origin issues.

You can override the message for connection failures (`ERR_NETWORK`) **per Vite environment** (otherwise i18n defaults apply):

| Variable | When it applies |
|----------|-----------------|
| `VITE_CONNECTION_NETWORK_MESSAGE_DEVELOPMENT` | Only `npm run dev` (`import.meta.env.DEV === true`) |
| `VITE_CONNECTION_NETWORK_MESSAGE_PRODUCTION` | Production bundles: `npm run build` output, `vite preview`, Docker image, etc. (`import.meta.env.PROD === true`) |
| `VITE_CONNECTION_NETWORK_MESSAGE` | Fallback if the mode-specific variable is unset |

Priority: **mode-specific** > **generic** > **i18n default**. See `.env.example` in the repo root.

### Embedding API

OpenAI-compatible embedding endpoints may be blocked by CORS in the browser; use a gateway or same-origin proxy when needed.

## Build

`npm run build` uses Vite **production** mode (same as `npm run build:prod`) and loads `.env`, `.env.production`, etc.

Use `--mode` with a matching `.env.[mode]` file when you need environment-specific bundles, e.g. **staging**:

```bash
npm run build:staging   # loads .env.staging plus shared .env
npm run preview:staging # preview with staging mode (for env used in vite.config)
```

| Script | Mode |
|--------|------|
| `build` / `build:prod` | `production` |
| `build:staging` | `staging` (create `.env.staging` as needed) |
| `dev:staging` | dev server with `staging` env |
| `preview:staging` | `vite preview` with `staging` mode |

```bash
npm run build
npm run preview
```

## Docker deployment

The image uses **Node 24** (`node:24-bookworm-slim`) plus **Nginx** (installed with `apt`): Nginx serves `dist/` and **reverse-proxies `/weaviate`** to a local **Node** process (`tsx` + `server/`), matching the dev Vite plugin. See `Dockerfile`, `docker/nginx-default.conf`, and `docker/entrypoint.sh`.

**1. Build locally (enable same-origin Weaviate proxy)**

Set `VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true` in `.env.production`, or:

```bash
npm ci
VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true npm run build
```

(on Windows CMD use `set VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY=true` before `npm run build`)

**2. Build the image**

```bash
docker build -t weaviate-web-client:latest .
```

**3. Run the container**

`WEAVIATE_PROXY_TARGET` is the fallback when `X-Weaviate-Target` is missing (same idea as `VITE_WEAVIATE_PROXY_TARGET` in dev):

```bash
docker run --rm -e WEAVIATE_PROXY_TARGET=http://host.docker.internal:8080 -p 8080:80 weaviate-web-client:latest
```

This maps container port **80** to host **8080**; open `http://localhost:8080`. Static files are served by Nginx; Weaviate calls use same-origin `/weaviate` and are forwarded by Node.

If you do **not** want the in-container proxy, omit `VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY` when building and host the static files another way.

## Tech stack

Vue 3, TypeScript, Vite, Pinia, Vue Router, Element Plus, Axios (Weaviate REST/GraphQL).
