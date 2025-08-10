<template>
  <div id="app">
    <!-- 滚动指示器 -->
    <div class="scroll-indicator">
      <div class="scroll-progress" :style="{ width: scrollProgress + '%' }"></div>
    </div>

    <!-- 加载动画 -->
    <div class="loading" :class="{ hidden: !loading }">
      <div class="spinner"></div>
    </div>

    <!-- Toast容器 -->
    <div class="toast-container">
      <transition-group name="fade">
        <div v-for="toast in toasts" :key="toast.id" 
             :class="['toast', toast.type]">
          <span>{{ toast.message }}</span>
        </div>
      </transition-group>
    </div>

    <!-- 路由视图 -->
    <router-view></router-view>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api'

const scrollProgress = ref(0)
const loading = ref(false)
const toasts = ref([])
const router = useRouter()

// Toast通知系统
const showToast = (message, type = 'info') => {
  const id = Date.now()
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) toasts.value.splice(index, 1)
  }, 3000)
}

// 提供全局方法
provide('showToast', showToast)
provide('setLoading', (val) => loading.value = val)
provide('api', api)

// 滚动进度条
const handleScroll = () => {
  const scrollTop = window.pageYOffset
  const docHeight = document.body.scrollHeight - window.innerHeight
  scrollProgress.value = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
}

// 检查登录状态
const checkAuth = () => {
  const session = localStorage.getItem('sessionId')
  const user = localStorage.getItem('user')
  
  if (!session || !user) {
    if (router.currentRoute.value.path !== '/login') {
      router.push('/login')
    }
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
  checkAuth()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>