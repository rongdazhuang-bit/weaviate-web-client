<template>
  <div class="page page-migration-guide">
    <h2 class="title">{{ t('migration.apiGuide.title') }}</h2>
    <p class="muted lead">{{ t('migration.apiGuide.lead') }}</p>

    <el-card shadow="never" class="guide-card">
      <el-timeline>
        <el-timeline-item
          v-for="(step, idx) in apiSteps"
          :key="idx"
          placement="top"
          hollow
        >
          <h3 class="step-title">{{ step.title }}</h3>
          <p class="muted step-desc">{{ step.desc }}</p>
        </el-timeline-item>
      </el-timeline>
      <div class="migration-actions">
        <el-button @click="goRun">{{ t('apiMigration.openConfig') }}</el-button>
        <el-button @click="goBackToDataMigration">{{ t('migration.backLabel') }}</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
const router = useRouter()
const { t } = useI18n()

function goRun() {
  void router.push({ name: 'migration-api-run' })
}

function goBackToDataMigration() {
  void router.push({ name: 'data-migration' })
}

const apiSteps = computed(() => [
  { title: t('migration.apiGuide.s1Title'), desc: t('migration.apiGuide.s1Desc') },
  { title: t('migration.apiGuide.s2Title'), desc: t('migration.apiGuide.s2Desc') },
  { title: t('migration.apiGuide.s3Title'), desc: t('migration.apiGuide.s3Desc') },
  { title: t('migration.apiGuide.s4Title'), desc: t('migration.apiGuide.s4Desc') },
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

.migration-actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
</style>
