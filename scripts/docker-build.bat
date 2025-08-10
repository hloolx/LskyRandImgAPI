@echo off
REM Docker构建脚本 (Windows版本)

echo 🚀 开始构建随机图片API Docker镜像...

REM 检查是否有.env文件
if not exist .env (
    echo 📝 创建.env配置文件...
    copy .env.example .env
    echo ⚠️  请编辑.env文件设置必要的配置
)

REM 构建前端（如果需要）
if not exist dist (
    echo 📦 构建前端应用...
    cd vue-simple
    call npm install
    call npm run build
    cd ..
)

REM 构建Docker镜像
echo 🐳 构建Docker镜像...
docker build -t random-image-api:latest .

echo ✅ Docker镜像构建完成！
echo.
echo 运行容器：
echo   docker run -d -p 3000:3000 --name random-image-api random-image-api:latest
echo.
echo 或使用docker-compose：
echo   docker-compose up -d