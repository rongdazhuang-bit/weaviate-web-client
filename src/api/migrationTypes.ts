import type { WeaviateMeta } from '@/api/weaviateCore'

export type ApiMigrationMode = 'full' | 'incremental'

export interface ApiMigrationConfig {
  sourceUrl: string
  sourceKey: string
  targetUrl: string
  targetKey: string
  allClasses: boolean
  selectedClasses: string[]
  mode: ApiMigrationMode
}

/** POST /v1/batch/objects 的逐条成功/失败累计（增量与全量均走批量创建） */
export interface ApiMigrationRunResult {
  batchItemSuccesses: number
  batchItemFailures: number
}

export interface ValidateConnectionsResult {
  sourceMeta: WeaviateMeta
  targetMeta: WeaviateMeta
}
