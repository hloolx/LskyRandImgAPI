import { createRouter, createWebHashHistory } from 'vue-router'
import Login from './views/Login.vue'
import Dashboard from './views/Dashboard.vue'
import ApiManagement from './views/ApiManagement.vue'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true }
  },
  {
    path: '/apis',
    name: 'ApiManagement',
    component: ApiManagement,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const sessionId = localStorage.getItem('sessionId')
  
  if (to.meta.requiresAuth && !sessionId) {
    next('/login')
  } else if (to.path === '/login' && sessionId) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router