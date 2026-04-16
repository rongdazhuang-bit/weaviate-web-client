<template>
  <div class="login-wrap">
    <div class="login-bg" aria-hidden="true" />
    <el-card class="login-card" shadow="never">
      <div class="login-brand">
        <div class="logo">W</div>
        <div>
          <div class="login-title">Weaviate 向量库</div>
          <div class="login-sub">连接你的实例，浏览集合与向量检索</div>
        </div>
      </div>
      <el-form :model="form" label-position="top" class="login-form" @submit.prevent="onSubmit">
        <el-form-item label="连接地址">
          <el-input
            v-model="form.address"
            placeholder="例如 http://localhost:8080 或 https://example.com:8080"
            clearable
          />
        </el-form-item>
        <el-form-item label="API Key（可选）">
          <el-input v-model="form.apiKey" type="password" show-password placeholder="未启用鉴权可留空" clearable />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.remember">记住</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="w-full">连接并登录</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useConnectionStore } from '@/stores/connection'
import { fetchMeta, fetchReady } from '@/api/weaviate'
import { parseConnectionInput } from '@/utils/connectionUrl'
import { describeConnectionError, isMixedContentBlocked } from '@/utils/connectionErrors'

const route = useRoute()
const router = useRouter()
const conn = useConnectionStore()
const loading = ref(false)

const DEFAULT_ADDRESS = 'http://localhost:8080'

const form = reactive({
  address: DEFAULT_ADDRESS,
  apiKey: '',
  remember: false,
})

onMounted(() => {
  conn.loadRemembered()
  if (conn.host.trim()) {
    form.address = conn.connectionUrl
    form.apiKey = conn.apiKey
    form.remember = conn.remember
  } else {
    form.address = DEFAULT_ADDRESS
    form.apiKey = ''
    form.remember = false
  }
})

function applyToStore() {
  const parsed = parseConnectionInput(form.address)
  if (!parsed) return
  conn.host = parsed.host
  conn.port = parsed.port
  conn.protocol = parsed.protocol
  conn.apiKey = form.apiKey
  conn.remember = form.remember
  conn.saveRemembered()
}

async function onSubmit() {
  const parsed = parseConnectionInput(form.address)
  if (!parsed || !parsed.host.trim()) {
    ElMessage.warning('请填写有效的连接地址')
    return
  }
  /* 生产环境直连时，HTTPS 页面不能请求 HTTP API；开发环境走同域 /weaviate 代理，不受混合内容限制 */
  if (!import.meta.env.DEV && isMixedContentBlocked(form.address)) {
    ElMessage.error(
      '当前页面为 HTTPS，无法直接请求 HTTP 的 Weaviate（浏览器混合内容限制）。请使用 HTTPS 访问 Weaviate，或将前端与 API 置于同域反向代理下。',
    )
    return
  }

  loading.value = true
  applyToStore()
  try {
    const ok = await fetchReady()
    if (!ok) {
      ElMessage.error('就绪检查未通过（/.well-known/ready）')
      return
    }
    await fetchMeta()
    conn.connected = true
    form.address = conn.connectionUrl
    ElMessage.success('连接成功')
    const redir = (route.query.redirect as string) || '/app/cluster'
    await router.replace(redir)
  } catch (e: unknown) {
    ElMessage.error(describeConnectionError(e))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  position: relative;
  overflow: hidden;
}
.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(1200px 600px at 20% 0%, rgba(14, 165, 233, 0.22), transparent 55%),
    radial-gradient(900px 500px at 90% 20%, rgba(99, 102, 241, 0.18), transparent 50%),
    linear-gradient(165deg, #0b1220 0%, #0f172a 45%, #020617 100%);
}
.login-card {
  position: relative;
  width: 100%;
  max-width: 460px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}
.login-brand {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 8px;
}
.logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  box-shadow: 0 10px 30px rgba(14, 165, 233, 0.25);
}
.login-title {
  font-weight: 700;
  font-size: 18px;
  color: #0f172a;
}
.login-sub {
  margin-top: 2px;
  font-size: 13px;
  color: #64748b;
}
.login-form {
  margin-top: 8px;
}
.w-full {
  width: 100%;
}
</style>
