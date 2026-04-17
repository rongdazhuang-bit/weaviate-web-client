# weaviate-web-client

A Weaviate vector database web client built with Vue 3 and Element Plus. Features and acceptance criteria are defined in `docs/WEAVIATE_CLIENT_SPEC.md`.

## Local development

```bash
npm install
npm run dev
```

Open the dev server URL in your browser (default `http://localhost:5173`).

In **development** (`npm run dev`), the app **automatically** proxies Weaviate requests through the same-origin path `/weaviate` to the instance URL you enter (via the `X-Weaviate-Target` header), reducing CORS issues from direct browser access to Weaviate. If the header is missing, it falls back to the `VITE_WEAVIATE_PROXY_TARGET` environment variable (default `http://127.0.0.1:8080`).

**Production builds** (`npm run build` / `preview`) connect the browser **directly** to the configured Weaviate URL. If you hit cross-origin issues, put Weaviate and the frontend behind the same reverse proxy.

### Embedding API

OpenAI-compatible embedding endpoints may be blocked by CORS in the browser; use a gateway or same-origin proxy when needed.

## Build

```bash
npm run build
npm run preview
```

## Tech stack

Vue 3, TypeScript, Vite, Pinia, Vue Router, Element Plus, Axios (Weaviate REST/GraphQL).
