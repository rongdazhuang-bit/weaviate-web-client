import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const bffTarget = env.VITE_WEAVIATE_BFF_TARGET || 'http://127.0.0.1:8787'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    /**
     * 开发态：浏览器 → Vite → Node BFF（weaviate-bff）→ Weaviate。
     * 请同时运行 `npm run dev:bff` 或使用 `npm run dev`（并发启动）。
     */
    server: {
      proxy: {
        '/weaviate': {
          target: bffTarget,
          changeOrigin: true,
        },
        '/embedding': {
          target: bffTarget,
          changeOrigin: true,
        },
      },
    },
    /** `vite preview` 同样需要 BFF */
    preview: {
      proxy: {
        '/weaviate': {
          target: bffTarget,
          changeOrigin: true,
        },
        '/embedding': {
          target: bffTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
