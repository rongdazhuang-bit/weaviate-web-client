/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEAVIATE_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
