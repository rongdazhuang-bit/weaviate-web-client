<template>
  <div class="page page-migration-guide">
    <h2 class="title">{{ t('migration.restoreGuide.title') }}</h2>
    <p class="muted lead">{{ t('migration.restoreGuide.lead') }}</p>

    <el-card shadow="never" class="guide-card">
      <el-timeline>
        <el-timeline-item
          v-for="(step, idx) in restoreSteps"
          :key="idx"
          placement="top"
          hollow
        >
          <h3 class="step-title">{{ step.title }}</h3>
          <p class="muted step-desc">{{ step.desc }}</p>
        </el-timeline-item>
      </el-timeline>
      <p class="muted hint hint--last">{{ t('migration.restoreGuide.hint') }}</p>
      <div class="migration-actions">
        <el-button @click="goStartRestore">{{ t('migration.restoreGuide.btnStartRestore') }}</el-button>
        <el-button @click="goBackToDataMigration">{{ t('migration.backLabel') }}</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()

function goBackToDataMigration() {
  void router.push({ name: 'data-migration' })
}

function goStartRestore() {
  void router.push({ name: 'migration-restore-run' })
}

const restoreSteps = computed(() => [
  { title: t('migration.restoreGuide.s1Title'), desc: t('migration.restoreGuide.s1Desc') },
  { title: t('migration.restoreGuide.s2Title'), desc: t('migration.restoreGuide.s2Desc') },
  { title: t('migration.restoreGuide.s3Title'), desc: t('migration.restoreGuide.s3Desc') },
  { title: t('migration.restoreGuide.s4Title'), desc: t('migration.restoreGuide.s4Desc') },
])
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

.step-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--wc-text);
}

.step-desc {
  margin: 0;
  line-height: 1.55;
}

.guide-card :deep(.el-timeline-item__tail) {
  border-left-color: var(--wc-border);
}

.guide-card :deep(.el-timeline-item__node--normal) {
  background: var(--wc-accent);
}

.hint {
  margin: 20px 0 12px;
  line-height: 1.55;
}

.hint--last {
  margin-bottom: 0;
}

.migration-actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
</style>
