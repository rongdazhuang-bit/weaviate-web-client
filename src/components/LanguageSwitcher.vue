<template>
  <el-dropdown trigger="click" popper-class="wc-lang-dropdown" @command="onCommand">
    <span class="lang-trigger">
      <el-tooltip :content="t('nav.language')" placement="bottom">
        <el-button size="small" :icon="ChatDotRound" circle :aria-label="t('nav.languageAria')" />
      </el-tooltip>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="opt in options"
          :key="opt.locale"
          :command="opt.locale"
          :class="{ 'is-active': locale === opt.locale }"
        >
          <span class="lang-item">
            <span class="lang-flag" aria-hidden="true">{{ opt.flag }}</span>
            <span>{{ opt.label }}</span>
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChatDotRound } from '@element-plus/icons-vue'
import { persistLocale, type AppLocale } from '@/i18n'

const { t, locale } = useI18n()

const options = computed(() => [
  { locale: 'zh-CN' as AppLocale, label: '中文', flag: '中' },
  { locale: 'en' as AppLocale, label: 'English', flag: 'EN' },
])

function onCommand(cmd: string) {
  if (cmd !== 'zh-CN' && cmd !== 'en') return
  const next = cmd as AppLocale
  locale.value = next
  persistLocale(next)
  try {
    document.documentElement.lang = next === 'zh-CN' ? 'zh-CN' : 'en'
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.lang-trigger {
  display: inline-flex;
  vertical-align: middle;
  margin-right: 4px;
}

.lang-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.lang-flag {
  display: inline-flex;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--wc-accent);
  background: color-mix(in srgb, var(--wc-accent) 18%, var(--wc-surface));
  border: 1px solid color-mix(in srgb, var(--wc-accent) 45%, var(--wc-border));
}
</style>

<style>
.wc-lang-dropdown .el-dropdown-menu__item.is-active {
  color: var(--wc-accent);
  font-weight: 600;
  background: var(--wc-menu-active-bg);
}
</style>
