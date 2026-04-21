import axios, { type AxiosInstance } from 'axios'
import { normalizeConnectionUrl } from '@/utils/connectionUrl'
import { graphqlQueryWithAxios } from '@/api/graphqlTransport'
import { escapeGraphQLClassName, type WeaviateClass, type WeaviateMeta, type WeaviateObject } from '@/api/weaviateCore'

/**
 * 任意 Weaviate 地址 + API Key 的客户端（用于数据迁移源/目标）。
 * 始终经同域 BFF：`/weaviate` + `X-Weaviate-Target`（由 Node 转发，避免浏览器直连与 CORS）。
 */
export function createWeaviateClientForUrl(connectionInput: string, apiKey: string): AxiosInstance {
  const base = normalizeConnectionUrl(connectionInput)
  if (!base) throw new Error('invalid connection url')

  const client = axios.create({
    timeout: 120_000,
    validateStatus: (s) => s >= 200 && s < 500,
  })

  client.interceptors.request.use((config) => {
    config.baseURL = `${window.location.origin}/weaviate`
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>)['X-Weaviate-Target'] = base
    const k = apiKey.trim()
    if (k) {
      config.headers = config.headers ?? {}
      const headers = config.headers as Record<string, string>
      headers['Authorization'] = k.startsWith('Bearer ') ? k : `Bearer ${k}`
    }
    return config
  })

  return client
}

/**
 * Node / 后台迁移任务：直连 Weaviate 根地址（不经浏览器同域 `/weaviate` BFF），避免浏览器侧拦截 PUT 等请求。
 */
export function createWeaviateAxiosDirect(connectionInput: string, apiKey: string): AxiosInstance {
  const base = normalizeConnectionUrl(connectionInput)
  if (!base) throw new Error('invalid connection url')

  const client = axios.create({
    baseURL: base.replace(/\/$/, ''),
    timeout: 120_000,
    validateStatus: (s) => s >= 200 && s < 500,
  })

  client.interceptors.request.use((config) => {
    const k = apiKey.trim()
    if (k) {
      config.headers = config.headers ?? {}
      const headers = config.headers as Record<string, string>
      headers['Authorization'] = k.startsWith('Bearer ') ? k : `Bearer ${k}`
    }
    return config
  })

  return client
}

export async function fetchRemoteReady(client: AxiosInstance): Promise<boolean> {
  const { status } = await client.get('/v1/.well-known/ready')
  return status === 200
}

export async function fetchRemoteMeta(client: AxiosInstance): Promise<WeaviateMeta> {
  const { data, status } = await client.get<WeaviateMeta>('/v1/meta')
  if (status !== 200) throw new Error(`meta HTTP ${status}`)
  return data
}

export async function fetchRemoteSchema(client: AxiosInstance): Promise<WeaviateClass[]> {
  const { data, status } = await client.get<{ classes?: WeaviateClass[] }>('/v1/schema')
  if (status !== 200) throw new Error(`schema HTTP ${status}`)
  const body = data as { classes?: WeaviateClass[] }
  if (Array.isArray(body?.classes)) return body.classes
  return []
}

export async function aggregateCountRemote(
  className: string,
  client: AxiosInstance,
): Promise<number | null> {
  const g = escapeGraphQLClassName(className)
  const q = `{ Aggregate { ${g} { meta { count } } } }`
  const res = await graphqlQueryWithAxios<{
    Aggregate: Record<string, { meta?: { count?: number } }[]>
  }>(client, q)
  if (res.errors?.length) return null
  const agg = res.inner?.Aggregate
  if (!agg) return null
  const bucket = agg[className] ?? Object.values(agg)[0]
  const row = bucket?.[0]
  const n = row?.meta?.count
  return typeof n === 'number' ? n : null
}

export async function listObjectsRemote(
  className: string,
  opts: { limit?: number; after?: string; includeVector?: boolean; notFoundOk?: boolean },
  client: AxiosInstance,
): Promise<{ objects?: WeaviateObject[]; totalResults?: number }> {
  const params = new URLSearchParams()
  params.set('class', className)
  params.set('limit', String(opts.limit ?? 100))
  if (opts.after) params.set('after', opts.after)
  // 与 getObjectRemote 一致：默认附带 include=vector；仅清空等仅需 id 的场景传 includeVector: false
  if (opts.includeVector !== false) params.set('include', 'vector')

  const { data, status } = await client.get<{
    objects?: WeaviateObject[]
    totalResults?: number
  }>(`/v1/objects?${params.toString()}`)
  // 目标端清空时：集合尚未创建或无任何对象时，部分部署对列表接口返回 404，与增量迁移中单对象 404 一样视为「无数据」
  if (status === 404 && opts.notFoundOk) {
    return { objects: [], totalResults: 0 }
  }
  if (status !== 200) throw new Error(`objects HTTP ${status}`)
  return data
}

/** 删除目标端对象（需 class 查询参数）。404 视为已成功（幂等）。 */
export async function deleteObjectRemote(
  client: AxiosInstance,
  className: string,
  id: string,
): Promise<void> {
  const params = new URLSearchParams()
  params.set('class', className)
  const { status } = await client.delete(
    `/v1/objects/${encodeURIComponent(id)}?${params.toString()}`,
  )
  if (status !== 200 && status !== 204 && status !== 404) {
    throw new Error(`delete object HTTP ${status}`)
  }
}

const CLEAR_CLASS_PAGE_SIZE = 100
const CLEAR_CLASS_DELETE_CONCURRENCY = 8

async function runDeleteChunkPool(
  ids: string[],
  concurrency: number,
  fn: (id: string) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency)
    await Promise.all(chunk.map((id) => fn(id)))
  }
}

/**
 * 全量迁移前清空目标集合：Weaviate 对「更新」实为删索引再建，先删尽目标侧旧对象再写入，避免与旧向量/属性冲突。
 * 每轮只取当前集合中「首批」对象删除并重复，不依赖 after 游标往后翻，避免删除后游标语义问题。
 */
export async function clearAllObjectsInClassRemote(
  client: AxiosInstance,
  className: string,
  onLog?: (line: string) => void,
  signal?: AbortSignal,
): Promise<number> {
  let totalDeleted = 0
  let round = 0
  while (true) {
    if (signal?.aborted) throw new Error('aborted')
    round++
    const page = await listObjectsRemote(
      className,
      { limit: CLEAR_CLASS_PAGE_SIZE, includeVector: false, notFoundOk: true },
      client,
    )
    const objs = page.objects ?? []
    if (objs.length === 0) break

    const ids = objs.map((o) => o.id).filter((x): x is string => typeof x === 'string' && !!x)
    await runDeleteChunkPool(ids, CLEAR_CLASS_DELETE_CONCURRENCY, async (id) => {
      if (signal?.aborted) throw new Error('aborted')
      await deleteObjectRemote(client, className, id)
    })
    totalDeleted += ids.length
    onLog?.(
      `[迁移] 清空目标集合「${className}」第 ${round} 轮：本批 ${ids.length} 条，累计删除 ${totalDeleted} 条…`,
    )
  }
  return totalDeleted
}

export async function objectExistsRemote(
  client: AxiosInstance,
  className: string,
  id: string,
): Promise<boolean> {
  const params = new URLSearchParams()
  params.set('class', className)
  // 增量迁移：目标上无该 UUID 时 Weaviate 返回 404，属预期，视为「不存在」；仅 200/404 视为合法响应，其余状态抛错以免误判
  const { status } = await client.get(`/v1/objects/${encodeURIComponent(id)}?${params.toString()}`, {
    validateStatus: (s) => s === 200 || s === 404,
  })
  if (status === 404) return false
  return true
}

/** 单条读取对象，默认包含向量（含命名向量） */
export async function getObjectRemote(
  client: AxiosInstance,
  className: string,
  id: string,
  opts?: { includeVector?: boolean },
): Promise<WeaviateObject | null> {
  const params = new URLSearchParams()
  params.set('class', className)
  if (opts?.includeVector !== false) params.set('include', 'vector')
  const { data, status } = await client.get<WeaviateObject>(
    `/v1/objects/${encodeURIComponent(id)}?${params.toString()}`,
  )
  if (status !== 200) return null
  return data
}

export interface BatchObjectsResponse {
  result?: { status?: string; errors?: { error?: string[] } }[]
  errors?: unknown
}

/** 解析 POST /v1/batch/objects 的逐条 `result[].status`（通常为 SUCCESS / FAILED） */
export interface BatchObjectsOutcome {
  succeeded: number
  failed: number
  failures: { index: number; id?: string; detail: string }[]
}

function formatBatchRowErrors(errors?: { error?: string[] } | null): string {
  const arr = errors?.error
  if (Array.isArray(arr) && arr.length > 0) return arr.join('; ')
  return '无详细错误信息'
}

/** 深层嵌套属性中仍可能含 id 键；过小会导致清洗不完整进而触发 PUT/写入校验错误 */
const MAX_DEPTH_STRIP_ID = 96

/**
 * 迁移写入：移除 properties 中与对象 UUID 冲突的键（任意深度的 id / _id / __id，大小写不敏感），
 * 避免 PUT / PATCH 报 invalid update: field 'id' is immutable。
 */
export function sanitizeWeaviateWriteProperties(props: Record<string, unknown>): Record<string, unknown> {
  let plain: Record<string, unknown>
  try {
    plain = JSON.parse(JSON.stringify(props ?? {})) as Record<string, unknown>
  } catch {
    plain = { ...(props ?? {}) }
  }
  function walk(o: unknown, depth: number): unknown {
    if (depth <= 0 || o === null || typeof o !== 'object') return o
    if (Array.isArray(o)) return o.map((x) => walk(x, depth - 1))
    const rec = o as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rec)) {
      const kt = k.trim()
      if (kt.toLowerCase() === 'id' || kt === '_id' || kt === '__id') continue
      next[k] = walk(v, depth - 1)
    }
    return next
  }
  return walk(plain, MAX_DEPTH_STRIP_ID) as Record<string, unknown>
}

/** 迁移日志：HTTP 响应体字符串化并截断，避免向量等大字段撑爆控制台 */
const HTTP_RESPONSE_BODY_LOG_MAX = 12_000

/** 批量异常排查：允许更长的原始 JSON（如 result 为空时的 error 结构） */
export const HTTP_RESPONSE_BODY_LOG_VERBOSE_MAX = 200_000

export function formatHttpResponseBodyForLog(
  data: unknown,
  maxLen: number = HTTP_RESPONSE_BODY_LOG_MAX,
): string {
  if (data === undefined || data === null) return '(empty)'
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data)
    if (!s.length) return '(empty)'
    if (s.length <= maxLen) return s
    return `${s.slice(0, maxLen)}…(truncated +${s.length - maxLen} chars)`
  } catch {
    return String(data)
  }
}

export function formatBatchObjectsResponseForLog(data: BatchObjectsResponse): string {
  return formatHttpResponseBodyForLog(data ?? {})
}

/**
 * 按请求顺序解析 Weaviate 返回的 `result` 数组；仅 `status` 为 SUCCESS 计为成功（大小写不敏感）。
 * `strictResultLength` 为 true（默认）时，`result` 条数少于请求条数则缺失下标计为失败；
 * 传 `strictResultLength: false` 时缺失项视为成功（迁移增量/全量批量均使用此项）。
 */
export function summarizeBatchObjectsResponse(
  data: BatchObjectsResponse,
  requestObjects: { id?: string }[],
  options?: { strictResultLength?: boolean },
): BatchObjectsOutcome {
  const strictResultLength = options?.strictResultLength !== false
  const results = data.result ?? []
  const n = requestObjects.length
  const failures: BatchObjectsOutcome['failures'] = []
  let succeeded = 0

  for (let i = 0; i < n; i++) {
    const id = requestObjects[i]?.id
    const row = results[i]
    if (row === undefined) {
      if (!strictResultLength) {
        succeeded++
        continue
      }
      failures.push({
        index: i,
        id,
        detail: '响应中缺少与本请求对应的 result 项（条数不一致）',
      })
      continue
    }
    const st = (row.status ?? '').toString().trim().toUpperCase()
    if (st === 'SUCCESS') {
      succeeded++
      continue
    }
    const detail =
      st === 'FAILED' || st === ''
        ? formatBatchRowErrors(row.errors)
        : `${st}: ${formatBatchRowErrors(row.errors)}`
    failures.push({ index: i, id, detail })
  }

  return { succeeded, failed: failures.length, failures }
}

export async function batchCreateObjectsRemote(
  client: AxiosInstance,
  objects: {
    class: string
    id?: string
    properties?: Record<string, unknown>
    vector?: number[]
    vectors?: Record<string, number[]>
  }[],
): Promise<BatchObjectsResponse> {
  const payload = objects.map((o) => ({
    ...o,
    properties: sanitizeWeaviateWriteProperties((o.properties ?? {}) as Record<string, unknown>),
  }))
  const { data, status } = await client.post<BatchObjectsResponse>('/v1/batch/objects', {
    objects: payload,
  })
  if (status !== 200) {
    throw new Error(`batch HTTP ${status}`)
  }
  return data ?? {}
}

export async function putObjectRemote(
  client: AxiosInstance,
  id: string,
  body: {
    class: string
    properties?: Record<string, unknown>
    vector?: number[]
    vectors?: Record<string, number[]>
  },
): Promise<{ status: number; data: unknown }> {
  const safeProps = sanitizeWeaviateWriteProperties((body.properties ?? {}) as Record<string, unknown>)
  const params = new URLSearchParams()
  params.set('class', body.class)
  const cleanBody = {
    class: body.class,
    properties: safeProps,
    ...(body.vector && body.vector.length > 0 ? { vector: body.vector } : {}),
    ...(body.vectors && Object.keys(body.vectors).length > 0 ? { vectors: body.vectors } : {}),
  }
  const { data, status } = await client.put<unknown>(
    `/v1/objects/${encodeURIComponent(id)}?${params.toString()}`,
    cleanBody,
  )
  if (status !== 200 && status !== 204) {
    throw new Error(`put object HTTP ${status}`)
  }
  return { status, data }
}

