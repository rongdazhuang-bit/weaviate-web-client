import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import '@/assets/styles/global.css'
import '@/assets/styles/themes.css'
import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'
import { i18n } from './i18n'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
useThemeStore().init()
app.use(i18n)
app.use(router)
app.use(ElementPlus)
app.mount('#app')
