import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import httpProxy from 'http-proxy'

function headerString(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()]
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length) return v[0]
  return undefined
}

/**
 * 开发环境：浏览器请求同域 /weaviate/*，由本中间件转发到连接地址（请求头 X-Weaviate-Target），
 * 避免 CORS。未带头时回退 VITE_WEAVIATE_PROXY_TARGET（默认 http://127.0.0.1:8080）。
 */
export function weaviateDynamicProxy(): Plugin {
  const proxy = httpProxy.createProxyServer({
    ws: false,
    xfwd: true,
  })

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.removeHeader('x-weaviate-target')
  })

  return {
    name: 'weaviate-dynamic-proxy',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          const url = req.url || '/'
          if (!url.startsWith('/weaviate')) {
            next()
            return
          }

          const raw = headerString(req, 'x-weaviate-target')
          const fallback = process.env.VITE_WEAVIATE_PROXY_TARGET || 'http://127.0.0.1:8080'
          let target =
            typeof raw === 'string' && /^https?:\/\//i.test(raw.trim()) ? raw.trim() : fallback
          if (target.endsWith('/')) target = target.slice(0, -1)

          req.url = url.slice('/weaviate'.length) || '/'

          proxy.web(req, res, { target, changeOrigin: true, secure: false }, (err) => {
            if (!err) return
            res.statusCode = 502
            res.setHeader('content-type', 'text/plain; charset=utf-8')
            res.end(`开发代理转发失败：${err.message}`)
          })
        },
      )
    },
  }
}
