<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">📷</div>
        <h1 class="login-title">LskyPro API</h1>
        <p class="login-subtitle">随机图片 API 管理系统</p>
      </div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">兰空图床地址</label>
          <input 
            type="url" 
            class="form-input" 
            v-model="form.lskyHost"
            placeholder="https://your-lsky-domain.com"
            required
          >
          <div class="form-hint">
            请输入您的兰空图床完整地址
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">API Token</label>
          <input 
            type="password" 
            class="form-input" 
            v-model="form.token"
            placeholder="请输入您的 API Token"
            required
          >
          <div class="form-hint">
            可在兰空图床后台的 API 设置中获取
          </div>
        </div>
        <button type="submit" class="btn btn-primary" :class="{ 'btn-loading': loading }" :disabled="loading">
          {{ loading ? '登录中' : '登录系统' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, inject } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const showToast = inject('showToast')
const api = inject('api')

const form = reactive({
  lskyHost: '',
  token: ''
})
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  try {
    const result = await api.login(form.lskyHost, form.token)
    if (result.success) {
      showToast('登录成功！', 'success')
      router.push('/dashboard')
    }
  } catch (error) {
    showToast(error.response?.data?.error || '登录失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>