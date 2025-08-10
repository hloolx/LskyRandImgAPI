import axios from 'axios'

// 动态判断API基础路径
const getApiBase = () => {
  // 生产环境使用相对路径，支持HTTPS
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/api'
  }
  // 生产环境（cnb.cool等）使用相对路径
  return '/api'
}

const API_BASE = getApiBase()

// 创建axios实例
const request = axios.create({
  baseURL: API_BASE,
  timeout: 30000  // 增加超时时间到30秒
})

// 请求拦截器 - 添加session认证
request.interceptors.request.use(
  config => {
    const sessionId = localStorage.getItem('sessionId')
    if (sessionId) {
      config.headers['X-Session-Id'] = sessionId
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      // 未授权，清除session并跳转登录
      localStorage.removeItem('sessionId')
      localStorage.removeItem('user')
      window.location.hash = '#/login'
    }
    return Promise.reject(error)
  }
)

export const api = {
  // 用户认证
  async login(lskyHost, token) {
    const response = await request.post('/auth/login', { lskyHost, token })
    if (response.success && response.sessionId) {
      localStorage.setItem('sessionId', response.sessionId)
      localStorage.setItem('user', JSON.stringify(response.user))
    }
    return response
  },

  async logout() {
    const sessionId = localStorage.getItem('sessionId')
    await request.post('/auth/logout', { sessionId })
    localStorage.removeItem('sessionId')
    localStorage.removeItem('user')
  },

  // 相册管理
  async getAlbums() {
    return request.get('/albums')
  },

  async getAlbumImages(albumId) {
    return request.get(`/albums/${albumId}/images`)
  },

  // API管理
  async createRandomApi(albumId, apiName) {
    return request.post('/random-api/create', { albumId, apiName })
  },

  async getApis() {
    return request.get('/random-api/list')
  },

  async toggleApi(apiId, enabled) {
    return request.patch(`/random-api/${apiId}/toggle`, { enabled })
  },

  async deleteApi(apiId) {
    return request.delete(`/random-api/${apiId}`)
  },

  async getApiStats(apiId) {
    return request.get(`/random-api/${apiId}/stats`)
  }
}