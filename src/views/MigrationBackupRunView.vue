<template>
  <div class="page page-migration-guide">
    <h2 class="title">{{ t('migration.backupRun.title') }}</h2>
    <p class="muted lead">{{ t('migration.backupRun.lead') }}</p>

    <el-card shadow="never" class="guide-card">
      <el-form label-position="top" size="small" class="backup-form">
        <el-form-item :label="t('migration.backupRun.backendLabel')">
          <el-select v-model="backend" class="backend-select" :disabled="running">
            <el-option value="filesystem" :label="t('migration.backupRun.filesystem')" />
            <el-option value="s3" :label="t('migration.backupRun.s3')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('migration.backupRun.nameLabel')">
          <el-input
            v-model="backupName"
            class="backup-name-input"
            maxlength="256"
            clearable
            :disabled="running"
            :placeholder="t('migration.backupRun.namePlaceholder')"
            @input="onBackupNameInput"
          />
        </el-form-item>
        <el-form-item :label="t('migration.backupRun.scopeLabel')">
          <el-radio-group v-model="scopeMode" class="scope-radio" :disabled="running">
            <el-radio value="all">{{ t('migration.backupRun.allClasses') }}</el-radio>
            <el-radio value="pick">{{ t('migration.backupRun.pickClasses') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="scopeMode === 'pick'" :label="t('migration.backupRun.classesLabel')">
          <div class="class-select-row">
            <el-select
              v-model="pickedClasses"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              class="class-select"
              :disabled="running"
              :placeholder="t('migration.backupRun.classesPlaceholder')"
            >
              <el-option v-for="c in classOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <el-tooltip :content="t('migration.backupRun.refreshClasses')" placement="top">
              <el-button
                :loading="loadingClasses"
                :disabled="running"
                circle
                class="refresh-classes-btn"
                @click="() => loadLocalClasses()"
              >
                <el-icon><Refresh /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </el-form-item>
      </el-form>
      <div class="migration-actions">
        <el-button :loading="running" @click="onRunBackup">{{ t('migration.backupRun.runBackup') }}</el-button>
        <el-button :disabled="running" @click="goBackToDataMigration">{{ t('migration.backLabel') }}</el-button>
      </div>

      <div v-show="progressShown" class="backup-progress-block">
        <div class="panel-subtitle">{{ t('migration.backupRun.progressLabel') }}</div>
        <el-progress
          :percentage="progressPct"
          :status="progressBarStatus"
          :stroke-width="10"
        />
        <div class="log-toolbar">
          <span class="muted">{{ t('migration.backupRun.logLabel') }}</span>
        </div>
        <el-scrollbar max-height="220px" class="log-scroll">
          <pre class="log-pre">{{ logText }}</pre>
        </el-scrollbar>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { createWeaviateAxios } from '@/api/http'
import {
  createBackupRequest,
  fetchBackupCreateStatus,
  fetchSchema,
} from '@/api/weaviate'

const router = useRouter()
const { t } = useI18n()

const backend = ref<'filesystem' | 's3'>('filesystem')
const scopeMode = ref<'all' | 'pick'>('all')
const pickedClasses = ref<string[]>([])
const classOptions = ref<string[]>([])
const loadingClasses = ref(false)
const backupName = ref('')
const running = ref(false)

const progressShown = ref(false)
const progressPct = ref(0)
const progressBarStatus = ref<'success' | 'exception' | undefined>(undefined)
const logLines = ref<string[]>([])
const logText = computed(() => logLines.value.join('\n'))

const BACKUP_NAME_PATTERN = /^[a-zA-Z0-9_]*$/

let pickClassLoadTimer: ReturnType<typeof setTimeout> | undefined
let pollAbort = false

function appendLog(line: string) {
  const ts = new Date().toLocaleTimeString()
  logLines.value.push(`[${ts}] ${line}`)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** 与文档一致：STARTED、TRANSFERRING 为进行中；SUCCESS、FAILED 为终态；其余按进行中估算 */
function progressFromBackupStatus(s: string | undefined): number {
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

function isTerminalBackupStatus(s: string | undefined): boolean {
  const u = (s || '').toUpperCase()
  if (u === 'SUCCESS' || u === 'FAILED') return true
  /** 部分版本可能返回取消类终态 */
  if (u === 'CANCELED' || u === 'CANCELLED') return true
  return false
}

/** 返回 `true` 表示已成功结束；`false` 表示卸载等导致中止，不应再提示成功 */
async function pollBackupUntilDone(
  backupId: string,
  client: ReturnType<typeof createWeaviateAxios>,
): Promise<boolean> {
  while (!pollAbort) {
    const body = await fetchBackupCreateStatus(backend.value, backupId, client)
    const statusStr = typeof body.status === 'string' ? body.status : ''
    progressPct.value = progressFromBackupStatus(statusStr)
    appendLog(t('migration.backupRun.logPollStatus', { status: statusStr || '—' }))
    if (body.error != null && body.error !== '') {
      appendLog(`${t('migration.backupRun.logError')}: ${String(body.error)}`)
    }
    if (isTerminalBackupStatus(statusStr)) {
      if (statusStr.toUpperCase() === 'SUCCESS') {
        progressBarStatus.value = 'success'
        appendLog(t('migration.backupRun.logDoneSuccess'))
        return true
      }
      progressBarStatus.value = 'exception'
      const detail =
        body.error != null && body.error !== ''
          ? String(body.error)
          : t('migration.backupRun.logDoneFail', { status: statusStr })
      appendLog(detail)
      throw new Error(detail)
    }
    await sleep(1500)
  }
  return false
}

function scheduleAutoLoadClasses() {
  clearTimeout(pickClassLoadTimer)
  pickClassLoadTimer = setTimeout(() => {
    pickClassLoadTimer = undefined
    if (scopeMode.value !== 'pick') return
    void loadLocalClasses({ quiet: true })
  }, 350)
}

watch(
  () => scopeMode.value,
  () => {
    if (scopeMode.value !== 'pick') {
      clearTimeout(pickClassLoadTimer)
      pickClassLoadTimer = undefined
      return
    }
    scheduleAutoLoadClasses()
  },
)

onBeforeUnmount(() => {
  clearTimeout(pickClassLoadTimer)
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

async function loadLocalClasses(opts?: { quiet?: boolean }) {
  loadingClasses.value = true
  try {
    const client = createWeaviateAxios()
    const classes = await fetchSchema(client)
    classOptions.value = classes.map((c) => c.class).sort()
    if (!opts?.quiet) {
      ElMessage.success(t('migration.backupRun.loadClassesOk', { n: classOptions.value.length }))
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('migration.backupRun.loadClassesFail'))
    classOptions.value = []
  } finally {
    loadingClasses.value = false
  }
}

async function onRunBackup() {
  const name = backupName.value.trim()
  if (!name || !BACKUP_NAME_PATTERN.test(name)) {
    ElMessage.warning(t('migration.backupRun.nameRequired'))
    return
  }
  if (scopeMode.value === 'pick' && pickedClasses.value.length === 0) {
    ElMessage.warning(t('migration.backupRun.errPickClasses'))
    return
  }

  progressShown.value = true
  logLines.value = []
  progressPct.value = 0
  progressBarStatus.value = undefined
  pollAbort = false
  running.value = true

  appendLog(t('migration.backupRun.logStarting'))

  try {
    const client = createWeaviateAxios()
    const include = scopeMode.value === 'pick' ? [...pickedClasses.value] : undefined
    await createBackupRequest(backend.value, name, client, { include })
    appendLog(t('migration.backupRun.logPostOk'))
    progressPct.value = 8

    const finishedOk = await pollBackupUntilDone(name, client)
    if (finishedOk) {
      ElMessage.success(t('migration.backupRun.createSuccess'))
    }
  } catch (e: unknown) {
    if (pollAbort) return
    const msg = e instanceof Error ? e.message : String(e)
    appendLog(`${t('migration.backupRun.createFailed')}: ${msg}`)
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

.backup-form :deep(.el-form-item__label) {
  color: var(--wc-text);
  font-weight: 600;
}

.backend-select,
.backup-name-input {
  width: 100%;
  max-width: 400px;
}

.class-select-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 572px;
}

.class-select {
  flex: 1;
  min-width: 0;
}

.refresh-classes-btn {
  flex-shrink: 0;
}

.scope-radio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.migration-actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.backup-progress-block {
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
