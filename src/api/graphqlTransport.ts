/**
 * GraphQL 经 Axios 发往同域 `/weaviate`（由 BFF 转发至真实 Weaviate）。
 * 用 `graphql-request` 解析响应；前端不打包 `weaviate-client` 运行时（与 Node BFF 侧 SDK 分离）。
 */
import type { AxiosInstance } from 'axios'
import { ClientError, GraphQLClient } from 'graphql-request'

const GRAPHQL_DUMMY_URL = 'https://weaviate-app.invalid/v1/graphql'

function createAxiosBackedFetch(axios: AxiosInstance): typeof fetch {
  return async (url, init) => {
    void url
    const body =
      init?.body != null
        ? typeof init.body === 'string'
          ? (JSON.parse(init.body) as { query?: string })
          : init.body
        : {}
    const res = await axios.post<unknown>('/v1/graphql', body, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string>),
      },
      signal: init?.signal as AbortSignal | undefined,
      validateStatus: () => true,
    })
    const text =
      typeof res.data === 'object' && res.data !== null ? JSON.stringify(res.data) : String(res.data ?? '')
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export function createWeaviateGraphQLClient(axios: AxiosInstance): GraphQLClient {
  return new GraphQLClient(GRAPHQL_DUMMY_URL, {
    fetch: createAxiosBackedFetch(axios),
  })
}

/** 与原先 `graphqlQuery` 语义一致：`errors` 存在时不抛错；HTTP 非 200 仍抛错 */
export async function graphqlQueryWithAxios<T>(
  axios: AxiosInstance,
  query: string,
): Promise<{ inner: T | undefined; errors?: { message: string }[] }> {
  const gc = createWeaviateGraphQLClient(axios)
  try {
    const res = await gc.rawRequest<T>(query)
    return {
      inner: res.data,
      errors: res.errors?.map((e) => ({ message: e.message })),
    }
  } catch (e) {
    if (e instanceof ClientError) {
      const r = e.response as {
        data?: T
        errors?: { message?: string }[]
        status?: number
      }
      if (typeof r.status === 'number' && r.status !== 200) {
        throw new Error(`GraphQL HTTP ${r.status}`)
      }
      return {
        inner: r.data,
        errors: r.errors?.map((err) => ({ message: err.message ?? '' })),
      }
    }
    throw e
  }
}
