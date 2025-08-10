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
        <router-link to="/dashboard" class="nav-item active">
          <span class="nav-icon">📁</span>
          <span class="nav-text">相册管理</span>
        </router-link>
        <router-link to="/apis" class="nav-item">
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
        <h1 class="page-title">相册管理</h1>
        <p class="page-subtitle">管理您的兰空图床相册，生成随机图片 API</p>
      </div>

      <!-- 统计卡片 -->
      <div class="stats-container">
        <div class="stat-card">
          <div class="stat-icon">📁</div>
          <div class="stat-value">{{ albums.length }}</div>
          <div class="stat-label">相册总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🖼️</div>
          <div class="stat-value">{{ totalImages }}</div>
          <div class="stat-label">图片总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🔗</div>
          <div class="stat-value">{{ apis.length }}</div>
          <div class="stat-label">API 总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⚡</div>
          <div class="stat-value">{{ activeApis }}</div>
          <div class="stat-label">活跃 API</div>
        </div>
      </div>

      <!-- 相册列表 -->
      <div v-if="albums.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-title">暂无相册</div>
        <div class="empty-description">请先在兰空图床中创建相册</div>
      </div>
      <div v-else class="albums-container">
        <div class="album-card" v-for="(album, index) in albums" :key="album.id" 
             :style="{ animationDelay: index * 0.1 + 's' }">
          <div class="album-cover">
            <span class="album-cover-icon">📁</span>
          </div>
          <div class="album-body">
            <h3 class="album-name">{{ album.name }}</h3>
            <div class="album-meta">
              <div class="album-meta-item">
                <span>🆔</span> {{ album.id }}
              </div>
              <div class="album-meta-item">
                <span>🖼️</span> {{ album.image_num }} 张
              </div>
            </div>
            <p class="album-description">{{ album.intro || '暂无描述' }}</p>
            <div class="album-actions">
              <button class="btn btn-secondary btn-small" @click="viewImages(album)">
                查看图片
              </button>
              <button class="btn btn-primary btn-small" @click="generateApi(album)">
                生成 API
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片预览模态框 -->
      <div class="modal" :class="{ active: showImageModal }">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">{{ currentAlbum?.name }} - 图片列表</h2>
            <button class="modal-close" @click="showImageModal = false">×</button>
          </div>
          <div class="modal-body">
            <div v-if="albumImages.length === 0" class="empty-state">
              <div class="empty-icon">🖼️</div>
              <div class="empty-title">暂无图片</div>
            </div>
            <div v-else class="images-masonry">
              <div class="image-item" v-for="(image, index) in albumImages" :key="image.key"
                   :style="{ animationDelay: index * 0.05 + 's' }"
                   @click="openImage(image)">
                <img :src="image.links?.thumbnail_url || image.links?.url" 
                     :alt="image.name">
                <div class="image-overlay">
                  <div class="image-info">
                    <div class="image-name">{{ image.name }}</div>
                    <div class="image-size">{{ image.size }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 浮动操作按钮 -->
    <button class="fab" @click="refreshData" title="刷新数据">
      🔄
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, inject } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const showToast = inject('showToast')
const api = inject('api')

const albums = ref([])
const apis = ref([])
const showImageModal = ref(false)
const currentAlbum = ref(null)
const albumImages = ref([])

const user = computed(() => {
  const userStr = localStorage.getItem('user')
  return userStr ? JSON.parse(userStr) : null
})

const userInitial = computed(() => user.value?.nickname?.charAt(0).toUpperCase() || 'U')
const totalImages = computed(() => 
  albums.value.reduce((sum, album) => sum + (album.image_num || 0), 0)
)
const activeApis = computed(() => 
  apis.value.filter(api => api.enabled).length
)

const loadAlbums = async () => {
  try {
    const result = await api.getAlbums()
    if (result.success) {
      albums.value = result.albums
    }
  } catch (error) {
    showToast('加载相册失败', 'error')
  }
}

const loadApis = async () => {
  try {
    const result = await api.getApis()
    if (result.success) {
      apis.value = result.apis
    }
  } catch (error) {
    showToast('加载API失败', 'error')
  }
}

const viewImages = async (album) => {
  currentAlbum.value = album
  showImageModal.value = true
  albumImages.value = []
  
  try {
    const result = await api.getAlbumImages(album.id)
    if (result.success) {
      albumImages.value = result.images
    }
  } catch (error) {
    showToast('加载图片失败', 'error')
  }
}

const openImage = (image) => {
  window.open(image.links?.url, '_blank')
}

const generateApi = async (album) => {
  const apiName = prompt('请输入API名称：', `${album.name} 随机图片API`)
  if (!apiName) return

  try {
    const result = await api.createRandomApi(album.id, apiName)
    if (result.success) {
      showToast('API创建成功！', 'success')
      await loadApis()
    }
  } catch (error) {
    showToast(error.response?.data?.error || '创建失败', 'error')
  }
}

const refreshData = async () => {
  showToast('正在刷新数据...', 'info')
  await Promise.all([loadAlbums(), loadApis()])
  showToast('数据已更新', 'success')
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
  loadAlbums()
  loadApis()
})
</script>