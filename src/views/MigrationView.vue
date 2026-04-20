<template>
  <div class="page api-migration-page">
    <div class="api-migration-head">
      <MigrationBackButton />
      <h2 class="title">{{ t('apiMigration.title') }}</h2>
    </div>
    <p class="muted lead">{{ t('apiMigration.lead') }}</p>

    <el-card shadow="never" class="migration-form-card">
      <el-row :gutter="20">
        <el-col :xs="24" :md="12">
          <div class="panel-title">{{ t('apiMigration.sourcePanel') }}</div>
          <el-form label-position="top" size="small" class="panel-form">
            <el-form-item :label="t('apiMigration.sourceUrl')">
              <el-input v-model="sourceUrl" :placeholder="t('apiMigration.urlPlaceholder')" clearable />
            </el-form-item>
            <el-form-item :label="t('apiMigration.apiKey')">
              <el-input
                v-model="sourceKey"
                type="password"
                show-password
                clearable
                :placeholder="t('apiMigration.apiKeyPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="t('apiMigration.classScope')">
              <el-radio-group v-model="scopeMode" class="scope-radio">
                <el-radio value="all">{{ t('apiMigration.allClasses') }}</el-radio>
                <el-radio value="pick">{{ t('apiMigration.pickClasses') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="scopeMode === 'pick'" :label="t('apiMigration.classesLabel')">
              <el-select
                v-model="pickedClasses"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                :placeholder="t('apiMigration.classesPlaceholder')"
                style="width: 100%"
              >
                <el-option v-for="c in sourceClassOptions" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="scopeMode === 'pick'">
              <el-button :loading="loadingClasses" @click="loadSourceClasses">
                {{ t('apiMigration.reloadClasses') }}
              </el-button>
            </el-form-item>
          </el-form>
        </el-col>

        <el-col :xs="24" :md="12">
          <div class="panel-title">{{ t('apiMigration.targetPanel') }}</div>
          <el-form label-position="top" size="small" class="panel-form">
            <el-form-item :label="t('apiMigration.targetUrl')">
              <el-input v-model="targetUrl" :placeholder="t('apiMigration.urlPlaceholder')" clearable />
            </el-form-item>
            <el-form-item :label="t('apiMigration.apiKey')">
              <el-input
                v-model="targetKey"
                type="password"
                show-password
                clearable
                :placeholder="t('apiMigration.apiKeyPlaceholder')"
              />
            </el-form-item>
          </el-form>
        </el-col>
      </el-row>

      <div class="mode-block">
        <div class="panel-title">{{ t('apiMigration.modeLabel') }}</div>
        <el-radio-group v-model="migrationMode" class="mode-radio">
          <el-radio value="incremental">{{ t('apiMigration.modeIncremental') }}</el-radio>
          <el-radio value="full">{{ t('apiMigration.modeFull') }}</el-radio>
        </el-radio-group>
      </div>

      <div class="actions">
        <el-button :loading="validating || migrating" :disabled="migrating" @click="onStartClick">
          {{ t('apiMigration.startBtn') }}
        </el-button>
      </div>
    </el-card>

    <el-dialog
      v-model="progressVisible"
      :title="t('apiMigration.progressTitle')"
      width="min(560px, 92vw)"
      append-to-body
      :close-on-click-modal="false"
      :show-close="!migrating"
      class="api-migration-progress-dialog"
      :before-close="onProgressBeforeClose"
      @closed="onProgressClosed"
    >
      <div class="progress-body">
        <el-progress :percentage="progressPct" :status="progressPct >= 100 ? 'success' : undefined" />
        <div class="log-toolbar">
          <span class="muted">{{ t('apiMigration.logLabel') }}</span>
        </div>
        <el-scrollbar max-height="280px" class="log-scroll">
          <pre class="log-pre">{{ logText }}</pre>
        </el-scrollbar>
      </div>
      <template #footer>
        <el-button v-if="!migrating" @click="progressVisible = false">
          {{ t('apiMigration.close') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import MigrationBackButton from '@/components/MigrationBackButton.vue'
import { areSameWeaviateEndpoints, normalizeConnectionUrl } from '@/utils/connectionUrl'
import { fetchRemoteSchema, createWeaviateClientForUrl } from '@/api/weaviateRemote'
import {
  API_MIGRATION_NOT_READY_DETAIL,
  ApiMigrationValidationError,
  runApiMigration,
  validateApiMigrationConnections,
  type ApiMigrationConfig,
} from '@/api/migration'

const { t } = useI18n()

const sourceUrl = ref('')
const sourceKey = ref('')
const targetUrl = ref('')
const targetKey = ref('')
const scopeMode = ref<'all' | 'pick'>('all')
const pickedClasses = ref<string[]>([])
const sourceClassOptions = ref<string[]>([])
const loadingClasses = ref(false)
const migrationMode = ref<'incremental' | 'full'>('incremental')

/** 指定集合模式下：切换为「指定集合」或修改源地址/密钥后自动拉取集合列表 */
let pickClassLoadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleAutoLoadSourceClasses() {
  clearTimeout(pickClassLoadTimer)
  pickClassLoadTimer = setTimeout(() => {
    pickClassLoadTimer = undefined
    if (scopeMode.value !== 'pick') return
    if (!normalizeConnectionUrl(sourceUrl.value)) return
    void loadSourceClasses()
  }, 350)
}

watch(
  () => [scopeMode.value, sourceUrl.value, sourceKey.value] as const,
  () => {
    if (scopeMode.value !== 'pick') {
      clearTimeout(pickClassLoadTimer)
      pickClassLoadTimer = undefined
      return
    }
    scheduleAutoLoadSourceClasses()
  },
)

onBeforeUnmount(() => {
  clearTimeout(pickClassLoadTimer)
})

const validating = ref(false)
const migrating = ref(false)
const progressVisible = ref(false)
const progressPct = ref(0)
const logLines = ref<string[]>([])
const logText = computed(() => logLines.value.join('\n'))

function appendLog(line: string) {
  const ts = new Date().toLocaleTimeString()
  logLines.value.push(`[${ts}] ${line}`)
}

function buildConfig(): ApiMigrationConfig | null {
  if (!normalizeConnectionUrl(sourceUrl.value)) {
    ElMessage.warning(t('apiMigration.errSourceUrl'))
    return null
  }
  if (!normalizeConnectionUrl(targetUrl.value)) {
    ElMessage.warning(t('apiMigration.errTargetUrl'))
    return null
  }
  if (scopeMode.value === 'pick' && pickedClasses.value.length === 0) {
    ElMessage.warning(t('apiMigration.errPickClasses'))
    return null
  }
  if (areSameWeaviateEndpoints(sourceUrl.value, targetUrl.value)) {
    ElMessage.warning(t('apiMigration.errSameInstance'))
    return null
  }
  return {
    sourceUrl: sourceUrl.value.trim(),
    sourceKey: sourceKey.value,
    targetUrl: targetUrl.value.trim(),
    targetKey: targetKey.value,
    allClasses: scopeMode.value === 'all',
    selectedClasses: scopeMode.value === 'pick' ? [...pickedClasses.value] : [],
    mode: migrationMode.value,
  }
}

async function loadSourceClasses() {
  if (!normalizeConnectionUrl(sourceUrl.value)) {
    ElMessage.warning(t('apiMigration.errSourceUrl'))
    return
  }
  loadingClasses.value = true
  try {
    const client = createWeaviateClientForUrl(sourceUrl.value.trim(), sourceKey.value)
    const classes = await fetchRemoteSchema(client)
    sourceClassOptions.value = classes.map((c) => c.class).sort()
    ElMessage.success(t('apiMigration.loadClassesOk', { n: sourceClassOptions.value.length }))
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('apiMigration.loadClassesFail'))
    sourceClassOptions.value = []
  } finally {
    loadingClasses.value = false
  }
}

async function onStartClick() {
  const cfg = buildConfig()
  if (!cfg) return

  validating.value = true
  try {
    await validateApiMigrationConnections(cfg)
    appendLog(t('apiMigration.logValidateOk'))
  } catch (e: unknown) {
    if (e instanceof ApiMigrationValidationError) {
      const detail =
        e.message === API_MIGRATION_NOT_READY_DETAIL
          ? t('apiMigration.errDetailNotReady')
          : e.message
      const key =
        e.side === 'source' ? 'apiMigration.errValidateSource' : 'apiMigration.errValidateTarget'
      ElMessage.error(t(key, { detail }))
      return
    }
    ElMessage.error(e instanceof Error ? e.message : t('apiMigration.errValidate'))
    return
  } finally {
    validating.value = false
  }

  try {
    await ElMessageBox.confirm(t('apiMigration.confirmMigrateMsg'), t('apiMigration.confirmMigrateTitle'), {
      confirmButtonText: t('apiMigration.confirmOk'),
      cancelButtonText: t('apiMigration.confirmCancel'),
      type: 'warning',
      customClass: 'wc-migration-confirm-msgbox',
    })
  } catch {
    return
  }

  logLines.value = []
  progressPct.value = 0
  progressVisible.value = true
  migrating.value = true
  appendLog(t('apiMigration.logStart'))

  try {
    await runApiMigration(
      cfg,
      (line) => appendLog(line),
      (pct) => {
        progressPct.value = pct
      },
    )
    ElMessage.success(t('apiMigration.migrateDone'))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    appendLog(t('apiMigration.logFail', { msg }))
    ElMessage.error(msg)
  } finally {
    migrating.value = false
  }
}

function onProgressBeforeClose(done: (cancel?: boolean) => void) {
  if (migrating.value) return
  done()
}

function onProgressClosed() {
  logLines.value = []
  progressPct.value = 0
}
</script>

<style scoped>
.api-migration-page {
  max-width: 960px;
}

.api-migration-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 8px;
}

.title {
  margin: 0;
  font-size: 18px;
}

.lead {
  margin: 0 0 18px;
  line-height: 1.6;
}

.migration-form-card {
  border: 1px solid var(--wc-border);
  background: var(--wc-surface-elevated);
}

.migration-form-card :deep(.el-card__body) {
  padding: 18px 20px 20px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--wc-text);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--wc-border);
}

.panel-form {
  margin-top: 4px;
}

.scope-radio,
.mode-radio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.mode-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--wc-border);
}

.actions {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
}

.progress-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.log-toolbar {
  margin-top: 4px;
}

.log-scroll {
  border: 1px solid var(--wc-border);
  border-radius: var(--wc-radius, 8px);
  background: color-mix(in srgb, var(--wc-surface) 90%, transparent);
}

.log-pre {
  margin: 0;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--wc-text);
  font-family: ui-monospace, 'Cascadia Code', monospace;
}
</style>

<style>
.api-migration-progress-dialog.el-dialog .el-dialog__body {
  padding-top: 8px;
}
</style>
