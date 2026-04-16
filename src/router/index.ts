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
        { path: '', redirect: { name: 'cluster' } },
        {
          path: 'cluster',
          name: 'cluster',
          component: () => import('@/views/ClusterView.vue'),
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
    return { name: 'cluster' }
  }
  return true
})

export default router
