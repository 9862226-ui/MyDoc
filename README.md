# MyDoc · 共享文档链接管理

把散落在聊天记录里的共享文档链接（飞书、腾讯文档、语雀、网盘……）收集起来，按「分组 → 项目」归类，需要时一秒找到并打开。

只保存链接和备注信息，不保存文件本身。个人使用，部署在自己的服务器上。

## 功能

**收录**

- 粘贴链接自动识别平台和文档类型（飞书表格、腾讯文档收集表、百度网盘……共 20 多个平台），并尝试自动获取标题
- 直接粘贴整段分享文案（如百度网盘「链接: … 提取码: …」），自动拆出链接、标题、提取码
- 在页面空白处 `Ctrl+V`：一个链接直接打开添加窗口，多个链接打开批量导入
- 批量导入：多行文本、Excel 复制的表格（标题 / 链接 / 提取码）、浏览器导出的书签文件
- 重复检测：链接已存在时提示在哪个项目里

**整理**

- 分组 → 项目两层结构，另有标签可以跨项目使用
- 收件箱：没选项目的链接先放这里，之后再整理
- 拖动卡片到左侧项目即可移动；分组、项目也能拖动排序
- 多选后批量移动、加标签、收藏、删除（按住 Shift 可连续选择）
- 项目可以归档；删除的链接进回收站，30 天内可恢复

**访问**

- `Ctrl/⌘ + K` 全局搜索（标题、项目、标签、备注、平台），回车直接在新标签页打开
- 打开带提取码的链接时自动复制提取码
- 工作台显示待整理和快到期的提醒、收藏的快速访问、最近访问 / 最近添加；记录每个链接的访问次数
- 分享链接可设置有效期（长期 / 7 天 / 30 天 / 自定义），到期前 7 天会在「即将过期」中提醒
- 列表 / 卡片两种视图，按来源、标签筛选，多种排序；文档图标按类型着色（文档、表格、网盘、设计稿……）
- 支持手机访问（底部标签栏）和深色模式（跟随系统）

**数据**

- 导出 JSON（可恢复）、CSV（Excel 打开）、浏览器书签 HTML
- 所有数据在一个 SQLite 文件里：`data/mydoc.db`

## 一键部署（推荐）

支持常见的 Linux 服务器：Ubuntu、Debian、CentOS、Rocky Linux、AlmaLinux、阿里云 Linux、腾讯云 OpenCloudOS 等。登录服务器后运行：

```bash
sudo bash -c 'set -e; command -v git >/dev/null || { if command -v apt-get >/dev/null; then apt-get update && apt-get install -y git; else yum install -y git; fi; }; [ -d /opt/mydoc ] || git clone https://github.com/9862226-ui/MyDoc.git /opt/mydoc; bash /opt/mydoc/deploy.sh'
```

按提示设置登录密码，完成后访问 `http://服务器IP:3000`。云服务器还要在控制台的「安全组」里放行 TCP 3000 端口。

脚本会自动完成：

- 按系统选择运行方式：较新的系统（Ubuntu 22.04+、Debian 12+、Rocky / AlmaLinux 9 等）直接安装 Node.js 22，注册成系统服务 `mydoc`；较老的系统（CentOS 7、阿里云 Linux 2/3、Ubuntu 20.04 等）安装 Docker，在容器里运行
- 默认使用国内镜像（npmmirror、阿里云 Docker 源、Docker 镜像加速），国外服务器加 `--overseas`
- 开机自启、出错自动重启；内存小于 2G 时自动添加交换空间；本机开了 ufw / firewalld 防火墙时自动放行端口

数据在 `/opt/mydoc/data`，密码和端口在 `/etc/mydoc/mydoc.env`。

| 操作 | 命令 |
|---|---|
| 更新到最新版本 | `sudo bash /opt/mydoc/deploy.sh` |
| 修改登录密码 | `sudo bash /opt/mydoc/deploy.sh --reset-password` |
| 换端口（第一次部署时） | `sudo bash /opt/mydoc/deploy.sh --port 8080` |
| 强制用 Docker 运行 | `sudo bash /opt/mydoc/deploy.sh --docker` |
| 服务器在国外 | 加上 `--overseas`，使用官方源 |
| 查看状态 / 日志（直接运行） | `systemctl status mydoc` / `journalctl -u mydoc -f` |
| 查看状态 / 日志（Docker） | `sudo docker ps` / `sudo docker logs -f mydoc` |

常见问题：

- **连不上 GitHub**：在电脑上从 GitHub 下载 ZIP，解压后上传到服务器的 `/opt/mydoc`，再运行 `sudo bash /opt/mydoc/deploy.sh --no-pull`
- **Docker 镜像下载失败**：在阿里云「容器镜像服务 → 镜像工具 → 镜像加速器」里复制专属加速地址，运行 `sudo DOCKER_MIRRORS=你的加速地址 bash /opt/mydoc/deploy.sh`

## 手动用 Docker 部署

服务器上需要安装 Docker 和 Docker Compose。

```bash
git clone https://github.com/9862226-ui/MyDoc.git mydoc && cd mydoc

# 在 .env 文件里设置登录密码（国内服务器再加一行 NPM_REGISTRY=https://registry.npmmirror.com）
echo "APP_PASSWORD=你的密码" > .env

docker compose up -d --build
```

然后访问 `http://服务器IP:3000`，用设置的密码登录。数据保存在当前目录的 `data/` 下。端口可以在 `.env` 里用 `MYDOC_PORT=8080` 修改。

**更新版本**：

```bash
git pull && docker compose up -d --build
```

### 配置项（环境变量）

| 变量 | 说明 | 默认值 |
|---|---|---|
| `APP_PASSWORD` | 登录密码（必填） | 无 |
| `DATA_DIR` | 数据库目录 | Docker 内为 `/app/data` |
| `PORT` | 监听端口 | `3000` |
| `COOKIE_SECURE` | 强制登录 Cookie 是否加 `Secure`（`true` / `false`）；不设置时按访问协议自动判断 | 自动 |

### 配置 HTTPS（建议）

在公网使用时，建议用域名加 HTTPS。以 [Caddy](https://caddyserver.com/) 为例（自动申请证书）：

```
doc.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

使用 Nginx 时，需要转发协议头，登录 Cookie 才会带上 `Secure`：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### 备份

任选一种：

- 在「导入导出与设置」里导出 JSON，需要时用「从 JSON 备份恢复」导回
- 定期复制 `data/` 目录（最好先 `docker compose stop`，或者三个文件 `mydoc.db*` 一起复制）

## 不用 Docker 部署

需要 Node.js 22 或更高版本。

```bash
npm ci
npm run build
APP_PASSWORD=你的密码 npm start          # 默认端口 3000，可加 PORT=8080
```

建议用 pm2 或 systemd 保持后台运行。

## 本地开发

```bash
npm install
cp .env.example .env.local     # 修改 APP_PASSWORD
npm run dev                    # http://localhost:3000

npm test                       # 单元测试
npm run typecheck              # 类型检查
```

## 技术栈

- [Next.js](https://nextjs.org/)（App Router）+ React + TypeScript
- Tailwind CSS
- SQLite（better-sqlite3）

目录结构：

```
src/
  app/            页面和接口（app/api/*）
  components/     界面组件
  lib/            业务逻辑
    db.ts           数据库连接和升级脚本
    repo.ts         数据读写
    platforms.ts    平台识别规则（新增平台改这里）
    share-text.ts   分享文案解析
    view.ts         列表筛选、排序、搜索
```

## 安全说明

- 所有页面和接口都需要登录；同一来源 15 分钟内输错密码 10 次会被暂时锁定（输错时会提示还能再试几次）
- 只接受 http / https 链接
- 「获取标题」由服务器去访问链接，已禁止访问内网和本机地址
- 登录时勾选「30 天内免登录」会保持登录 30 天；不勾选时关闭浏览器就需要重新登录；退出登录后立即失效
