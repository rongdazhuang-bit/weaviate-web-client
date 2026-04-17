import http from 'node:http'
import { createWeaviateProxyHandler } from './weaviate-proxy-core'

const port = Number(process.env.PORT || 3000)
const host = process.env.BIND_HOST || '127.0.0.1'

const handler = createWeaviateProxyHandler({
  getFallbackTarget: () =>
    process.env.WEAVIATE_PROXY_TARGET?.trim() ||
    process.env.VITE_WEAVIATE_PROXY_TARGET?.trim() ||
    'http://127.0.0.1:8080',
})

http
  .createServer((req, res) => {
    handler(req, res, () => {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('Not Found')
    })
  })
  .listen(port, host, () => {
    console.error(`[weaviate-proxy] http://${host}:${port}`)
  })
