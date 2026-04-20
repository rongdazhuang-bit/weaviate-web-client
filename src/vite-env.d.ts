/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEAVIATE_PROXY_TARGET?: string
  /** 开发 / vite preview 时，同域 `/weaviate` 转发到的 Node BFF 地址，默认 http://127.0.0.1:8787 */
  readonly VITE_WEAVIATE_BFF_TARGET?: string
  /** 通用覆盖（开发/生产均可，若同時配置了分环境变量则分环境优先） */
  readonly VITE_CONNECTION_NETWORK_MESSAGE?: string
  /** 仅 `vite` / `npm run dev` 时使用 */
  readonly VITE_CONNECTION_NETWORK_MESSAGE_DEVELOPMENT?: string
  /** 仅 `vite build` 产物（含 `vite preview`、Docker 等）时使用 */
  readonly VITE_CONNECTION_NETWORK_MESSAGE_PRODUCTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
