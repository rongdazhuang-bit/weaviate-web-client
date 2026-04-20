<template>
  <footer class="app-footer" role="contentinfo">
    <span class="app-footer-line">
      <span class="app-footer-text">Copyright © {{ copyrightRange }}</span>
      <a
        class="app-footer-brand"
        :href="mailtoHref"
      >RongDa</a>
      <span class="app-footer-text">. All Rights Reserved.</span>
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** 版权展示锚点年（区间左侧固定为这一年） */
const COPYRIGHT_ANCHOR_YEAR = 2026

const CONTACT_EMAIL = 'rongdazhuang@gmail.com'

const mailtoHref = `mailto:${CONTACT_EMAIL}`

/**
 * 与锚点年（当前机器年份）相同时只显示 2026；
 * 当前年更晚则「2026 - 当前年」；更早则仍只显示 2026（避免 2026-2025）。
 */
const copyrightRange = computed(() => {
  const y = new Date().getFullYear()
  if (y === COPYRIGHT_ANCHOR_YEAR) return String(COPYRIGHT_ANCHOR_YEAR)
  if (y > COPYRIGHT_ANCHOR_YEAR) return `${COPYRIGHT_ANCHOR_YEAR} - ${y}`
  return String(COPYRIGHT_ANCHOR_YEAR)
})
</script>

<style scoped>
.app-footer {
  flex-shrink: 0;
  padding: 5px 16px 6px;
  text-align: center;
  font-size: 11px;
  line-height: 1.25;
  color: var(--wc-muted);
  border-top: 1px solid var(--wc-border);
  background: var(--wc-bg);
}

.app-footer-line {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0;
}

.app-footer-text {
  color: var(--wc-muted);
}

.app-footer-brand {
  margin-left: 0.35em;
  color: var(--wc-accent);
  font-weight: 600;
  text-decoration: none;
}

.app-footer-brand:hover {
  text-decoration: underline;
  color: color-mix(in srgb, var(--wc-accent) 88%, #fff);
}
</style>
