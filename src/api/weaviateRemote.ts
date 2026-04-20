import axios, { type AxiosInstance } from 'axios'
import { normalizeConnectionUrl } from '@/utils/connectionUrl'
import { graphqlQueryWithAxios } from '@/api/graphqlTransport'
import { escapeGraphQLClassName, type WeaviateClass, type WeaviateMeta, type WeaviateObject } from '@/api/weaviate'

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
  opts: { limit?: number; after?: string; includeVector?: boolean },
  client: AxiosInstance,
): Promise<{ objects?: WeaviateObject[]; totalResults?: number }> {
  const params = new URLSearchParams()
  params.set('class', className)
  params.set('limit', String(opts.limit ?? 100))
  if (opts.after) params.set('after', opts.after)
  if (opts.includeVector) params.set('include', 'vector')

  const { data, status } = await client.get<{
    objects?: WeaviateObject[]
    totalResults?: number
  }>(`/v1/objects?${params.toString()}`)
  if (status !== 200) throw new Error(`objects HTTP ${status}`)
  return data
}

export async function objectExistsRemote(
  client: AxiosInstance,
  className: string,
  id: string,
): Promise<boolean> {
  const params = new URLSearchParams()
  params.set('class', className)
  const { status } = await client.get(`/v1/objects/${encodeURIComponent(id)}?${params.toString()}`)
  return status === 200
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

/**
 * 按请求顺序校验 Weaviate 返回的 `result` 数组；仅 `status` 为 SUCCESS 计为成功（大小写不敏感）。
 * `result` 条数少于请求条数时，缺失下标计为失败。
 */
export function summarizeBatchObjectsResponse(
  data: BatchObjectsResponse,
  requestObjects: { id?: string }[],
): BatchObjectsOutcome {
  const results = data.result ?? []
  const n = requestObjects.length
  const failures: BatchObjectsOutcome['failures'] = []
  let succeeded = 0

  for (let i = 0; i < n; i++) {
    const id = requestObjects[i]?.id
    const row = results[i]
    if (row === undefined) {
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
  const { data, status } = await client.post<BatchObjectsResponse>('/v1/batch/objects', {
    objects,
  })
  if (status !== 200) throw new Error(`batch HTTP ${status}`)
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
): Promise<void> {
  const { status } = await client.put(`/v1/objects/${encodeURIComponent(id)}`, body)
  if (status !== 200 && status !== 204) throw new Error(`put object HTTP ${status}`)
}

