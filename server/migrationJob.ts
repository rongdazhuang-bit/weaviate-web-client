import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios'
import type { WebSocket, WebSocketServer } from 'ws'
import {
  createWeaviateAxiosDirect,
  formatHttpResponseBodyForLog,
  HTTP_RESPONSE_BODY_LOG_VERBOSE_MAX,
} from '../src/api/weaviateRemote'
import { runApiMigrationJob } from '../src/api/migrationRun'
import type { ApiMigrationConfig } from '../src/api/migrationTypes'

type Job = {
  abort: AbortController
  sockets: Set<WebSocket>
}

const jobs = new Map<string, Job>()

const LOG_PREFIX = '[weaviate-bff/migration]'
const MAX_LOG_JSON = 12_000

function jobTag(jobId: string) {
  return `[${jobId.slice(0, 8)}]`
}

function logInfo(jobId: string, msg: string) {
  console.log(`${LOG_PREFIX} ${jobTag(jobId)} ${msg}`)
}

function logWarn(jobId: string | undefined, msg: string) {
  const tag = jobId ? `${jobTag(jobId)} ` : ''
  console.warn(`${LOG_PREFIX} ${tag}${msg}`)
}

function logError(jobId: string | undefined, msg: string, err?: unknown) {
  const tag = jobId ? `${jobTag(jobId)} ` : ''
  console.error(`${LOG_PREFIX} ${tag}${msg}`)
  if (err instanceof Error && err.stack) console.error(err.stack)
  else if (err !== undefined) console.error(err)
}

function truncateJson(val: unknown): string {
  try {
    const s = JSON.stringify(val)
    if (s.length <= MAX_LOG_JSON) return s
    return `${s.slice(0, MAX_LOG_JSON)}… (+${s.length - MAX_LOG_JSON} chars)`
  } catch {
    return String(val)
  }
}

/** 启动迁移 API 请求体脱敏后写入日志 */
function redactMigrationStartBody(body: unknown): string {
  if (body == null || typeof body !== 'object') return truncateJson(body)
  const o = { ...(body as Record<string, unknown>) }
  if (typeof o.sourceKey === 'string' && o.sourceKey.length > 0) o.sourceKey = '[REDACTED]'
  if (typeof o.targetKey === 'string' && o.targetKey.length > 0) o.targetKey = '[REDACTED]'
  return truncateJson(o)
}

function buildRequestUrl(config: InternalAxiosRequestConfig): string {
  const base = (config.baseURL ?? '').replace(/\/$/, '')
  const u = config.url ?? ''
  if (!u) return base
  return u.startsWith('http') ? u : `${base}${u}`
}

function parseConfigData(data: InternalAxiosRequestConfig['data']): unknown {
  if (data == null) return data
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown
    } catch {
      return data.length > 2000 ? `${data.slice(0, 2000)}…` : data
    }
  }
  return data
}

/** 请求体摘要：批量 objects 不打印向量，仅条数与首条元数据 */
function summarizeRequestPayload(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'object' && data !== null && 'objects' in data) {
    const o = data as { objects?: { class?: string; id?: string; properties?: unknown }[] }
    const arr = o.objects
    if (Array.isArray(arr)) {
      const first = arr[0]
      return truncateJson({
        objectsCount: arr.length,
        sample: first
          ? {
              class: first.class,
              id: first.id,
              propertyKeys:
                first.properties && typeof first.properties === 'object'
                  ? Object.keys(first.properties as object).slice(0, 20)
                  : [],
            }
          : null,
      })
    }
  }
  return truncateJson(data)
}

/** 目标端预期 404：单对象存在性检查，或列表 GET /v1/objects?class=…（全量清空前列表，集合未建时可为 404） */
function shouldSkipExpectedTarget404(
  role: 'source' | 'target',
  status: number,
  method: string,
  fullUrl: string,
): boolean {
  if (role !== 'target' || status !== 404) return false
  if (method.toUpperCase() !== 'GET') return false
  const pathOnly = fullUrl.split('?')[0].replace(/\/$/, '')
  if (/\/v1\/objects$/i.test(pathOnly)) return true
  if (/\/v1\/objects\/[^/?]+$/i.test(pathOnly)) return true
  return false
}

/** 源/目标 Weaviate HTTP：异常或 Axios 拒绝时打摘要；`logHttpPayloads: false` 时不输出请求/响应报文 */
function attachWeaviateHttpDiagnostics(
  client: AxiosInstance,
  role: 'source' | 'target',
  jobId: string,
  opts?: { warnOnBatchResultLengthMismatch?: boolean; logHttpPayloads?: boolean },
) {
  const warnOnBatchResultLengthMismatch = opts?.warnOnBatchResultLengthMismatch !== false
  const logHttpPayloads = opts?.logHttpPayloads !== false
  client.interceptors.response.use(
    (res: AxiosResponse) => {
      const cfg = res.config
      const method = (cfg.method ?? 'get').toUpperCase()
      const fullUrl = buildRequestUrl(cfg)
      const status = res.status

      if (status >= 400 && !shouldSkipExpectedTarget404(role, status, method, fullUrl)) {
        const params = cfg.params ? truncateJson(cfg.params) : ''
        const payloadSuffix = logHttpPayloads
          ? (() => {
              const reqParsed = parseConfigData(cfg.data)
              const reqSummary = summarizeRequestPayload(reqParsed)
              return ` reqBody=${reqSummary || '(none)'} respBody=${truncateJson(res.data)}`
            })()
          : ''
        logWarn(
          jobId,
          `[http ${role}] API=${method} ${fullUrl} HTTP ${status} params=${params || '(none)'}${payloadSuffix}`,
        )
      }

      if (
        method === 'POST' &&
        (cfg.url ?? '').includes('/v1/batch/objects') &&
        status === 200
      ) {
        try {
          const reqParsed = parseConfigData(cfg.data) as { objects?: unknown[] } | null
          const n = Array.isArray(reqParsed?.objects) ? reqParsed.objects.length : 0
          const results = (res.data as { result?: unknown[] } | null)?.result
          const rlen = Array.isArray(results) ? results.length : 0
          if (warnOnBatchResultLengthMismatch && n > 0 && rlen < n) {
            const rawResp = formatHttpResponseBodyForLog(res.data, HTTP_RESPONSE_BODY_LOG_VERBOSE_MAX)
            logWarn(
              jobId,
              `[http ${role}] POST /v1/batch/objects result length mismatch: requestObjects=${n} resultItems=${rlen} API=${fullUrl} reqBody=${summarizeRequestPayload(reqParsed)} rawRespBody(max ${HTTP_RESPONSE_BODY_LOG_VERBOSE_MAX})=${rawResp}`,
            )
          }
        } catch {
          /* ignore */
        }
      }

      return res
    },
    (err: AxiosError) => {
      const cfg = err.config
      if (cfg) {
        const method = (cfg.method ?? '?').toUpperCase()
        const fullUrl = buildRequestUrl(cfg)
        const params = cfg.params ? truncateJson(cfg.params) : ''
        const st = err.response?.status
        const payloadSuffix = logHttpPayloads
          ? (() => {
              const reqParsed = parseConfigData(cfg.data)
              const reqSummary = summarizeRequestPayload(reqParsed)
              const respBody = err.response ? truncateJson(err.response.data) : '(no response body)'
              return ` reqBody=${reqSummary || '(none)'} respBody=${respBody}`
            })()
          : ''
        logError(
          jobId,
          `[http ${role}] request failed API=${method} ${fullUrl} params=${params || '(none)'} ${st != null ? `HTTP ${st}` : err.code ?? err.message}${payloadSuffix}`,
          err,
        )
      } else {
        logError(jobId, `[http ${role}] request failed (no config) ${err.message}`, err)
      }
      return Promise.reject(err)
    },
  )
}

function formatAxiosErrorExtra(e: AxiosError, logHttpPayloads: boolean): string {
  const cfg = e.config
  if (!cfg) return ''
  const method = (cfg.method ?? '?').toUpperCase()
  const fullUrl = buildRequestUrl(cfg)
  const params = cfg.params ? truncateJson(cfg.params) : '(none)'
  const st = e.response?.status
  if (!logHttpPayloads) {
    return `api=${method} ${fullUrl} params=${params} ${st != null ? `http=${st}` : ''}`
  }
  const reqParsed = parseConfigData(cfg.data)
  const reqSummary = summarizeRequestPayload(reqParsed) || '(none)'
  const resp = e.response ? truncateJson(e.response.data) : '(no response body)'
  return `api=${method} ${fullUrl} params=${params} reqBody=${reqSummary} ${st != null ? `http=${st}` : ''} respBody=${resp}`
}

/** 与前端日志同步：批量写入异常、条数不一致等不一定会 throw，需单独打 stderr */
function mirrorAnomalyLog(jobId: string, line: string) {
  if (
    line.includes('条数不一致') ||
    line.includes('aborted') ||
    /\[迁移\].*失败/.test(line) ||
    /batch HTTP\s+\d+/i.test(line) ||
    /put object HTTP\s+\d+/i.test(line) ||
    /objects HTTP\s+\d+/i.test(line)
  ) {
    logWarn(jobId, line)
  }
}

function broadcast(jobId: string, msg: object) {
  const job = jobs.get(jobId)
  if (!job) return
  const s = JSON.stringify(msg)
  for (const ws of job.sockets) {
    if (ws.readyState === 1) ws.send(s)
  }
}

function parseMigrationConfig(body: unknown): ApiMigrationConfig | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  if (typeof o.sourceUrl !== 'string' || typeof o.targetUrl !== 'string') return null
  if (typeof o.sourceKey !== 'string' || typeof o.targetKey !== 'string') return null
  if (typeof o.allClasses !== 'boolean') return null
  if (!Array.isArray(o.selectedClasses) || !o.selectedClasses.every((x) => typeof x === 'string')) {
    return null
  }
  if (o.mode !== 'full' && o.mode !== 'incremental') return null
  return {
    sourceUrl: o.sourceUrl,
    sourceKey: o.sourceKey,
    targetUrl: o.targetUrl,
    targetKey: o.targetKey,
    allClasses: o.allClasses,
    selectedClasses: o.selectedClasses as string[],
    mode: o.mode,
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const ch of req) chunks.push(ch as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch (e) {
    const sample = raw.length > 4000 ? `${raw.slice(0, 4000)}… (+${raw.length - 4000} chars)` : raw
    logError(undefined, `readJsonBody: JSON.parse failed api=POST body(raw)=${sample}`, e)
    return undefined
  }
}

/** 延后清理，确保 `done` / `error` 已发出再由服务端关闭连接 */
function scheduleFinishJob(jobId: string) {
  setTimeout(() => {
    const job = jobs.get(jobId)
    if (!job) return
    jobs.delete(jobId)
    for (const ws of job.sockets) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    job.sockets.clear()
  }, 500)
}

function runJobAsync(jobId: string, cfg: ApiMigrationConfig) {
  const job = jobs.get(jobId)
  if (!job) {
    logWarn(jobId, 'runJobAsync: job entry missing (internal error)')
    return
  }

  void (async () => {
    logInfo(
      jobId,
      `job started mode=${cfg.mode} allClasses=${cfg.allClasses} selectedClassCount=${cfg.selectedClasses.length}`,
    )
    const src = createWeaviateAxiosDirect(cfg.sourceUrl, cfg.sourceKey)
    const tgt = createWeaviateAxiosDirect(cfg.targetUrl, cfg.targetKey)
    const migrationHttpLogOpts = {
      warnOnBatchResultLengthMismatch: false,
      logHttpPayloads: false,
    } as const
    attachWeaviateHttpDiagnostics(src, 'source', jobId, migrationHttpLogOpts)
    attachWeaviateHttpDiagnostics(tgt, 'target', jobId, migrationHttpLogOpts)
    try {
      const result = await runApiMigrationJob(
        cfg,
        { src, tgt },
        (line) => {
          mirrorAnomalyLog(jobId, line)
          broadcast(jobId, { type: 'log', line })
        },
        (pct) => broadcast(jobId, { type: 'progress', pct }),
        {
          signal: job.abort.signal,
          onServerLog: (line) => logInfo(jobId, line),
        },
      )
      broadcast(jobId, { type: 'done', ...result })
      if (result.batchItemFailures > 0) {
        logWarn(
          jobId,
          `job finished with batch write failures: successes=${result.batchItemSuccesses} failures=${result.batchItemFailures}`,
        )
      } else {
        logInfo(jobId, `job finished ok batchSuccesses=${result.batchItemSuccesses}`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const axiosExtra = isAxiosError(e)
        ? ` | ${formatAxiosErrorExtra(e, migrationHttpLogOpts.logHttpPayloads)}`
        : ''
      logError(jobId, `job failed: ${message}${axiosExtra}`, e)
      broadcast(jobId, { type: 'error', message })
    } finally {
      scheduleFinishJob(jobId)
    }
  })()
}

/** POST /api/migration/start — 返回 true 表示已处理 */
export async function tryHandleMigrationStart(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const pathOnly = (req.url || '').split('?')[0] || ''
  if (req.method !== 'POST' || pathOnly !== '/api/migration/start') return false

  const body = await readJsonBody(req)
  if (body === undefined) {
    logWarn(
      undefined,
      'api=POST /api/migration/start malformed JSON (see previous readJsonBody error for raw snippet)',
    )
    res.statusCode = 400
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'invalid migration config body' }))
    return true
  }
  const cfg = parseMigrationConfig(body)
  if (!cfg) {
    logWarn(
      undefined,
      `api=POST /api/migration/start invalid migration config fields body=${redactMigrationStartBody(body)}`,
    )
    res.statusCode = 400
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'invalid migration config body' }))
    return true
  }

  const jobId = randomUUID()
  jobs.set(jobId, { abort: new AbortController(), sockets: new Set() })

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ jobId }))

  setImmediate(() => runJobAsync(jobId, cfg))
  return true
}

export function attachMigrationWebSocket(
  server: import('node:http').Server,
  wss: WebSocketServer,
): void {
  server.on('upgrade', (request, socket: Duplex, head) => {
    const host = request.headers.host ?? '127.0.0.1'
    let url: URL
    try {
      url = new URL(request.url || '/', `http://${host}`)
    } catch (e) {
      logError(
        undefined,
        `api=WS ${request.url ?? ''} upgrade failed: invalid URL host=${host}`,
        e,
      )
      socket.destroy()
      return
    }

    if (url.pathname !== '/api/migration/ws') {
      socket.destroy()
      return
    }

    const jobId = url.searchParams.get('jobId')?.trim() ?? ''
    if (!jobId || !jobs.has(jobId)) {
      logWarn(
        undefined,
        `api=GET /api/migration/ws params=jobId=${jobId ? jobId.slice(0, 8) + '…' : '(empty)'} rejected: unknown or stale job`,
      )
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const job = jobs.get(jobId)
      if (!job) {
        ws.close()
        return
      }
      job.sockets.add(ws)
      ws.on('close', () => job.sockets.delete(ws))
      ws.on('message', (data) => {
        try {
          const o = JSON.parse(String(data)) as { type?: string }
          if (o?.type === 'abort') job.abort.abort()
        } catch (e) {
          logError(jobId, `api=WS message parse failed raw=${truncateJson(String(data))}`, e)
        }
      })
    })
  })
}
