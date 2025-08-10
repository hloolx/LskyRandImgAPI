# 兰空图床随机图片API系统

## 一、项目介绍

### 功能特性
- **兰空图床集成**：通过兰空图床Token登录，自动获取用户相册和图片
- **随机图片API生成**：为每个相册生成独立的随机图片API接口
- **图片管理**：查看相册中的所有图片，支持预览和管理
- **API管理**：创建、查看、启用/禁用、删除API接口
- **安全认证**：基于Session的用户认证系统，Token加密存储

### 技术架构
- **后端**：Node.js + Express + SQLite3
- **前端**：Vue 3 + Vue Router + Vite
- **安全**：AES-256-CBC加密、Session认证、CORS白名单、请求限流

### 使用流程
1. 使用兰空图床地址和Token登录
2. 选择要生成API的相册
3. 创建随机图片API
4. 复制API链接使用

### API接口
- **随机图片**：`GET /api/random/:apiKey` - 返回随机图片（302重定向）
- **登录认证**：`POST /api/auth/login` - 兰空图床Token验证
- **相册管理**：`GET /api/albums` - 获取相册列表
- **API管理**：`POST /api/random-api/create` - 创建随机API

## 二、部署方式

### 快速部署（5分钟）

#### 环境要求
- Node.js 14.0+
- npm 6.0+

#### 本地部署
```bash
# 1. 克隆项目
git clone https://cnb.cool/hloolx/LskyRandImgAPI.git
cd LskyRandImgAPI

# 2. 一键安装并构建
npm run setup:build

# 3. 配置环境变量
cp .env.example .env          # Linux/Mac
copy .env.example .env        # Windows

# 编辑 .env 文件，修改以下必填项：
PORT=3000                     # 服务端口
ENCRYPT_SECRET=随机32位密钥    # 必须修改！
SESSION_SECRET=随机32位密钥    # 必须修改！

# 4. 启动服务
npm start
```

访问 `http://localhost:3000` 即可使用！

#### Docker部署
```bash
# 方式一：Docker Compose（推荐）
docker-compose up -d

# 方式二：手动构建
docker build -t random-image-api .
docker run -d -p 3000:3000 random-image-api
```

### 云平台部署

#### Heroku
```bash
# 登录并创建应用
heroku login
heroku create your-app-name

# 设置容器部署
heroku stack:set container

# 配置环境变量
heroku config:set ENCRYPT_SECRET=your-secret
heroku config:set SESSION_SECRET=your-session

# 部署
git push heroku main
```

#### Railway
```bash
# 安装CLI并登录
npm i -g @railway/cli
railway login

# 初始化并部署
railway init
railway up
```

#### Fly.io
```bash
# 安装CLI并登录
curl -L https://fly.io/install.sh | sh
fly auth login

# 初始化并部署
fly launch
fly deploy
```

### 生产环境部署

#### PM2进程管理
```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start server-secure.js --name "random-image-api"

# 设置开机自启
pm2 startup
pm2 save
```

#### Nginx反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 环境变量配置

| 变量名 | 说明 | 必填 | 示例 |
|--------|------|------|------|
| PORT | 服务端口 | 否 | 3000 |
| ENCRYPT_SECRET | 数据加密密钥 | **是** | 32位随机字符串 |
| SESSION_SECRET | Session密钥 | **是** | 32位随机字符串 |
| CORS_ORIGINS | CORS白名单 | 否 | https://app.example.com |

生成安全密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 常见问题

**端口被占用？**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID 进程ID /F

# Linux/Mac  
lsof -i :3000
kill -9 进程ID
```

**前端页面404？**
```bash
cd vue-simple
npm run build
```

**数据库错误？**
```bash
# Linux/Mac
chmod 666 database.db

# Windows
# 右键文件 -> 属性 -> 安全 -> 给予完全控制权限
```

### 备份与维护
```bash
# 备份数据库
cp database.db database.db.backup

# 更新代码
git pull
npm run setup:build

# 重启服务（PM2）
pm2 restart random-image-api
```

## 许可证
MIT License

## 联系方式
如有问题或建议，请通过GitHub Issues联系。