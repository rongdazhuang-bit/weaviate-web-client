import axios from 'axios'
import { useRequestLoadingStore } from '@/stores/requestLoading'

export interface EmbedResult {
  vector: number[]
  dimensions: number
  latencyMs: number
}

export async function embedTextOpenAICompatible(opts: {
  baseURL: string
  apiKey: string
  model: string
  text: string
}): Promise<EmbedResult> {
  const url = `${opts.baseURL.replace(/\/$/, '')}/embeddings`
  const started = performance.now()
  const loading = useRequestLoadingStore()
  loading.begin()
  let data: {
    data?: { embedding?: number[] }[]
    usage?: unknown
  }
  let status: number
  try {
    const res = await axios.post<{
      data?: { embedding?: number[] }[]
      usage?: unknown
    }>(
      url,
      {
        model: opts.model,
        input: opts.text,
        encoding_format: 'float',
      },
      {
        headers: {
          Authorization: opts.apiKey.startsWith('Bearer ') ? opts.apiKey : `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
        validateStatus: (s) => s >= 200 && s < 500,
      },
    )
    data = res.data
    status = res.status
  } finally {
    loading.end()
  }
  const latencyMs = Math.round(performance.now() - started)
  if (status !== 200) {
    const msg = (data as { error?: { message?: string } })?.error?.message || `HTTP ${status}`
    throw new Error(msg)
  }
  const vec = data.data?.[0]?.embedding
  if (!vec?.length) throw new Error('嵌入响应中缺少向量')
  return { vector: vec, dimensions: vec.length, latencyMs }
}
