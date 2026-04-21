/**
 * 无浏览器/Pinia 依赖的 Weaviate 类型与 GraphQL 辅助函数。
 * 供 weaviateRemote、后台迁移等在 Node 中加载，避免拉取 weaviate.ts → http.ts。
 */

export interface WeaviateMeta {
  hostname?: string
  version?: string
  modules?: Record<string, unknown>
}

export interface WeaviateClass {
  class: string
  description?: string
  vectorizer?: string
  vectorIndexType?: string
  properties?: WeaviateProperty[]
  replicationConfig?: Record<string, unknown>
  shardingConfig?: Record<string, unknown>
  /** REST 字段名，见 GET /v1/schema/{className} */
  vectorIndexConfig?: Record<string, unknown>
  /** 个别文档/版本别称，展示时与 vectorIndexConfig 二选一 */
  vectorConfig?: Record<string, unknown>
  multiTenancyConfig?: Record<string, unknown>
  invertedIndexConfig?: Record<string, unknown>
}

export interface WeaviateProperty {
  name: string
  dataType: string[]
  description?: string
  indexInverted?: boolean
  tokenization?: string
}

export interface WeaviateObject {
  class?: string
  id?: string
  properties?: Record<string, unknown>
  vector?: number[]
  /** 命名向量（Weaviate 多向量） */
  vectors?: Record<string, number[]>
  creationTimeUnix?: number
  lastUpdateTimeUnix?: number
}

export interface GraphQLError {
  message: string
}

export function escapeGraphQLClassName(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return `\`${name.replace(/`/g, '\\`')}\``
  }
  return name
}
