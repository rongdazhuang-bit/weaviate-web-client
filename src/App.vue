<template>
  <el-config-provider :locale="elementLocale">
    <div
      class="app-root"
      v-loading="globalLoading"
      :element-loading-text="t('common.loading')"
    >
      <div class="app-main">
        <router-view />
      </div>
      <AppFooter />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { useRequestLoadingStore } from '@/stores/requestLoading'
import AppFooter from '@/components/AppFooter.vue'

const { t, locale } = useI18n()
const { active: globalLoading } = storeToRefs(useRequestLoadingStore())

const elementLocale = computed(() => (locale.value === 'zh-CN' ? zhCn : en))

function syncHtmlLang() {
  try {
    document.documentElement.lang = locale.value === 'zh-CN' ? 'zh-CN' : 'en'
  } catch {
    /* ignore */
  }
}

function syncDocTitle() {
  try {
    document.title = t('app.docTitle')
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  syncHtmlLang()
  syncDocTitle()
})
watch(locale, () => {
  syncHtmlLang()
  syncDocTitle()
})
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}

.app-root {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.app-main > * {
  flex: 1;
  min-height: 0;
}
</style>
