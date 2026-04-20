<template>
  <div class="page page-migration-guide">
    <h2 class="title">{{ t('migration.restoreRun.title') }}</h2>
    <p class="muted lead">{{ t('migration.restoreRun.lead') }}</p>

    <el-card shadow="never" class="guide-card">
      <el-form label-position="top" size="small" class="restore-form">
        <el-form-item :label="t('migration.restoreRun.sourceLabel')">
          <el-select v-model="backend" class="backend-select" :disabled="running">
            <el-option value="filesystem" :label="t('migration.restoreRun.localRestore')" />
            <el-option value="s3" :label="t('migration.restoreRun.s3Restore')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('migration.restoreRun.targetUrl')">
          <el-input
            v-model="targetUrl"
            class="target-input"
            :disabled="running"
            clearable
            :placeholder="t('migration.restoreRun.urlPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('migration.restoreRun.targetApiKey')">
          <el-input
            v-model="targetApiKey"
            type="password"
            show-password
            clearable
            class="target-input"
            :disabled="running"
            :placeholder="t('migration.restoreRun.apiKeyPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('migration.restoreRun.nameLabel')">
          <el-input
            v-model="backupName"
            class="backup-name-input"
            maxlength="256"
            clearable
            :disabled="running"
            :placeholder="t('migration.restoreRun.namePlaceholder')"
            @input="onBackupNameInput"
          />
        </el-form-item>
        <el-form-item :label="t('migration.restoreRun.overwriteLabel')">
          <el-checkbox v-model="overwriteExistingClasses" :disabled="running">
            {{ t('migration.restoreRun.overwriteHint') }}
          </el-checkbox>
        </el-form-item>
      </el-form>
      <div class="migration-actions">
        <el-button :loading="running" @click="onRunRestore">{{ t('migration.restoreRun.runRestore') }}</el-button>
        <el-button :disabled="running" @click="goBackToDataMigration">{{ t('migration.backLabel') }}</el-button>
      </div>

      <div v-show="progressShown" class="restore-progress-block">
        <div class="panel-subtitle">{{ t('migration.restoreRun.progressLabel') }}</div>
        <el-progress
          :percentage="progressPct"
          :status="progressBarStatus"
          :stroke-width="10"
        />
        <div class="log-toolbar">
          <span class="muted">{{ t('migration.restoreRun.logLabel') }}</span>
        </div>
        <el-scrollbar max-height="220px" class="log-scroll">
          <pre class="log-pre">{{ logText }}</pre>
        </el-scrollbar>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import type { AxiosInstance } from 'axios'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  createRestoreRequest,
  fetchRestoreCreateStatus,
} from '@/api/weaviate'
import { createWeaviateClientForUrl } from '@/api/weaviateRemote'
import { normalizeConnectionUrl } from '@/utils/connectionUrl'
import { useConnectionStore } from '@/stores/connection'

const router = useRouter()
const { t } = useI18n()
const conn = useConnectionStore()

const backend = ref<'filesystem' | 's3'>('filesystem')
const targetUrl = ref('')
const targetApiKey = ref('')
const backupName = ref('')
const overwriteExistingClasses = ref(false)
const running = ref(false)

const progressShown = ref(false)
const progressPct = ref(0)
const progressBarStatus = ref<'success' | 'exception' | undefined>(undefined)
const logLines = ref<string[]>([])
const logText = computed(() => logLines.value.join('\n'))

const BACKUP_NAME_PATTERN = /^[a-zA-Z0-9_]*$/

let pollAbort = false

onMounted(() => {
  if (conn.connectionUrl) targetUrl.value = conn.connectionUrl
  targetApiKey.value = conn.apiKey
})

function appendLog(line: string) {
  const ts = new Date().toLocaleTimeString()
  logLines.value.push(`[${ts}] ${line}`)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function progressFromRestoreStatus(s: string | undefined): number {
  const u = (s || '').toUpperCase()
  switch (u) {
    case 'STARTED':
      return 25
    case 'TRANSFERRING':
      return 60
    case 'SUCCESS':
      return 100
    case 'FAILED':
      return 100
    default:
      return 40
  }
}

function isTerminalRestoreStatus(s: string | undefined): boolean {
  const u = (s || '').toUpperCase()
  if (u === 'SUCCESS' || u === 'FAILED') return true
  if (u === 'CANCELED' || u === 'CANCELLED') return true
  return false
}

async function pollRestoreUntilDone(
  backupId: string,
  client: AxiosInstance,
): Promise<boolean> {
  while (!pollAbort) {
    const body = await fetchRestoreCreateStatus(backend.value, backupId, client)
    const statusStr = typeof body.status === 'string' ? body.status : ''
    progressPct.value = progressFromRestoreStatus(statusStr)
    appendLog(t('migration.restoreRun.logPollStatus', { status: statusStr || '—' }))
    if (body.error != null && body.error !== '') {
      appendLog(`${t('migration.restoreRun.logError')}: ${String(body.error)}`)
    }
    if (isTerminalRestoreStatus(statusStr)) {
      if (statusStr.toUpperCase() === 'SUCCESS') {
        progressBarStatus.value = 'success'
        appendLog(t('migration.restoreRun.logDoneSuccess'))
        return true
      }
      progressBarStatus.value = 'exception'
      const detail =
        body.error != null && body.error !== ''
          ? String(body.error)
          : t('migration.restoreRun.logDoneFail', { status: statusStr })
      appendLog(detail)
      throw new Error(detail)
    }
    await sleep(1500)
  }
  return false
}

onBeforeUnmount(() => {
  pollAbort = true
})

function onBackupNameInput(val: string) {
  const s = String(val ?? '')
  const next = s.replace(/[^a-zA-Z0-9_]/g, '')
  if (next !== s) backupName.value = next
}

function goBackToDataMigration() {
  void router.push({ name: 'data-migration' })
}

async function onRunRestore() {
  const name = backupName.value.trim()
  if (!name || !BACKUP_NAME_PATTERN.test(name)) {
    ElMessage.warning(t('migration.restoreRun.nameRequired'))
    return
  }
  if (!normalizeConnectionUrl(targetUrl.value)) {
    ElMessage.warning(t('migration.restoreRun.errTargetUrl'))
    return
  }

  progressShown.value = true
  logLines.value = []
  progressPct.value = 0
  progressBarStatus.value = undefined
  pollAbort = false
  running.value = true

  appendLog(t('migration.restoreRun.logStarting'))

  try {
    const client = createWeaviateClientForUrl(targetUrl.value.trim(), targetApiKey.value)
    await createRestoreRequest(backend.value, name, client, {
      overwriteExistingClasses: overwriteExistingClasses.value ? true : undefined,
    })
    appendLog(t('migration.restoreRun.logPostOk'))
    progressPct.value = 8

    const finishedOk = await pollRestoreUntilDone(name, client)
    if (finishedOk) {
      ElMessage.success(t('migration.restoreRun.createSuccess'))
    }
  } catch (e: unknown) {
    if (pollAbort) return
    const msg = e instanceof Error ? e.message : String(e)
    appendLog(`${t('migration.restoreRun.createFailed')}: ${msg}`)
    progressBarStatus.value = progressPct.value >= 100 ? 'exception' : undefined
    ElMessage.error(msg)
  } finally {
    running.value = false
  }
}
</script>

<style scoped>
.page-migration-guide {
  max-width: 720px;
}

.title {
  margin: 0;
  font-size: 18px;
}

.lead {
  margin: 12px 0 16px;
  line-height: 1.6;
}

.guide-card {
  border: 1px solid var(--wc-border);
  background: var(--wc-surface-elevated);
}

.guide-card :deep(.el-card__body) {
  padding: 18px 20px 20px;
}

.restore-form :deep(.el-form-item__label) {
  color: var(--wc-text);
  font-weight: 600;
}

.backend-select,
.backup-name-input,
.target-input {
  width: 100%;
  max-width: 480px;
}

.restore-form :deep(.el-checkbox__label) {
  color: var(--wc-text);
  line-height: 1.45;
  white-space: normal;
}

.migration-actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.restore-progress-block {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--wc-border);
}

.panel-subtitle {
  font-weight: 600;
  font-size: 14px;
  color: var(--wc-text);
  margin-bottom: 10px;
}

.log-toolbar {
  margin-top: 14px;
  margin-bottom: 6px;
}

.log-scroll {
  border: 1px solid var(--wc-border);
  border-radius: var(--wc-radius, 8px);
  background: var(--wc-code-bg, var(--wc-surface));
}

.log-pre {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  font-family: ui-monospace, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--wc-text);
}
</style>
