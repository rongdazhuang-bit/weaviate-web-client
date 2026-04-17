<template>
  <el-dropdown trigger="click" popper-class="wc-theme-dropdown" @command="onCommand">
    <span class="theme-trigger">
      <el-tooltip :content="t('theme.picker')" placement="bottom">
        <el-button size="small" :icon="BrushFilled" circle :aria-label="t('theme.pickerAria')" />
      </el-tooltip>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in items"
          :key="item.id"
          :command="item.id"
          :class="{ 'is-active': theme.themeId === item.id }"
        >
          <span class="theme-item">
            <el-icon class="theme-icon" :style="{ color: item.dot }">
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BrushFilled,
  Monitor,
  Compass,
  MagicStick,
  Cherry,
  Sunset,
  Sunny,
} from '@element-plus/icons-vue'
import { useThemeStore, type ThemeId } from '@/stores/theme'

const { t } = useI18n()
const theme = useThemeStore()

const items = computed(() => {
  const defs: { id: ThemeId; icon: typeof Monitor; dot: string }[] = [
    { id: 'slate', icon: Monitor, dot: '#38bdf8' },
    { id: 'ocean', icon: Compass, dot: '#22d3ee' },
    { id: 'violet', icon: MagicStick, dot: '#c4b5fd' },
    { id: 'forest', icon: Cherry, dot: '#4ade80' },
    { id: 'sunset', icon: Sunset, dot: '#fbbf24' },
    { id: 'sunshine', icon: Sunny, dot: '#ca8a04' },
  ]
  return defs.map((d) => ({
    ...d,
    label: t(`theme.${d.id}`),
  }))
})

function onCommand(id: string) {
  if (['slate', 'ocean', 'violet', 'forest', 'sunset', 'sunshine'].includes(id)) {
    theme.setTheme(id as ThemeId)
  }
}
</script>

<style scoped>
.theme-trigger {
  display: inline-flex;
  vertical-align: middle;
  margin-right: 4px;
}

.theme-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.theme-icon {
  font-size: 16px;
}
</style>

<style>
/* 下拉当前项高亮（teleport 到 body，需全局类名） */
.wc-theme-dropdown .el-dropdown-menu__item.is-active {
  color: var(--wc-accent);
  font-weight: 600;
  background: var(--wc-menu-active-bg);
}
</style>
