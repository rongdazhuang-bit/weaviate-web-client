import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeId = 'slate' | 'ocean' | 'violet' | 'forest' | 'sunset'

const STORAGE_KEY = 'wc_theme'

export const useThemeStore = defineStore('theme', () => {
  const themeId = ref<ThemeId>('slate')

  function applyDom(id: ThemeId) {
    document.documentElement.setAttribute('data-theme', id)
  }

  function init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) as ThemeId | null
      const id = raw && isThemeId(raw) ? raw : 'slate'
      themeId.value = id
      applyDom(id)
    } catch {
      applyDom('slate')
    }
  }

  function setTheme(id: ThemeId) {
    themeId.value = id
    localStorage.setItem(STORAGE_KEY, id)
    applyDom(id)
  }

  return {
    themeId,
    init,
    setTheme,
  }
})

function isThemeId(s: string): s is ThemeId {
  return ['slate', 'ocean', 'violet', 'forest', 'sunset'].includes(s)
}
