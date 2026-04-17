import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN'
import en from '@/locales/en'

const LOCALE_KEY = 'wc_locale'

export type AppLocale = 'zh-CN' | 'en'

export const supportedLocales: AppLocale[] = ['zh-CN', 'en']

function readStoredLocale(): AppLocale {
  try {
    const v = localStorage.getItem(LOCALE_KEY)
    if (v === 'en' || v === 'zh-CN') return v
  } catch {
    /* ignore */
  }
  return 'zh-CN'
}

export function persistLocale(locale: AppLocale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
})
