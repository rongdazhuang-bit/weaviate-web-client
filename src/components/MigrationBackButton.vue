<template>
  <button
    type="button"
    class="migration-back"
    :aria-label="t('migration.backChevronAria')"
    @click="onBack"
  >
    <span class="migration-back__inner">
      <span class="migration-back__chevrons" aria-hidden="true">
        <el-icon class="migration-back__icon"><ArrowLeft /></el-icon>
        <el-icon class="migration-back__icon migration-back__icon--layer"><ArrowLeft /></el-icon>
      </span>
      <span class="migration-back__label">{{ t('migration.backLabel') }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@element-plus/icons-vue'

const router = useRouter()
const { t } = useI18n()

function onBack() {
  router.push({ name: 'data-migration' })
}
</script>

<style scoped>
.migration-back {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}

.migration-back__inner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 18px 9px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--wc-border) 88%, var(--wc-accent) 6%);
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--wc-surface-elevated) 96%, transparent) 0%,
    color-mix(in srgb, var(--wc-surface) 92%, transparent) 100%
  );
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--wc-text) 10%, transparent),
    0 4px 14px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 color-mix(in srgb, var(--wc-accent) 8%, transparent);
  color: var(--wc-muted);
  transition:
    color 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.18s ease,
    background 0.22s ease;
}

.migration-back:hover .migration-back__inner {
  color: var(--wc-text);
  border-color: color-mix(in srgb, var(--wc-accent) 42%, var(--wc-border));
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--wc-surface-elevated) 100%, transparent) 0%,
    color-mix(in srgb, var(--wc-accent) 9%, var(--wc-surface)) 100%
  );
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--wc-text) 12%, transparent),
    0 6px 22px color-mix(in srgb, var(--wc-accent) 18%, rgba(0, 0, 0, 0.35)),
    inset 0 1px 0 color-mix(in srgb, var(--wc-accent) 14%, transparent);
  transform: translateX(-2px);
}

.migration-back:active .migration-back__inner {
  transform: translateX(-1px) scale(0.985);
  box-shadow:
    0 2px 10px rgba(0, 0, 0, 0.32),
    inset 0 1px 2px rgba(0, 0, 0, 0.12);
}

.migration-back:focus-visible {
  outline: none;
}

.migration-back:focus-visible .migration-back__inner {
  outline: 2px solid color-mix(in srgb, var(--wc-accent) 55%, transparent);
  outline-offset: 3px;
}

.migration-back__chevrons {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 20px;
  flex-shrink: 0;
}

.migration-back__icon {
  position: absolute;
  left: 0;
  font-size: 18px;
  color: color-mix(in srgb, var(--wc-accent) 92%, var(--wc-muted));
  transition: color 0.22s ease;
}

.migration-back__icon--layer {
  left: 9px;
  opacity: 0.45;
  font-size: 17px;
}

.migration-back:hover .migration-back__icon {
  color: var(--wc-accent);
}

.migration-back:hover .migration-back__icon--layer {
  opacity: 0.65;
}

.migration-back__label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
