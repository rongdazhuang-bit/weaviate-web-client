import type { IncomingMessage, ServerResponse } from 'node:http'
import httpProxy from 'http-proxy'

function headerString(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()]
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length) return v[0]
  return undefined
}

export interface ForwardProxyOptions {
  /** 同域路径前缀，如 `/weaviate`、`/embedding` */
  pathPrefix: string
  /** 目标上游根地址，如 `X-Weaviate-Target`、`X-Embedding-Target`（小写匹配） */
  targetHeader: string
  getFallbackTarget: () => string
}

/**
 * 通用 HTTP 转发：浏览器请求同域 `pathPrefix/*`，由 Node 转发到请求头指定的 `http(s)://…` 根地址。
 */
export function createForwardProxyHandler(opts: ForwardProxyOptions) {
  const { pathPrefix, targetHeader, getFallbackTarget } = opts
  const headerLc = targetHeader.toLowerCase()
  const proxy = httpProxy.createProxyServer({
    ws: false,
    xfwd: true,
  })

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.removeHeader(headerLc)
  })

  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url || '/'
    if (!url.startsWith(pathPrefix)) {
      next()
      return
    }

    const raw = headerString(req, headerLc)
    const fallback = getFallbackTarget()
    let target =
      typeof raw === 'string' && /^https?:\/\//i.test(raw.trim()) ? raw.trim() : fallback
    if (target.endsWith('/')) target = target.slice(0, -1)

    req.url = url.slice(pathPrefix.length) || '/'

    proxy.web(req, res, { target, changeOrigin: true, secure: false }, (err) => {
      if (!err) return
      res.statusCode = 502
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      const label = pathPrefix === '/embedding' ? '嵌入 API' : 'Weaviate'
      res.end(`${label} 代理转发失败：${err.message}`)
    })
  }
}

export interface WeaviateProxyOptions {
  getFallbackTarget: () => string
}

/** `/weaviate` → `X-Weaviate-Target` */
export function createWeaviateProxyHandler(opts: WeaviateProxyOptions) {
  return createForwardProxyHandler({
    pathPrefix: '/weaviate',
    targetHeader: 'x-weaviate-target',
    getFallbackTarget: opts.getFallbackTarget,
  })
}

export interface EmbeddingProxyOptions {
  getFallbackTarget: () => string
}

/** `/embedding` → `X-Embedding-Target`（OpenAI 兼容嵌入等） */
export function createEmbeddingProxyHandler(opts: EmbeddingProxyOptions) {
  return createForwardProxyHandler({
    pathPrefix: '/embedding',
    targetHeader: 'x-embedding-target',
    getFallbackTarget: opts.getFallbackTarget,
  })
}
