<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <img src="/favicon.ico" class="login-logo" alt="Logo" />
        <h1 class="login-title">LskyPro API</h1>
        <p class="login-subtitle">随机图片 API 管理系统</p>
      </div>
      <div class="security-notice">
        <div class="notice-icon">⚠️</div>
        <div class="notice-content">
          <strong>安全提示</strong>
          <p>本项目为开源项目，请自行部署使用。本站不保证数据的安全性。</p>
          <div class="github-links">
            <a href="https://github.com/hloolx/LskyRandImgAPI" target="_blank" rel="noopener noreferrer">GitHub</a>
            <span>|</span>
            <a href="https://cnb.cool/hloolx/LskyRandImgAPI" target="_blank" rel="noopener noreferrer">CNB镜像</a>
          </div>
        </div>
      </div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">兰空图床地址</label>
          <input 
            type="url" 
            class="form-input" 
            v-model="form.lskyHost"
            placeholder="https://your-lsky-domain.com"
            @blur="formatHost"
            required
          >
          <div class="form-hint">
            请输入您的兰空图床完整地址（末尾不需要加 /）
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

// 自动去除地址末尾的斜杠
const formatHost = () => {
  if (form.lskyHost.endsWith('/')) {
    form.lskyHost = form.lskyHost.slice(0, -1)
  }
}

const handleLogin = async () => {
  formatHost() // 登录前再次格式化
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