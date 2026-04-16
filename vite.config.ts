import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { weaviateDynamicProxy } from './vite-plugins/weaviate-proxy'

export default defineConfig({
  /* 代理插件需先于 Vue，避免 SPA 回退抢在 /weaviate 之前 */
  plugins: [weaviateDynamicProxy(), vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
