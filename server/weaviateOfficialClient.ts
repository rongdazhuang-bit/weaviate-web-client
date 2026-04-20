import weaviate, { ApiKey } from 'weaviate-client'

/**
 * 在 Node BFF 侧使用官方 `weaviate-client`（gRPC + REST）。
 * 默认 gRPC：`WEAVIATE_GRPC_HOST` 或 HTTP 主机名，`WEAVIATE_GRPC_PORT` 默认 50051。
 * 当前架构下浏览器 REST 仍由 `weaviate-proxy-core` 转发；本连接供后续将接口迁至 SDK。
 */
export async function connectOfficialWeaviateClient(httpTargetUrl: string, apiKey?: string) {
  const u = new URL(httpTargetUrl)
  const httpSecure = u.protocol === 'https:'
  const httpPort = u.port ? parseInt(u.port, 10) : httpSecure ? 443 : 80

  const grpcHost = process.env.WEAVIATE_GRPC_HOST?.trim() || u.hostname
  const grpcPort = Number(process.env.WEAVIATE_GRPC_PORT || 50051)
  const grpcSecure =
    process.env.WEAVIATE_GRPC_SECURE === 'true' ||
    (process.env.WEAVIATE_GRPC_SECURE !== 'false' && httpSecure)

  let auth: ApiKey | undefined
  const k = apiKey?.trim()
  if (k) {
    const raw = k.startsWith('Bearer ') ? k.slice(7).trim() : k
    if (raw) auth = new ApiKey(raw)
  }

  return weaviate.connectToCustom({
    httpHost: u.hostname,
    httpPort,
    httpSecure,
    httpPath: '',
    grpcHost,
    grpcPort,
    grpcSecure,
    authCredentials: auth,
  })
}

export { weaviate, ApiKey }
