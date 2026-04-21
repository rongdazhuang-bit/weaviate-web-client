import http from 'node:http'
import { WebSocketServer } from 'ws'
import { createEmbeddingProxyHandler, createWeaviateProxyHandler } from './weaviate-proxy-core'
import { attachMigrationWebSocket, tryHandleMigrationStart } from './migrationJob'

/** 启动时加载官方客户端模块（Node/gRPC），与浏览器包分离 */
import './weaviateOfficialClient'

/**
 * BFF：`/weaviate` + `X-Weaviate-Target` → Weaviate；`/embedding` + `X-Embedding-Target` → 嵌入服务。
 * `/api/migration/*`：后台数据迁移任务 + WebSocket 进度（浏览器不再直连目标 PUT/批量）。
 */
const weaviateProxy = createWeaviateProxyHandler({
  getFallbackTarget: () =>
    process.env.WEAVIATE_PROXY_TARGET?.trim() ||
    process.env.VITE_WEAVIATE_PROXY_TARGET?.trim() ||
    'http://127.0.0.1:8080',
})

const embeddingProxy = createEmbeddingProxyHandler({
  getFallbackTarget: () =>
    process.env.EMBEDDING_PROXY_TARGET?.trim() || 'https://api.openai.com/v1',
})

const migrationWss = new WebSocketServer({ noServer: true })

export function startBff() {
  const port = parseInt(process.env.PORT || process.env.WEAVIATE_BFF_PORT || '8787', 10)
  const host = process.env.BIND_HOST || '127.0.0.1'

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = req.url || '/'

      if (url === '/health' || url.startsWith('/health?')) {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            status: 'ok',
            role: 'weaviate-bff',
            weaviateProxy: true,
            embeddingProxy: true,
            migrationApi: true,
          }),
        )
        return
      }

      if (await tryHandleMigrationStart(req, res)) return

      weaviateProxy(req, res, () => {
        embeddingProxy(req, res, () => {
          res.statusCode = 404
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end('Not Found')
        })
      })
    })()
  })

  attachMigrationWebSocket(server, migrationWss)

  server.listen(port, host, () => {
    console.error(`[weaviate-bff] http://${host}:${port}`)
  })

  return server
}
