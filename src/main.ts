import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import '@/assets/styles/global.css'
import '@/assets/styles/themes.css'
import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
useThemeStore().init()
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
