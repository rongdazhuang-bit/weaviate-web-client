<template>
  <div class="login-wrap">
    <div class="login-lang">
      <LanguageSwitcher />
    </div>
    <div class="login-bg" aria-hidden="true" />
    <el-card class="login-card" shadow="never">
      <div class="login-brand">
        <div class="logo">W</div>
        <div>
          <div class="login-title">{{ t('login.brandTitle') }}</div>
          <div class="login-sub">{{ t('login.brandSub') }}</div>
        </div>
      </div>
      <el-form :model="form" label-position="top" class="login-form" @submit.prevent="onSubmit">
        <el-form-item :label="t('login.address')">
          <el-input
            v-model="form.address"
            :placeholder="t('login.addressPlaceholder')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('login.apiKey')">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="t('login.apiKeyPlaceholder')"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.remember">{{ t('login.remember') }}</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="w-full">{{
            t('login.submit')
          }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useConnectionStore } from '@/stores/connection'
import { fetchMeta, fetchReady } from '@/api/weaviate'
import { parseConnectionInput } from '@/utils/connectionUrl'
import { describeConnectionError, isMixedContentBlocked } from '@/utils/connectionErrors'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const { t } = useI18n()
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
    ElMessage.warning(t('login.invalidAddress'))
    return
  }
  /* 生产环境直连时，HTTPS 页面不能请求 HTTP API；开发环境走同域 /weaviate 代理，不受混合内容限制 */
  if (!import.meta.env.DEV && isMixedContentBlocked(form.address)) {
    ElMessage.error(t('login.mixedContent'))
    return
  }

  loading.value = true
  applyToStore()
  try {
    const ok = await fetchReady()
    if (!ok) {
      ElMessage.error(t('login.readyFailed'))
      return
    }
    await fetchMeta()
    conn.connected = true
    form.address = conn.connectionUrl
    ElMessage.success(t('login.success'))
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
.login-lang {
  position: absolute;
  top: 16px;
  right: 20px;
  z-index: 2;
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
