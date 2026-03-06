# Flassh

基于 Web 的 SSH 终端客户端，支持文件管理、系统监控和多会话。

[![Telegram Group](https://img.shields.io/badge/Telegram-群组交流-blue?logo=telegram)](https://t.me/+cbOi66BOhcNhYzg1) 加入群组反馈 Bug、交流使用体验

## 截图预览

![登录页面](screenshot-login.jpg)

![工作区](screenshot-workspace.jpg)

## 功能特性

- 🖥️ **Web 终端** - 基于 xterm.js 的完整终端体验
- 📁 **文件管理** - SFTP 文件浏览、上传、下载、编辑
- 📊 **系统监控** - 实时 CPU、内存、磁盘、网络流量监控
- 📜 **登录历史** - 查看服务器登录记录，检测异常登录
- 🔐 **多种认证** - 支持密码和私钥认证
- 🔑 **凭据存储** - AES-256 加密存储，支持一键连接
- 📱 **响应式设计** - 适配桌面和移动设备
- 🔄 **自动重连** - 断线自动重连机制
- 💾 **多标签会话** - 同时管理多个 SSH 连接，切换时保持状态
- 🎨 **主题切换** - 支持亮色/暗色主题，可自定义终端字体
- 📋 **右键菜单** - 终端复制粘贴（Ctrl+V 支持）、文件管理操作
- ✨ **现代化 UI** - 毛玻璃效果、粒子动画、圆润设计

## 快速部署

### Docker 部署（推荐）

```bash
docker run -d \
  --name flassh \
  -p 4000:4000 \
  -v flassh-data:/app/data \
  --restart unless-stopped \
  yangjarod117/flassh:latest
```

或使用 Docker Compose：

```yaml
services:
  flassh:
    image: yangjarod117/flassh:latest
    container_name: flassh
    ports:
      - "4000:4000"
    volumes:
      - flassh-data:/app/data  # 持久化凭据存储
    environment:
      - TZ=Asia/Shanghai
      - NODE_ENV=production
      - CREDENTIAL_KEY=your-64-char-hex-key-here  # 使用 openssl rand -hex 32 生成
      # - ACCESS_PASSWORD=your-secret-password  # 可选：设置访问密码保护面板
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  flassh-data:
```

```bash
docker-compose up -d
```

访问 `http://your-server:4000`

### 从源码构建

```bash
# 克隆代码
git clone https://github.com/yangjarod117/flassh.git
cd flassh

# 安装依赖
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 开发模式
cd backend && npm run dev    # 后端 :4000
cd frontend && npm run dev   # 前端 :3000

# 构建生产版本
cd frontend && npm run build
cd ../backend && npm run build
NODE_ENV=production node dist/index.js
```

### 构建 Docker 镜像

```bash
docker build -t yangjarod117/flassh:latest .
docker push yangjarod117/flassh:latest
```

## 功能说明

### 系统监控与登录历史

点击右侧边缘的箭头按钮展开侧边面板：

**系统监控**
- CPU 使用率
- 内存占用（已用/总量，悬停显示 Top 10 进程）
- 磁盘使用（已用/总量）
- 网络流量（上传/下载速率）
- 系统负载和运行时间

**登录历史**
- 查看最近登录记录
- 显示当前在线用户
- 检测失败的登录尝试（安全警告）

### 凭据存储

保存连接时可选择"记住凭据"：
- 凭据使用 AES-256-GCM 加密存储在服务器
- 下次连接时可一键登录，无需重复输入密码/密钥
- 已保存凭据的连接会显示 🔑 图标

### 终端操作

- 选中文本后右键：复制
- 无选中内容时右键：粘贴
- 支持 Ctrl+V 粘贴
- 多标签支持：可同时连接多个服务器，标签页切换

### 文件管理

- 支持文件/文件夹的创建、重命名、删除
- 支持文件上传和下载
- 支持在线编辑文本文件
- 支持文件夹和文件添加收藏，点击一键直达
- 右键菜单可在当前目录打开新终端

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 4000 |
| NODE_ENV | 运行环境 | development |
| ACCESS_PASSWORD | 访问密码（可选，设置后需要输入密码才能访问） | 空（不需要密码） |
| CREDENTIAL_KEY | 凭据加密密钥（64位hex字符串） | 随机生成 |
| CREDENTIAL_STORE_PATH | 凭据存储路径 | ./data/credentials.json |

### 设置访问密码

如果你想保护 Flassh 面板，可以设置访问密码：

```yaml
services:
  flassh:
    image: yangjarod117/flassh:latest
    environment:
      - ACCESS_PASSWORD=your-secret-password  # 设置访问密码
```

设置后，访问页面时会弹出密码输入框，支持"记住密码"功能（7天有效）。

### 生成加密密钥

```bash
# 使用 openssl 生成 64 位 hex 密钥
openssl rand -hex 32

# 或使用 Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS + xterm.js + Framer Motion
- **后端**: Node.js + Express + ssh2 + WebSocket
- **部署**: Docker + Docker Compose

## 安全说明

- 密码和私钥不会存储在浏览器本地
- 凭据使用 AES-256-GCM 加密存储在服务器
- 建议在生产环境设置固定的 CREDENTIAL_KEY
- 建议配合 HTTPS 和反向代理使用

## 许可证

MIT License © 2026
