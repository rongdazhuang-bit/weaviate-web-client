import axios from 'axios'
import { createWeaviateClientForUrl, fetchRemoteMeta, fetchRemoteReady } from '@/api/weaviateRemote'
import { runApiMigrationJob } from '@/api/migrationRun'
import type {
  ApiMigrationConfig,
  ApiMigrationRunResult,
  ValidateConnectionsResult,
} from '@/api/migrationTypes'
import type { WeaviateMeta } from '@/api/weaviate'
import type { AxiosInstance } from 'axios'

export type { ApiMigrationConfig, ApiMigrationMode, ApiMigrationRunResult, ValidateConnectionsResult } from '@/api/migrationTypes'

/** 与 UI 约定：就绪检查未通过时用此文案，便于 i18n 替换为完整句子 */
export const API_MIGRATION_NOT_READY_DETAIL = 'not ready'

function formatConnectionError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status
    if (typeof status === 'number') return `HTTP ${status}`
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') return e.message || 'timeout'
    if (e.message === 'Network Error') return 'network error or CORS blocked'
    return e.message || 'request failed'
  }
  if (e instanceof Error) return e.message
  return String(e)
}

/** 点击「开始」时连接校验失败：区分源端 / 目标端 */
export class ApiMigrationValidationError extends Error {
  readonly side: 'source' | 'target'

  constructor(side: 'source' | 'target', detail: string, options?: { cause?: unknown }) {
    super(detail)
    this.name = 'ApiMigrationValidationError'
    this.side = side
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

async function validateSideConnection(
  side: 'source' | 'target',
  client: AxiosInstance,
): Promise<WeaviateMeta> {
  try {
    const ok = await fetchRemoteReady(client)
    if (!ok) {
      throw new ApiMigrationValidationError(side, API_MIGRATION_NOT_READY_DETAIL)
    }
  } catch (e) {
    if (e instanceof ApiMigrationValidationError) throw e
    throw new ApiMigrationValidationError(side, formatConnectionError(e), { cause: e })
  }
  try {
    return await fetchRemoteMeta(client)
  } catch (e) {
    if (e instanceof ApiMigrationValidationError) throw e
    throw new ApiMigrationValidationError(side, formatConnectionError(e), { cause: e })
  }
}

export async function validateApiMigrationConnections(
  cfg: ApiMigrationConfig,
): Promise<ValidateConnectionsResult> {
  const src = createWeaviateClientForUrl(cfg.sourceUrl, cfg.sourceKey)
  const tgt = createWeaviateClientForUrl(cfg.targetUrl, cfg.targetKey)
  const sourceMeta = await validateSideConnection('source', src)
  const targetMeta = await validateSideConnection('target', tgt)
  return { sourceMeta, targetMeta }
}

/** 浏览器内执行迁移（经同域 BFF）；一般优先使用后台任务 + WebSocket（见 MigrationView）。 */
export async function runApiMigration(
  cfg: ApiMigrationConfig,
  onLog: (line: string) => void,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ApiMigrationRunResult> {
  const src = createWeaviateClientForUrl(cfg.sourceUrl, cfg.sourceKey)
  const tgt = createWeaviateClientForUrl(cfg.targetUrl, cfg.targetKey)
  return runApiMigrationJob(cfg, { src, tgt }, onLog, onProgress, signal)
}
