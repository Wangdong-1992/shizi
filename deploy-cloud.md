# GEO Platform 云服务器部署指南

## 快速部署 (一键脚本)

### 步骤 1: 购买云服务器

推荐配置：
| 配置项 | 推荐 |
|--------|------|
| **服务商** | 阿里云 / 腾讯云 / AWS |
| **系统** | Ubuntu 20.04 LTS |
| **规格** | 2核4G (最低) / 4核8G (推荐) |
| **带宽** | 5Mbps (最低) |
| **硬盘** | 40GB SSD |

### 步骤 2: 上传代码

```bash
# 方法A: Git 克隆
git clone <你的仓库地址> geo-platform
cd geo-platform

# 方法B: FTP/SCP 上传
```

### 步骤 3: 一键部署

```bash
# 给脚本执行权限
chmod +x deploy-cloud.sh

# 运行部署
sudo ./deploy-cloud.sh
```

---

## 手动部署

### 步骤 1: 安装 Docker

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker
```

### 步骤 2: 配置环境变量

```bash
# 复制模板
cp .env.example .env

# 编辑配置 (必填项)
nano .env
```

必填配置：
```bash
# 数据库
POSTGRES_PASSWORD=你的安全密码

# JWT
JWT_SECRET=你的JWT密钥 (openssl rand -hex 32)

# Redis
REDIS_PASSWORD=你的Redis密码

# OpenAI (可选)
OPENAI_API_KEY=sk-xxx
```

### 步骤 3: 启动服务

```bash
docker compose -f docker/docker-compose.prod.yml up -d --build
```

---

## HTTPS 配置 (可选)

### 使用 Let's Encrypt (免费)

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书 (需要域名)
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

### 使用自签名证书 (测试用)

```bash
# 生成自签名证书
mkdir -p docker/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/key.pem \
  -out docker/nginx/ssl/cert.pem
```

---

## 部署检查

| 检查项 | 命令 |
|--------|------|
| 容器状态 | `docker compose -f docker/docker-compose.prod.yml ps` |
| 查看日志 | `docker compose -f docker/docker-compose.prod.yml logs -f` |
| 健康检查 | `curl http://localhost/health` |
| 前端检查 | `curl http://localhost` |

---

## 常见问题

### 端口被占用
```bash
# 检查端口
netstat -tlnp | grep -E '80|443|5432|6379'

# 修改端口
# 编辑 docker-compose.prod.yml 中 ports 部分
```

### 内存不足
```bash
# 添加 swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 磁盘不足
```bash
# 清理 Docker
docker system prune -a
docker volume prune
```

---

## 维护命令

```bash
# 查看状态
docker compose -f docker/docker-compose.prod.yml ps

# 查看日志
docker compose -f docker/docker-compose.prod.yml logs -f [服务名]

# 重启服务
docker compose -f docker/docker-compose.prod.yml restart

# 更新代码后重新构建
docker compose -f docker/docker-compose.prod.yml up -d --build

# 停止服务
docker compose -f docker/docker-compose.prod.yml down
```

---

## 备份与恢复

### 备份数据库
```bash
docker exec geo-postgres pg_dump -U geo geo_platform > backup_$(date +%Y%m%d).sql
```

### 恢复数据库
```bash
docker exec -i geo-postgres psql -U geo geo_platform < backup_20260101.sql
```
