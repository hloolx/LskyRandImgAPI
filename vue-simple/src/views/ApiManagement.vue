<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="#" class="sidebar-logo">
          <span class="sidebar-logo-icon">L</span>
          <span>LskyPro</span>
        </a>
      </div>
      
      <nav class="sidebar-nav">
        <router-link to="/dashboard" class="nav-item">
          <span class="nav-icon">📁</span>
          <span class="nav-text">相册管理</span>
        </router-link>
        <router-link to="/apis" class="nav-item active">
          <span class="nav-icon">🔗</span>
          <span class="nav-text">API管理</span>
        </router-link>
      </nav>
      
      <div class="sidebar-user">
        <div class="user-avatar">
          {{ userInitial }}
        </div>
        <div class="user-info">
          <div class="user-name">{{ user?.nickname }}</div>
          <div class="user-role">管理员</div>
        </div>
        <button @click="logout" class="btn btn-small btn-secondary">
          退出
        </button>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main-content">
      <div class="content-header">
        <h1 class="page-title">API 管理</h1>
        <p class="page-subtitle">管理您创建的随机图片 API</p>
      </div>

      <!-- API列表 -->
      <div v-if="apisLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>正在加载API列表...</p>
      </div>
      <div v-else-if="apis.length === 0" class="empty-state">
        <div class="empty-icon">🔗</div>
        <div class="empty-title">暂无 API</div>
        <div class="empty-description">请先从相册生成随机 API</div>
      </div>
      <div v-else class="api-container">
        <div class="api-item" v-for="(api, index) in apis" :key="api.id"
             :style="{ animationDelay: index * 0.1 + 's' }">
          <div class="api-header">
            <h3 class="api-name">{{ api.api_name }}</h3>
            <span class="api-status" :class="{ active: api.enabled, inactive: !api.enabled }">
              {{ api.enabled ? '已启用' : '已禁用' }}
            </span>
          </div>
          <div class="api-url">
            <span>{{ api.api_url }}</span>
            <button class="btn-copy" @click="copyUrl(api)" :class="{ copied: api.copied }">
              {{ api.copied ? '✓ 已复制' : '复制' }}
            </button>
          </div>
          
          <!-- 调用方式说明 -->
          <div class="api-modes">
            <div class="api-mode-title">
              📖 调用方式：
              <span class="mode-help" @mouseenter="showModeHelp = api.id" @mouseleave="showModeHelp = null">
                ❓
                <div class="mode-help-tooltip" v-show="showModeHelp === api.id">
                  <div class="mode-help-item">
                    <strong>🎲 模式1 - 纯随机（默认）</strong>
                    <p>完全随机选择图片，每次都是独立的随机</p>
                  </div>
                  <div class="mode-help-item">
                    <strong>🔄 模式2 - 顺序随机</strong>
                    <p>不重复随机，直到所有图片都显示过一次才重新开始</p>
                  </div>
                  <div class="mode-help-item">
                    <strong>🎰 模式3 - 洗牌随机</strong>
                    <p>生成固定的随机序列，每轮按相同顺序显示</p>
                  </div>
                </div>
              </span>
            </div>
            <div class="api-mode-list">
              <div class="api-mode-item">
                <span class="mode-label">🎲 纯随机：</span>
                <code class="mode-code">{{ api.api_url }}?1</code>
                <button class="btn-copy-small" @click="copyModeUrl(api.api_url + '?1', '纯随机')" title="复制">📋</button>
              </div>
              <div class="api-mode-item">
                <span class="mode-label">🔄 顺序随机：</span>
                <code class="mode-code">{{ api.api_url }}?2</code>
                <button class="btn-copy-small" @click="copyModeUrl(api.api_url + '?2', '顺序随机')" title="复制">📋</button>
              </div>
              <div class="api-mode-item">
                <span class="mode-label">🎰 洗牌随机：</span>
                <code class="mode-code">{{ api.api_url }}?3</code>
                <button class="btn-copy-small" @click="copyModeUrl(api.api_url + '?3', '洗牌随机')" title="复制">📋</button>
              </div>
            </div>
          </div>
          <div class="api-meta">
            <div class="api-meta-item">
              <span>🖼️</span> {{ api.image_count }} 张图片
            </div>
            <div class="api-meta-item">
              <span>📊</span> 使用 {{ api.use_count || 0 }} 次
            </div>
            <div class="api-meta-item">
              <span>📅</span> {{ formatDate(api.created_at) }}
            </div>
            <div class="api-meta-item" v-if="api.last_used_at">
              <span>⏰</span> 最后使用 {{ formatDate(api.last_used_at) }}
            </div>
            <div class="api-meta-item">
              <span>🔑</span> {{ api.api_key }}
            </div>
          </div>
          <div class="album-actions">
            <button class="btn btn-secondary btn-small" @click="toggleApi(api)">
              <span v-if="api.enabled">🔒 禁用</span>
              <span v-else>🔓 启用</span>
            </button>
            <button class="btn btn-secondary btn-small" @click="testApi(api.api_url)">
              <span>🧪 测试</span>
            </button>
            <button class="btn btn-secondary btn-small" @click="showStats(api)">
              <span>📈 统计</span>
            </button>
            <button class="btn btn-secondary btn-small" @click="showQRCode(api)">
              <span>📱 二维码</span>
            </button>
            <button class="btn btn-secondary btn-small" @click="deleteApi(api)">
              <span>🗑️ 删除</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 统计模态框 -->
      <div class="modal" :class="{ active: showStatsModal }">
        <div class="modal-content" style="max-width: 600px;">
          <div class="modal-header">
            <h2 class="modal-title">API 使用统计</h2>
            <button class="modal-close" @click="showStatsModal = false">×</button>
          </div>
          <div class="modal-body">
            <div v-if="statsLoading" style="text-align: center; padding: 40px;">
              <div class="loading-spinner"></div>
              <p style="margin-top: 20px;">加载统计数据...</p>
            </div>
            <div v-else-if="currentStats">
              <div class="stats-summary">
                <div class="stat-card">
                  <div class="stat-value">{{ currentStats.total_uses || 0 }}</div>
                  <div class="stat-label">总使用次数</div>
                </div>
                <div class="stat-card" v-if="currentStats.last_used_at">
                  <div class="stat-value">{{ formatDate(currentStats.last_used_at) }}</div>
                  <div class="stat-label">最后使用时间</div>
                </div>
              </div>
              
              <div class="stats-section" v-if="currentStats.daily_stats && currentStats.daily_stats.length > 0">
                <h3>最近7天使用趋势</h3>
                <div class="daily-stats">
                  <div v-for="day in currentStats.daily_stats" :key="day.date" class="day-stat">
                    <span class="day-date">{{ formatStatDate(day.date) }}</span>
                    <span class="day-count">{{ day.count }} 次</span>
                  </div>
                </div>
              </div>
              
              <div class="stats-section" v-if="currentStats.recent_logs && currentStats.recent_logs.length > 0">
                <h3>最近访问记录</h3>
                <div class="access-logs">
                  <div v-for="log in currentStats.recent_logs" :key="log.id" class="log-item">
                    <div class="log-time">{{ formatDate(log.accessed_at) }}</div>
                    <div class="log-details">
                      <span v-if="log.ip_address">IP: {{ log.ip_address }}</span>
                      <span v-if="log.referer">来源: {{ log.referer || '直接访问' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 二维码模态框 -->
      <div class="modal" :class="{ active: showQRModal }">
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2 class="modal-title">API 二维码</h2>
            <button class="modal-close" @click="showQRModal = false">×</button>
          </div>
          <div class="modal-body" style="text-align: center;">
            <div id="qrcode" style="display: inline-block; padding: 20px; background: white; border-radius: 10px;"></div>
            <p style="margin-top: 20px; color: rgba(255,255,255,0.8);">
              扫描二维码访问 API
            </p>
            <p style="word-break: break-all; font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 10px;">
              {{ currentApiUrl }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 浮动操作按钮 -->
    <button class="fab" @click="refreshApis" title="刷新API列表">
      🔄
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, inject, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const showToast = inject('showToast')
const api = inject('api')

const apis = ref([])
const showQRModal = ref(false)
const currentApiUrl = ref('')
const showStatsModal = ref(false)
const currentStats = ref(null)
const statsLoading = ref(false)
const apisLoading = ref(false)  // 添加API列表加载状态
const showModeHelp = ref(null)  // 模式帮助提示

const user = computed(() => {
  const userStr = localStorage.getItem('user')
  return userStr ? JSON.parse(userStr) : null
})

const userInitial = computed(() => user.value?.nickname?.charAt(0).toUpperCase() || 'U')

const loadApis = async () => {
  apisLoading.value = true
  try {
    const result = await api.getApis()
    if (result.success) {
      apis.value = result.apis.map(item => ({ ...item, copied: false }))
      console.log(`加载了 ${apis.value.length} 个API（缓存数据）`)
    } else {
      console.error('加载API失败:', result)
      showToast('加载API失败', 'error')
    }
  } catch (error) {
    console.error('加载API请求失败:', error)
    showToast('加载API失败: ' + (error.message || '网络错误'), 'error')
  } finally {
    apisLoading.value = false
  }
}

const copyUrl = async (apiItem) => {
  try {
    await navigator.clipboard.writeText(apiItem.api_url)
    apiItem.copied = true
    showToast('链接已复制到剪贴板', 'success')
    
    // 3秒后重置复制状态
    setTimeout(() => {
      apiItem.copied = false
    }, 3000)
  } catch (error) {
    showToast('复制失败，请手动复制', 'error')
  }
}

const copyModeUrl = async (url, modeName) => {
  try {
    await navigator.clipboard.writeText(url)
    showToast(`${modeName}模式链接已复制`, 'success')
  } catch (error) {
    showToast('复制失败，请手动复制', 'error')
  }
}

const toggleApi = async (apiItem) => {
  try {
    await api.toggleApi(apiItem.id, !apiItem.enabled)
    apiItem.enabled = !apiItem.enabled
    showToast(`API已${apiItem.enabled ? '启用' : '禁用'}`, 'success')
  } catch (error) {
    showToast('操作失败', 'error')
  }
}

const testApi = (url) => {
  window.open(url, '_blank')
}

const showQRCode = async (apiItem) => {
  currentApiUrl.value = apiItem.api_url
  showQRModal.value = true
  
  // 等待模态框渲染完成
  await nextTick()
  
  // 动态加载QRCode库
  if (!window.QRCode) {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
    script.onload = () => {
      generateQRCode()
    }
    document.head.appendChild(script)
  } else {
    generateQRCode()
  }
}

const showStats = async (apiItem) => {
  showStatsModal.value = true
  statsLoading.value = true
  currentStats.value = null
  
  try {
    const response = await api.getApiStats(apiItem.id)
    if (response.success) {
      currentStats.value = response.stats
    } else {
      showToast('获取统计数据失败', 'error')
    }
  } catch (error) {
    showToast('获取统计数据失败', 'error')
  } finally {
    statsLoading.value = false
  }
}

const formatStatDate = (dateString) => {
  const date = new Date(dateString)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const generateQRCode = () => {
  const qrcodeDiv = document.getElementById('qrcode')
  qrcodeDiv.innerHTML = '' // 清除之前的二维码
  
  new window.QRCode(qrcodeDiv, {
    text: currentApiUrl.value,
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.H
  })
}

const deleteApi = async (apiItem) => {
  const confirmText = `确定要删除 "${apiItem.api_name}" 吗？\n\n⚠️ 此操作不可恢复！`
  if (!confirm(confirmText)) return
  
  try {
    await api.deleteApi(apiItem.id)
    showToast('删除成功', 'success')
    await loadApis()
  } catch (error) {
    showToast('删除失败', 'error')
  }
}

const formatDate = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  
  // 时间差转换
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) {
    return `${days}天前`
  } else if (hours > 0) {
    return `${hours}小时前`
  } else if (minutes > 0) {
    return `${minutes}分钟前`
  } else {
    return '刚刚'
  }
}

const refreshApis = async () => {
  console.log('开始刷新API列表...')
  showToast('正在刷新数据...', 'info')
  try {
    // 调用专门的刷新接口
    const refreshResult = await api.refreshApis()
    if (refreshResult.success) {
      showToast(refreshResult.message || '刷新成功', 'success')
      // 重新加载列表
      await loadApis()
    } else {
      showToast('刷新失败', 'error')
    }
  } catch (error) {
    console.error('刷新失败:', error)
    showToast('刷新失败，请重试', 'error')
  }
}

const logout = async () => {
  try {
    await api.logout()
    showToast('已退出登录', 'info')
    router.push('/login')
  } catch (error) {
    localStorage.removeItem('sessionId')
    localStorage.removeItem('user')
    router.push('/login')
  }
}

onMounted(() => {
  loadApis()  // 初始加载使用缓存，快速显示
})
</script>

<style scoped>
/* API特定样式 */
.api-container {
  max-width: 1200px;
}

.btn-copy.copied {
  background: var(--gradient-success) !important;
}

#qrcode {
  margin: 0 auto;
}

/* 统计模态框样式 */
.stats-summary {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 123, 255, 0.1);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
}

.stat-value {
  font-size: 2em;
  font-weight: bold;
  color: #007bff;
  margin-bottom: 10px;
}

.stat-label {
  color: #6c757d;
  font-size: 0.9em;
}

.stats-section {
  margin-top: 30px;
}

.stats-section h3 {
  margin-bottom: 15px;
  color: #333;
  font-weight: 600;
}

.daily-stats {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 123, 255, 0.1);
  border-radius: 10px;
  padding: 15px;
}

.day-stat {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  border-bottom: 1px solid rgba(0, 123, 255, 0.1);
}

.day-stat:last-child {
  border-bottom: none;
}

.day-date {
  color: #6c757d;
}

.day-count {
  color: #007bff;
  font-weight: bold;
}

.access-logs {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 123, 255, 0.1);
  border-radius: 10px;
  padding: 15px;
  max-height: 300px;
  overflow-y: auto;
}

.log-item {
  padding: 10px;
  border-bottom: 1px solid rgba(0, 123, 255, 0.1);
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  color: #007bff;
  font-size: 0.9em;
  margin-bottom: 5px;
  font-weight: 500;
}

.log-details {
  color: #6c757d;
  font-size: 0.85em;
}

.log-details span {
  margin-right: 15px;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(0, 123, 255, 0.1);
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 加载状态样式 */
.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.8);
}

.loading-state p {
  margin-top: 20px;
  font-size: 1.1em;
}

/* 模式帮助样式 */
.mode-help {
  display: inline-block;
  position: relative;
  cursor: help;
  margin-left: 8px;
  font-size: 0.9em;
  color: var(--color-primary);
}

.mode-help:hover {
  transform: scale(1.1);
}

.mode-help-tooltip {
  position: absolute;
  left: 100%;
  top: -10px;
  margin-left: 10px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(0, 123, 255, 0.2);
  border-radius: 12px;
  padding: 15px;
  width: 320px;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 123, 255, 0.15);
  backdrop-filter: blur(10px);
}

.mode-help-item {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 123, 255, 0.1);
}

.mode-help-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.mode-help-item strong {
  display: block;
  color: #007bff;
  margin-bottom: 5px;
  font-size: 0.95em;
  font-weight: 600;
}

.mode-help-item p {
  margin: 0;
  color: #6c757d;
  font-size: 0.85em;
  line-height: 1.4;
}
</style>