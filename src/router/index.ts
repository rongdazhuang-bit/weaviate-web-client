import { createRouter, createWebHistory } from 'vue-router'
import { useConnectionStore } from '@/stores/connection'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/app',
      component: () => import('@/views/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'overview' } },
        {
          path: 'overview',
          name: 'overview',
          component: () => import('@/views/OverviewView.vue'),
        },
        {
          path: 'cluster',
          redirect: { name: 'overview' },
        },
        {
          path: 'collections/:name',
          component: () => import('@/views/CollectionLayout.vue'),
          children: [
            {
              path: '',
              name: 'collection-overview',
              component: () => import('@/views/CollectionOverview.vue'),
            },
            {
              path: 'folders',
              name: 'collection-folders',
              component: () => import('@/views/CollectionFoldersView.vue'),
            },
            {
              path: 'objects',
              name: 'collection-objects',
              component: () => import('@/views/CollectionObjectsView.vue'),
            },
          ],
        },
        {
          path: 'search',
          name: 'search',
          component: () => import('@/views/SearchView.vue'),
        },
        {
          path: 'ops/migration/backup',
          name: 'migration-backup',
          component: () => import('@/views/MigrationBackupGuideView.vue'),
        },
        {
          path: 'ops/migration/backup/run',
          name: 'migration-backup-run',
          component: () => import('@/views/MigrationBackupRunView.vue'),
        },
        {
          path: 'ops/migration/restore/run',
          name: 'migration-restore-run',
          component: () => import('@/views/MigrationRestoreRunView.vue'),
        },
        {
          path: 'ops/migration/restore',
          name: 'migration-restore',
          component: () => import('@/views/MigrationRestoreGuideView.vue'),
        },
        {
          path: 'ops/migration/api/run',
          name: 'migration-api-run',
          component: () => import('@/views/MigrationView.vue'),
        },
        {
          path: 'ops/migration/api',
          name: 'migration-api',
          component: () => import('@/views/ApiMigrationGuideView.vue'),
        },
        {
          path: 'ops/migration',
          name: 'data-migration',
          component: () => import('@/views/DataMigrationView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const conn = useConnectionStore()
  if (to.meta.requiresAuth && !conn.connected) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && conn.connected) {
    return { name: 'overview' }
  }
  return true
})

export default router
