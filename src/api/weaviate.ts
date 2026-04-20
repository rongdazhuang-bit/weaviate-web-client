import type { AxiosInstance } from 'axios'
import { createWeaviateAxios } from './http'
import { graphqlQueryWithAxios } from './graphqlTransport'

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

export async function fetchMeta(client: AxiosInstance = createWeaviateAxios()) {
  const { data, status } = await client.get<WeaviateMeta>('/v1/meta')
  if (status !== 200) throw new Error(`meta HTTP ${status}`)
  return data
}

/** GET /v1/nodes 单条节点（字段随 Weaviate 版本可能增减） */
export interface WeaviateNodeInfo {
  name?: string
  status?: string
  version?: string
  operationalMode?: string
  gitHash?: string
  [key: string]: unknown
}

export interface WeaviateNodesResponse {
  nodes?: WeaviateNodeInfo[]
}

/** 仪表盘展示用：固定四项文案 */
export interface WeaviateNodeRow {
  name: string
  operationalMode: string
  status: string
  version: string
}

function pickNodeStr(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

/** 将 /v1/nodes 响应解析为行列表（兼容 `{ nodes: [] }` 或少数实现直接返回数组） */
export function parseWeaviateNodesPayload(raw: unknown): WeaviateNodeRow[] {
  if (raw == null) return []
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'object' && raw !== null && Array.isArray((raw as WeaviateNodesResponse).nodes)) {
    list = (raw as WeaviateNodesResponse).nodes!
  }
  return list.map((item) => {
    if (!item || typeof item !== 'object') {
      return {
        name: '—',
        operationalMode: '—',
        status: '—',
        version: '—',
      }
    }
    const o = item as Record<string, unknown>
    return {
      name: pickNodeStr(o.name),
      operationalMode: pickNodeStr(o.operationalMode),
      status: pickNodeStr(o.status),
      version: pickNodeStr(o.version),
    }
  })
}

/** 集群节点状态，见 https://weaviate.io/developers/weaviate/api/rest/nodes */
export async function fetchNodes(
  client: AxiosInstance = createWeaviateAxios(),
  opts?: { output?: 'minimal' | 'verbose' },
) {
  const params = new URLSearchParams()
  if (opts?.output) params.set('output', opts.output)
  const qs = params.toString()
  const url = qs ? `/v1/nodes?${qs}` : '/v1/nodes'
  const { data, status } = await client.get<unknown>(url)
  if (status !== 200) throw new Error(`nodes HTTP ${status}`)
  return data
}

export async function fetchReady(client: AxiosInstance = createWeaviateAxios()) {
  const { status } = await client.get('/v1/.well-known/ready')
  return status === 200
}

export async function fetchLive(client: AxiosInstance = createWeaviateAxios()) {
  const { status } = await client.get('/v1/.well-known/live')
  return status === 200
}

export async function fetchSchema(client: AxiosInstance = createWeaviateAxios()) {
  const { data, status } = await client.get<{ classes?: WeaviateClass[] }>('/v1/schema')
  if (status !== 200) throw new Error(`schema HTTP ${status}`)
  const body = data as { classes?: WeaviateClass[] }
  if (Array.isArray(body?.classes)) return body.classes
  return []
}

export async function fetchClassSchema(
  className: string,
  client: AxiosInstance = createWeaviateAxios(),
) {
  const { data, status } = await client.get<WeaviateClass>(`/v1/schema/${encodeURIComponent(className)}`)
  if (status !== 200) throw new Error(`class schema HTTP ${status}`)
  return data
}

/** DELETE /v1/schema/{className} — 删除集合（class）定义及其全部对象数据 */
export async function deleteClassSchema(
  className: string,
  client: AxiosInstance = createWeaviateAxios(),
): Promise<void> {
  const { status } = await client.delete(`/v1/schema/${encodeURIComponent(className)}`)
  if (status !== 200 && status !== 204) throw new Error(`delete schema HTTP ${status}`)
}

export async function graphqlQuery<T = unknown>(
  query: string,
  client: AxiosInstance = createWeaviateAxios(),
): Promise<{ inner: T | undefined; errors?: GraphQLError[] }> {
  return graphqlQueryWithAxios<T>(client, query)
}

export function escapeGraphQLClassName(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return `\`${name.replace(/`/g, '\\`')}\``
  }
  return name
}

export async function aggregateCount(
  className: string,
  client: AxiosInstance = createWeaviateAxios(),
): Promise<number | null> {
  const g = escapeGraphQLClassName(className)
  const q = `{ Aggregate { ${g} { meta { count } } } }`
  const res = await graphqlQuery<{
    Aggregate: Record<string, { meta?: { count?: number } }[]>
  }>(q, client)
  if (res.errors?.length) return null
  const agg = res.inner?.Aggregate
  if (!agg) return null
  const bucket = agg[className] ?? Object.values(agg)[0]
  const row = bucket?.[0]
  const n = row?.meta?.count
  return typeof n === 'number' ? n : null
}

export async function listObjects(
  className: string,
  opts: { limit?: number; after?: string },
  client: AxiosInstance = createWeaviateAxios(),
) {
  const params = new URLSearchParams()
  params.set('class', className)
  params.set('limit', String(opts.limit ?? 20))
  if (opts.after) params.set('after', opts.after)

  const { data, status } = await client.get<{
    objects?: WeaviateObject[]
    totalResults?: number
  }>(`/v1/objects?${params.toString()}`)
  if (status !== 200) throw new Error(`objects HTTP ${status}`)
  return data
}

export async function getObjectById(
  id: string,
  opts?: { includeVector?: boolean },
  client: AxiosInstance = createWeaviateAxios(),
) {
  const params = new URLSearchParams()
  if (opts?.includeVector) params.set('include', 'vector')
  const qs = params.toString()
  const { data, status } = await client.get<WeaviateObject>(
    `/v1/objects/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
  )
  if (status !== 200) throw new Error(`object HTTP ${status}`)
  return data
}

/** DELETE /v1/objects/{id}?class=… — 需指定 class，见 REST Objects */
export async function deleteObjectById(
  className: string,
  id: string,
  client: AxiosInstance = createWeaviateAxios(),
): Promise<void> {
  const params = new URLSearchParams()
  params.set('class', className)
  const { status } = await client.delete(`/v1/objects/${encodeURIComponent(id)}?${params.toString()}`)
  if (status !== 200 && status !== 204) throw new Error(`delete object HTTP ${status}`)
}

export interface NearVectorHit {
  id?: string
  distance?: number
  certainty?: number
  /** BM25：GraphQL `_additional.score`；向量检索通常不填 */
  score?: number
  /** BM25：GraphQL `_additional.explainScore`（BM25F 分解说明） */
  explainScore?: string
  properties: Record<string, unknown>
  vectorPreview?: number[]
}

/** 解析 GraphQL `_additional` 中的数值（部分 Weaviate 响应会把 score/distance 等序列化为字符串） */
function parseGraphQLNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** 解析 BM25 / hybrid 返回的 explainScore（多为字符串，亦可能为结构化 JSON） */
function explainScoreToDisplayString(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') {
    const t = v.trim()
    return t.length ? t : undefined
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

export async function nearVectorSearch(
  className: string,
  vector: number[],
  limit: number,
  propertyNames: string[],
  client: AxiosInstance = createWeaviateAxios(),
): Promise<NearVectorHit[]> {
  const g = escapeGraphQLClassName(className)
  const vec = vector.map((n) => (Number.isFinite(n) ? n : 0)).join(',')
  const fields = [
    '_additional { id distance certainty }',
    ...propertyNames.filter((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p)),
  ].join('\n')
  const q = `{
    Get {
      ${g}(
        nearVector: { vector: [${vec}] }
        limit: ${limit}
      ) {
        ${fields}
      }
    }
  }`
  const res = await graphqlQuery<{
    Get: Record<string, Record<string, unknown>[]>
  }>(q, client)
  if (res.errors?.length) {
    const msg = res.errors.map((e) => e.message).join('; ')
    throw new Error(msg)
  }
  const rows = res.inner?.Get?.[className] ?? []
  return rows.map((row) => {
    const add = row._additional as
      | { id?: string; distance?: unknown; certainty?: unknown }
      | undefined
    const { _additional, ...rest } = row
    const distance = parseGraphQLNumber(add?.distance)
    const certainty = parseGraphQLNumber(add?.certainty)
    return {
      id: add?.id,
      distance,
      certainty,
      properties: rest as Record<string, unknown>,
    }
  })
}

function escapeGraphQLStringLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 倒排索引 BM25 关键词检索（无需向量化），需 class 属性启用 inverted index */
export async function bm25Search(
  className: string,
  query: string,
  limit: number,
  propertyNames: string[],
  bm25SearchProperties?: string[],
  client: AxiosInstance = createWeaviateAxios(),
): Promise<NearVectorHit[]> {
  const g = escapeGraphQLClassName(className)
  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()
  const bm25Props = bm25SearchProperties?.length
    ? bm25SearchProperties.map((p) => `"${escapeGraphQLStringLiteral(p)}"`).join(', ')
    : undefined
  const bm25Inner = bm25Props
    ? `query: "${escaped}"
          properties: [${bm25Props}]`
    : `query: "${escaped}"`
  const fields = [
    '_additional { id score explainScore }',
    ...propertyNames.filter((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p)),
  ].join('\n')
  const q = `{
    Get {
      ${g}(
        bm25: {
          ${bm25Inner}
        }
        limit: ${limit}
      ) {
        ${fields}
      }
    }
  }`
  const res = await graphqlQuery<{
    Get: Record<string, Record<string, unknown>[]>
  }>(q, client)
  if (res.errors?.length) {
    const msg = res.errors.map((e) => e.message).join('; ')
    throw new Error(msg)
  }
  const rows = res.inner?.Get?.[className] ?? []
  return rows.map((row) => {
    const add = row._additional as
      | { id?: string; score?: unknown; explainScore?: unknown }
      | undefined
    const { _additional, ...rest } = row
    const score = parseGraphQLNumber(add?.score)
    const explainScore = explainScoreToDisplayString(add?.explainScore)
    return {
      id: add?.id,
      distance: undefined,
      certainty: undefined,
      score,
      explainScore,
      properties: rest as Record<string, unknown>,
    }
  })
}

export async function nearTextSearch(
  className: string,
  text: string,
  limit: number,
  propertyNames: string[],
  client: AxiosInstance = createWeaviateAxios(),
): Promise<NearVectorHit[]> {
  const g = escapeGraphQLClassName(className)
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const fields = [
    '_additional { id distance certainty }',
    ...propertyNames.filter((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p)),
  ].join('\n')
  const q = `{
    Get {
      ${g}(
        nearText: { concepts: ["${escaped}"] }
        limit: ${limit}
      ) {
        ${fields}
      }
    }
  }`
  const res = await graphqlQuery<{
    Get: Record<string, Record<string, unknown>[]>
  }>(q, client)
  if (res.errors?.length) {
    const msg = res.errors.map((e) => e.message).join('; ')
    throw new Error(msg)
  }
  const rows = res.inner?.Get?.[className] ?? []
  return rows.map((row) => {
    const add = row._additional as { id?: string; distance?: unknown; certainty?: unknown } | undefined
    const { _additional, ...rest } = row
    return {
      id: add?.id,
      distance: parseGraphQLNumber(add?.distance),
      certainty: parseGraphQLNumber(add?.certainty),
      properties: rest as Record<string, unknown>,
    }
  })
}

export type WeaviateBackupBackend = 'filesystem' | 's3'

/**
 * 发起备份：`baseURL` 为当前登录连接的 Weaviate 根地址时，请求即为
 * `POST …/v1/backups/filesystem` 或 `POST …/v1/backups/s3`。
 * Body 含 `id`；`include` 仅在传入非空数组时附加（「全部集合」不传）。
 */
export async function createBackupRequest(
  backend: WeaviateBackupBackend,
  backupId: string,
  client: AxiosInstance = createWeaviateAxios(),
  opts?: { include?: string[] },
): Promise<unknown> {
  const path = `/v1/backups/${encodeURIComponent(backend)}`
  const body: { id: string; include?: string[] } = { id: backupId }
  if (opts?.include?.length) body.include = [...opts.include]
  const { data, status } = await client.post(path, body)
  if (status < 200 || status >= 300) {
    const errBody =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify((data as { error?: unknown }).error ?? data)
        : JSON.stringify(data)
    throw new Error(`HTTP ${status}: ${errBody}`)
  }
  return data
}

/**
 * 备份为异步任务；通过状态查询端点轮询进度。
 * GET `/v1/backups/{backend}/{backup_id}`（`backup_id` 即创建时使用的 `id`）
 * 响应中 `status` 常见取值：`STARTED`、`TRANSFERRING`、`SUCCESS`、`FAILED`。
 */
export interface WeaviateBackupCreateStatus {
  status?: string
  id?: string
  backend?: string
  error?: unknown
  [key: string]: unknown
}

export async function fetchBackupCreateStatus(
  backend: WeaviateBackupBackend,
  backupId: string,
  client: AxiosInstance = createWeaviateAxios(),
): Promise<WeaviateBackupCreateStatus> {
  const path = `/v1/backups/${encodeURIComponent(backend)}/${encodeURIComponent(backupId)}`
  const { data, status } = await client.get<unknown>(path)
  if (status !== 200) throw new Error(`backup status HTTP ${status}`)
  if (!data || typeof data !== 'object') return {}
  return data as WeaviateBackupCreateStatus
}

/** 恢复请求额外选项（嵌套于 Body `config`，与 Weaviate `RestoreConfig` 对齐，以服务端实际支持为准） */
export interface RestoreRequestOptions {
  /** 为 true 时请求体带 `config: { overwriteExistingClasses: true }`，用于覆盖目标端已存在的同名 class */
  overwriteExistingClasses?: boolean
}

/** 发起恢复：`POST /v1/backups/{backend}/{backup_id}/restore` */
export async function createRestoreRequest(
  backend: WeaviateBackupBackend,
  backupId: string,
  client: AxiosInstance,
  opts?: RestoreRequestOptions,
): Promise<unknown> {
  const path = `/v1/backups/${encodeURIComponent(backend)}/${encodeURIComponent(backupId)}/restore`
  const body: Record<string, unknown> = {}
  if (opts?.overwriteExistingClasses) {
    body.config = { overwriteExistingClasses: true }
  }
  const { data, status } = await client.post(path, body)
  if (status < 200 || status >= 300) {
    const errBody =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify((data as { error?: unknown }).error ?? data)
        : JSON.stringify(data)
    throw new Error(`HTTP ${status}: ${errBody}`)
  }
  return data
}

/** `GET /v1/backups/{backend}/{backup_id}/restore` — 查询恢复进度（字段与备份异步任务类似，含 `status`） */
export async function fetchRestoreCreateStatus(
  backend: WeaviateBackupBackend,
  backupId: string,
  client: AxiosInstance,
): Promise<WeaviateBackupCreateStatus> {
  const path = `/v1/backups/${encodeURIComponent(backend)}/${encodeURIComponent(backupId)}/restore`
  const { data, status } = await client.get<unknown>(path)
  if (status !== 200) throw new Error(`restore status HTTP ${status}`)
  if (!data || typeof data !== 'object') return {}
  return data as WeaviateBackupCreateStatus
}
