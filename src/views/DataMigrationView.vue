<template>
  <div class="page page-migration">
    <h2 class="title">{{ t('migration.title') }}</h2>
    <p class="muted intro">{{ t('migration.intro') }}</p>

    <el-card shadow="never" class="migration-card mt">
      <template #header>{{ t('migration.backupSection') }}</template>
      <p class="muted">{{ t('migration.backupBody') }}</p>
      <p class="muted">{{ t('migration.backupBody2') }}</p>
      <div class="link-row">
        <div class="link-row-left">
          <el-button size="small" @click="goBackup">{{ t('migration.btnBackup') }}</el-button>
          <el-button size="small" @click="goRestore">{{ t('migration.btnRestore') }}</el-button>
        </div>
        <el-link
          type="primary"
          :href="t('migration.docsBackupUrl')"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('migration.docsBackup') }}
        </el-link>
      </div>
    </el-card>

    <el-card shadow="never" class="migration-card mt">
      <template #header>{{ t('migration.clientSection') }}</template>
      <p class="muted">{{ t('migration.clientBody') }}</p>
      <div class="link-row">
        <div class="link-row-left">
          <el-button size="small" @click="goApiMigration">{{ t('migration.btnApiMigration') }}</el-button>
        </div>
        <el-link
          type="primary"
          :href="t('migration.docsClientUrl')"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('migration.docsClient') }}
        </el-link>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()

function goBackup() {
  router.push({ name: 'migration-backup' })
}

function goRestore() {
  router.push({ name: 'migration-restore' })
}

function goApiMigration() {
  router.push({ name: 'migration-api' })
}
</script>

<style scoped>
.page-migration {
  max-width: 880px;
}

.mt {
  margin-top: 16px;
}

.intro {
  margin: 0;
  line-height: 1.6;
}

.migration-card {
  border: 1px solid var(--wc-border);
  background: var(--wc-surface-elevated);
}

.migration-card :deep(.el-card__header) {
  font-weight: 600;
  color: var(--wc-text);
}

.migration-card :deep(.el-card__body) {
  padding: 14px 16px 16px;
}

.migration-card p {
  margin: 0 0 10px;
  line-height: 1.6;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.link-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
