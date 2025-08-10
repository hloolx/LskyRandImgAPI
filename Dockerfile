# 多阶段构建 - 随机图片API系统
# 阶段1：构建前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app/vue-simple

# 复制前端依赖文件
COPY vue-simple/package*.json ./

# 安装前端依赖
RUN npm ci --only=production

# 复制前端源码
COPY vue-simple/ ./

# 构建前端
RUN npm run build

# 阶段2：构建最终镜像
FROM node:18-alpine

# 安装必要的系统依赖
RUN apk add --no-cache sqlite

WORKDIR /app

# 复制后端依赖文件
COPY package*.json ./

# 安装后端依赖
RUN npm ci --only=production

# 复制后端源码
COPY server-secure.js ./
COPY .env.example ./

# 从前端构建阶段复制打包好的文件
COPY --from=frontend-builder /app/dist ./dist

# 创建数据目录（用于持久化数据库）
RUN mkdir -p /app/data

# 创建非root用户运行应用
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置文件权限
RUN chown -R nodejs:nodejs /app

USER nodejs

# 暴露端口（默认3000，可通过环境变量覆盖）
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1);})" || exit 1

# 启动应用
CMD ["node", "server-secure.js"]