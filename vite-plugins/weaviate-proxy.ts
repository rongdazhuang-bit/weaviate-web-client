import type { Plugin } from 'vite'
import { createWeaviateProxyHandler } from '../server/weaviate-proxy-core'

/**
 * 开发环境：浏览器请求同域 /weaviate/*，由本中间件转发到连接地址（请求头 X-Weaviate-Target），
 * 避免 CORS。未带头时回退 VITE_WEAVIATE_PROXY_TARGET（默认 http://127.0.0.1:8080）。
 */
export function weaviateDynamicProxy(): Plugin {
  const handler = createWeaviateProxyHandler({
    getFallbackTarget: () =>
      process.env.VITE_WEAVIATE_PROXY_TARGET?.trim() || 'http://127.0.0.1:8080',
  })

  return {
    name: 'weaviate-dynamic-proxy',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(handler)
    },
  }
}
