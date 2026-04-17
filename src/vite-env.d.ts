/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEAVIATE_PROXY_TARGET?: string
  /** 为 true 时生产包也请求同域 /weaviate（需 Nginx→Node 反代，见 docker/） */
  readonly VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY?: string
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
