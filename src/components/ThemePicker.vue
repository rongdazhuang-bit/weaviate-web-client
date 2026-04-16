<template>
  <el-dropdown trigger="click" popper-class="wc-theme-dropdown" @command="onCommand">
    <span class="theme-trigger">
      <el-tooltip content="主题色调" placement="bottom">
        <el-button size="small" :icon="BrushFilled" circle aria-label="切换主题色调" />
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
import {
  BrushFilled,
  Monitor,
  Compass,
  MagicStick,
  Cherry,
  Sunset,
} from '@element-plus/icons-vue'
import { useThemeStore, type ThemeId } from '@/stores/theme'

const theme = useThemeStore()

const items: {
  id: ThemeId
  label: string
  icon: typeof Monitor
  dot: string
}[] = [
  { id: 'slate', label: '青蓝', icon: Monitor, dot: '#38bdf8' },
  { id: 'ocean', label: '海碧', icon: Compass, dot: '#22d3ee' },
  { id: 'violet', label: '紫幕', icon: MagicStick, dot: '#c4b5fd' },
  { id: 'forest', label: '森绿', icon: Cherry, dot: '#4ade80' },
  { id: 'sunset', label: '暮金', icon: Sunset, dot: '#fbbf24' },
]

function onCommand(id: string) {
  if (['slate', 'ocean', 'violet', 'forest', 'sunset'].includes(id)) {
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
