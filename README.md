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
- 首页显示收藏、最近访问、最近添加；记录每个链接的访问次数
- 分享链接可设置有效期，7 天内到期会在「即将过期」中提醒
- 卡片 / 列表两种视图，按平台、标签筛选，多种排序
- 支持手机访问和深色模式

**数据**

- 导出 JSON（可恢复）、CSV（Excel 打开）、浏览器书签 HTML
- 所有数据在一个 SQLite 文件里：`data/mydoc.db`

## 部署（Docker，推荐）

服务器上需要安装 Docker 和 Docker Compose。

```bash
git clone <仓库地址> mydoc && cd mydoc

# 修改 docker-compose.yml 里的 APP_PASSWORD 为你的登录密码
vi docker-compose.yml

docker compose up -d --build
```

然后访问 `http://服务器IP:3000`，用设置的密码登录。数据保存在当前目录的 `data/` 下。

**国内服务器构建慢**：把 `docker-compose.yml` 里的 `build: .` 改成：

```yaml
    build:
      context: .
      args:
        NPM_REGISTRY: https://registry.npmmirror.com
```

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

- 所有页面和接口都需要登录；同一来源 15 分钟内输错密码 10 次会被暂时锁定
- 只接受 http / https 链接
- 「获取标题」由服务器去访问链接，已禁止访问内网和本机地址
- 登录状态保存 30 天，退出登录后立即失效
