import {
  aggregateCountRemote,
  batchCreateObjectsRemote,
  clearAllObjectsInClassRemote,
  fetchRemoteSchema,
  getObjectRemote,
  listObjectsRemote,
  objectExistsRemote,
  sanitizeWeaviateWriteProperties,
  summarizeBatchObjectsResponse,
} from '@/api/weaviateRemote'
import type { ApiMigrationConfig, ApiMigrationRunResult } from '@/api/migrationTypes'
import type { WeaviateObject } from '@/api/weaviateCore'
import { extractVectorsFromWeaviateObject, hasVectorPayload } from '@/utils/weaviateVectors'
import type { AxiosInstance } from 'axios'

const PAGE_SIZE = 80
const BATCH_FAIL_LOG_CAP = 8

/** 第 5 个参数可为 `AbortSignal`，或带 `signal` + 仅服务端回调（不推送到迁移 UI） */
export type ApiMigrationJobRunnerOptions = {
  signal?: AbortSignal
  /** 仅服务端/diagnostics；浏览器内迁移未传时此类日志丢弃 */
  onServerLog?: (line: string) => void
}

function resolveRunnerOptions(
  signalOrOptions?: AbortSignal | ApiMigrationJobRunnerOptions | null,
): { signal?: AbortSignal; onServerLog?: (line: string) => void } {
  if (signalOrOptions == null) return {}
  if (signalOrOptions instanceof AbortSignal) {
    return { signal: signalOrOptions }
  }
  return {
    signal: signalOrOptions.signal,
    onServerLog: signalOrOptions.onServerLog,
  }
}

type MigrationWriteBatchItem = {
  class: string
  id?: string
  properties?: Record<string, unknown>
  vector?: number[]
  vectors?: Record<string, number[]>
}

async function executeMigrationBatchWrite(
  tgt: AxiosInstance,
  className: string,
  pageIdx: number,
  batch: MigrationWriteBatchItem[],
  kind: 'incremental' | 'full',
  onLog: (line: string) => void,
): Promise<{ succeeded: number; failed: number }> {
  const kindZh = kind === 'incremental' ? '增量' : '全量'
  onLog(`[迁移] ${className} 第 ${pageIdx} 页：批量写入 ${batch.length} 条（${kindZh}，含向量字段）`)
  const rawRes = await batchCreateObjectsRemote(tgt, batch)
  const resultLen = Array.isArray(rawRes.result) ? rawRes.result.length : 0
  onLog(`[迁移] POST /v1/batch/objects 完成: 请求条数=${batch.length} result条数=${resultLen}`)
  const outcome = summarizeBatchObjectsResponse(rawRes, batch, {
    strictResultLength: false,
  })
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
      onLog(`[迁移]   …另有 ${outcome.failures.length - BATCH_FAIL_LOG_CAP} 条失败未逐条列出`)
    }
  }
  return { succeeded: outcome.succeeded, failed: outcome.failed }
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
  const rawProps = (raw.properties as Record<string, unknown>) ?? {}
  const body: {
    class: string
    id?: string
    properties: Record<string, unknown>
    vector?: number[]
    vectors?: Record<string, number[]>
  } = {
    class: className,
    properties: sanitizeWeaviateWriteProperties(rawProps),
  }
  if (typeof raw.id === 'string') body.id = raw.id
  if (extracted.vector?.length) body.vector = extracted.vector
  if (extracted.vectors && Object.keys(extracted.vectors).length > 0) {
    body.vectors = { ...extracted.vectors }
  }
  return body
}

async function ensureObjectVectors(
  src: AxiosInstance,
  className: string,
  o: WeaviateObject,
  onServerLog?: (line: string) => void,
): Promise<Record<string, unknown>> {
  const raw = o as unknown as Record<string, unknown>
  if (hasVectorPayload(extractVectorsFromWeaviateObject(raw))) return raw
  if (!o.id) return raw
  const full = await getObjectRemote(src, className, o.id, { includeVector: true })
  if (!full) return raw
  const merged = { ...raw, ...(full as unknown as Record<string, unknown>) }
  if (hasVectorPayload(extractVectorsFromWeaviateObject(merged))) {
    onServerLog?.(`[迁移] 列表未返回向量，已补拉对象 ${String(o.id).slice(0, 8)}… 的向量`)
  }
  return merged
}

/**
 * 迁移执行核心（浏览器或 Node 均可）：由调用方注入已配置好的源/目标 Axios（直连或经 BFF）。
 */
export async function runApiMigrationJob(
  cfg: ApiMigrationConfig,
  clients: { src: AxiosInstance; tgt: AxiosInstance },
  onLog: (line: string) => void,
  onProgress: (pct: number) => void,
  signalOrOptions?: AbortSignal | ApiMigrationJobRunnerOptions,
): Promise<ApiMigrationRunResult> {
  const { signal, onServerLog } = resolveRunnerOptions(signalOrOptions)
  const { src, tgt } = clients

  const classes = cfg.allClasses
    ? (await fetchRemoteSchema(src)).map((c) => c.class)
    : [...cfg.selectedClasses]

  if (classes.length === 0) throw new Error('no classes selected')

  let totalEstimate = 0
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
      onProgress(Math.min(99, Math.round(100 * (1 - Math.exp(-processed / 800)))))
    }
  }

  let batchItemSuccesses = 0
  let batchItemFailures = 0

  for (const className of classes) {
    if (signal?.aborted) throw new Error('aborted')

    if (cfg.mode === 'full') {
      onLog(
        `[迁移] 全量模式：Weaviate 对对象更新为「删除旧索引再建新索引」，写入前将先清空目标集合「${className}」中的已有数据。`,
      )
      const removed = await clearAllObjectsInClassRemote(tgt, className, onLog, signal)
      onLog(`[迁移] 目标集合「${className}」已清空（共删除 ${removed} 条），开始从源端读取并写入…`)
    }

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
        objs.map((o) => ensureObjectVectors(src, className, o, onServerLog)),
      )

      if (cfg.mode === 'incremental') {
        const batch: MigrationWriteBatchItem[] = []
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
          const { succeeded, failed } = await executeMigrationBatchWrite(
            tgt,
            className,
            pageIdx,
            batch,
            'incremental',
            onLog,
          )
          batchItemSuccesses += succeeded
          batchItemFailures += failed
          for (let i = 0; i < batch.length; i++) bump()
        } else {
          onLog(`[迁移] ${className} 第 ${pageIdx} 页：本页无新对象（均已存在）`)
        }
      } else {
        const batch: MigrationWriteBatchItem[] = []
        for (const raw of enriched) {
          if (typeof raw.id !== 'string' || !raw.id) continue
          if (signal?.aborted) throw new Error('aborted')
          batch.push(buildWritePayload(className, raw))
        }
        if (batch.length) {
          const { succeeded, failed } = await executeMigrationBatchWrite(
            tgt,
            className,
            pageIdx,
            batch,
            'full',
            onLog,
          )
          batchItemSuccesses += succeeded
          batchItemFailures += failed
          for (let i = 0; i < batch.length; i++) bump()
        } else {
          onLog(`[迁移] ${className} 第 ${pageIdx} 页：本页无有效 id，跳过写入`)
        }
      }

      const last = objs[objs.length - 1]
      after = last?.id
      if (!after || objs.length < PAGE_SIZE) break
    }
    onLog(`[迁移] 集合「${className}」完成。`)
  }

  onProgress(100)
  if (batchItemSuccesses > 0 || batchItemFailures > 0) {
    onLog(
      `[迁移] 批量写入汇总：成功 ${batchItemSuccesses} 条，失败 ${batchItemFailures} 条。`,
    )
  }
  onLog('[迁移] 全部完成。')
  return { batchItemSuccesses, batchItemFailures }
}
