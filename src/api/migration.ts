import axios from 'axios'
import {
  aggregateCountRemote,
  batchCreateObjectsRemote,
  createWeaviateClientForUrl,
  fetchRemoteMeta,
  fetchRemoteReady,
  fetchRemoteSchema,
  getObjectRemote,
  listObjectsRemote,
  objectExistsRemote,
  putObjectRemote,
  summarizeBatchObjectsResponse,
} from '@/api/weaviateRemote'
import type { WeaviateMeta, WeaviateObject } from '@/api/weaviate'
import { extractVectorsFromWeaviateObject, hasVectorPayload } from '@/utils/weaviateVectors'
import type { AxiosInstance } from 'axios'

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

const PAGE_SIZE = 80

export interface ValidateConnectionsResult {
  sourceMeta: WeaviateMeta
  targetMeta: WeaviateMeta
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

function buildWritePayload(
  className: string,
  raw: Record<string, unknown>,
): {
  class: string
  id?: string
  properties: Record<string, unknown>
  vector?: number[]
  vectors?: Record<string, number[]>
} {
  const extracted = extractVectorsFromWeaviateObject(raw)
  const body: {
    class: string
    id?: string
    properties: Record<string, unknown>
    vector?: number[]
    vectors?: Record<string, number[]>
  } = {
    class: className,
    properties: (raw.properties as Record<string, unknown>) ?? {},
  }
  if (typeof raw.id === 'string') body.id = raw.id
  if (extracted.vector?.length) body.vector = extracted.vector
  if (extracted.vectors && Object.keys(extracted.vectors).length > 0) {
    body.vectors = { ...extracted.vectors }
  }
  return body
}

/**
 * 列表接口有时不返回向量：对缺向量的对象再 GET 一次，保证写入时带向量。
 */
async function ensureObjectVectors(
  src: AxiosInstance,
  className: string,
  o: WeaviateObject,
  onLog?: (line: string) => void,
): Promise<Record<string, unknown>> {
  const raw = o as unknown as Record<string, unknown>
  if (hasVectorPayload(extractVectorsFromWeaviateObject(raw))) return raw
  if (!o.id) return raw
  const full = await getObjectRemote(src, className, o.id)
  if (!full) return raw
  const merged = { ...raw, ...(full as unknown as Record<string, unknown>) }
  if (hasVectorPayload(extractVectorsFromWeaviateObject(merged))) {
    onLog?.(`[迁移] 列表未返回向量，已补拉对象 ${String(o.id).slice(0, 8)}… 的向量`)
  }
  return merged
}

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  const workers: Promise<void>[] = []
  async function worker() {
    while (queue.length) {
      const item = queue.shift()
      if (item === undefined) return
      await fn(item)
    }
  }
  const n = Math.min(concurrency, items.length || 1)
  for (let i = 0; i < n; i++) workers.push(worker())
  await Promise.all(workers)
}

/** 增量迁移中 POST /v1/batch/objects 的逐条成功/失败累计（全量 PUT 模式不计入） */
export interface ApiMigrationRunResult {
  batchItemSuccesses: number
  batchItemFailures: number
}

const BATCH_FAIL_LOG_CAP = 8

export async function runApiMigration(
  cfg: ApiMigrationConfig,
  onLog: (line: string) => void,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ApiMigrationRunResult> {
  const src = createWeaviateClientForUrl(cfg.sourceUrl, cfg.sourceKey)
  const tgt = createWeaviateClientForUrl(cfg.targetUrl, cfg.targetKey)

  const classes = cfg.allClasses
    ? (await fetchRemoteSchema(src)).map((c) => c.class)
    : [...cfg.selectedClasses]

  if (classes.length === 0) throw new Error('no classes selected')

  let totalEstimate = 0
  /** 任一类 Aggregate 返回 null（GraphQL 错误等）时，总和可能不可靠，不得与「真的 0 条」混淆 */
  let aggregateUnavailable = false
  for (const c of classes) {
    const n = await aggregateCountRemote(c, src)
    if (n === null) aggregateUnavailable = true
    else totalEstimate += n
  }
  if (totalEstimate === 0 && !aggregateUnavailable) {
    onLog('[迁移] 源端选中范围内无对象，结束。')
    onProgress(100)
    return { batchItemSuccesses: 0, batchItemFailures: 0 }
  }
  if (totalEstimate === 0 && aggregateUnavailable) {
    onLog(
      '[迁移] 无法在迁移前统计对象数量（GraphQL Aggregate 不可用或异常），将继续按 REST 扫描；完成前百分比为近似值。',
    )
  }

  let processed = 0
  const progressDenom = totalEstimate > 0 ? totalEstimate : null
  const bump = () => {
    processed++
    if (progressDenom != null) {
      onProgress(Math.min(99, Math.round((processed / progressDenom) * 100)))
    } else {
      // 分母未知：用饱和曲线趋近 99%，避免除零或第一步打满
      onProgress(Math.min(99, Math.round(100 * (1 - Math.exp(-processed / 800)))))
    }
  }

  let batchItemSuccesses = 0
  let batchItemFailures = 0

  for (const className of classes) {
    if (signal?.aborted) throw new Error('aborted')
    onLog(`[迁移] 集合「${className}」开始读取（含向量 include=vector）…`)

    let after: string | undefined
    let pageIdx = 0
    while (true) {
      if (signal?.aborted) throw new Error('aborted')
      const page = await listObjectsRemote(
        className,
        { limit: PAGE_SIZE, after, includeVector: true },
        src,
      )
      const objs = page.objects ?? []
      if (objs.length === 0) break
      pageIdx++

      const enriched = await Promise.all(
        objs.map((o) => ensureObjectVectors(src, className, o, onLog)),
      )

      if (cfg.mode === 'incremental') {
        const batch: {
          class: string
          id?: string
          properties?: Record<string, unknown>
          vector?: number[]
          vectors?: Record<string, number[]>
        }[] = []
        for (const raw of enriched) {
          if (typeof raw.id !== 'string' || !raw.id) continue
          if (signal?.aborted) throw new Error('aborted')
          const exists = await objectExistsRemote(tgt, className, raw.id)
          if (exists) {
            bump()
            continue
          }
          batch.push(buildWritePayload(className, raw))
        }
        if (batch.length) {
          onLog(`[迁移] ${className} 第 ${pageIdx} 页：批量写入 ${batch.length} 条（增量，含向量字段）`)
          const rawRes = await batchCreateObjectsRemote(tgt, batch)
          const outcome = summarizeBatchObjectsResponse(rawRes, batch)
          batchItemSuccesses += outcome.succeeded
          batchItemFailures += outcome.failed
          if (outcome.failed > 0) {
            onLog(
              `[迁移] ${className} 第 ${pageIdx} 页：本批写入结果 — 成功 ${outcome.succeeded} 条，失败 ${outcome.failed} 条`,
            )
            const slice = outcome.failures.slice(0, BATCH_FAIL_LOG_CAP)
            for (const f of slice) {
              const idFrag = f.id ? ` id=${String(f.id).slice(0, 8)}…` : ''
              onLog(`[迁移]   失败 #${f.index}${idFrag} ${f.detail}`)
            }
            if (outcome.failures.length > BATCH_FAIL_LOG_CAP) {
              onLog(
                `[迁移]   …另有 ${outcome.failures.length - BATCH_FAIL_LOG_CAP} 条失败未逐条列出`,
              )
            }
          }
          for (let i = 0; i < batch.length; i++) bump()
        } else {
          onLog(`[迁移] ${className} 第 ${pageIdx} 页：本页无新对象（均已存在）`)
        }
      } else {
        onLog(`[迁移] ${className} 第 ${pageIdx} 页：全量 upsert ${enriched.length} 条（含向量字段）`)
        await runPool(enriched, 6, async (raw) => {
          if (signal?.aborted) throw new Error('aborted')
          if (typeof raw.id !== 'string' || !raw.id) return
          const payload = buildWritePayload(className, raw)
          await putObjectRemote(tgt, raw.id, {
            class: payload.class,
            properties: payload.properties,
            vector: payload.vector,
            vectors: payload.vectors,
          })
          bump()
        })
      }

      const last = objs[objs.length - 1]
      after = last?.id
      if (!after || objs.length < PAGE_SIZE) break
    }
    onLog(`[迁移] 集合「${className}」完成。`)
  }

  onProgress(100)
  if (cfg.mode === 'incremental' && (batchItemSuccesses > 0 || batchItemFailures > 0)) {
    onLog(
      `[迁移] 增量批量写入汇总：成功 ${batchItemSuccesses} 条，失败 ${batchItemFailures} 条。`,
    )
  }
  onLog('[迁移] 全部完成。')
  return { batchItemSuccesses, batchItemFailures }
}
