import type { IncomingMessage, ServerResponse } from 'node:http'
import httpProxy from 'http-proxy'

function headerString(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()]
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length) return v[0]
  return undefined
}

export interface WeaviateProxyOptions {
  /** 无有效 X-Weaviate-Target 时的回退地址（与开发态 VITE_WEAVIATE_PROXY_TARGET 一致语义） */
  getFallbackTarget: () => string
}

/**
 * Connect 风格中间件：仅处理 `/weaviate` 前缀，其余调用 `next()`。
 * 供 Vite dev 与生产 Node 代理共用。
 */
export function createWeaviateProxyHandler(opts: WeaviateProxyOptions) {
  const proxy = httpProxy.createProxyServer({
    ws: false,
    xfwd: true,
  })

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.removeHeader('x-weaviate-target')
  })

  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url || '/'
    if (!url.startsWith('/weaviate')) {
      next()
      return
    }

    const raw = headerString(req, 'x-weaviate-target')
    const fallback = opts.getFallbackTarget()
    let target =
      typeof raw === 'string' && /^https?:\/\//i.test(raw.trim()) ? raw.trim() : fallback
    if (target.endsWith('/')) target = target.slice(0, -1)

    req.url = url.slice('/weaviate'.length) || '/'

    proxy.web(req, res, { target, changeOrigin: true, secure: false }, (err) => {
      if (!err) return
      res.statusCode = 502
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(`Weaviate 代理转发失败：${err.message}`)
    })
  }
}
