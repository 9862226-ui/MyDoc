#!/usr/bin/env bash
# MyDoc 一键部署 / 更新脚本（Ubuntu / Debian）
#
# 第一次部署：
#   sudo git clone https://github.com/9862226-ui/MyDoc.git /opt/mydoc
#   sudo bash /opt/mydoc/deploy.sh
#
# 以后更新：再运行一次 sudo bash /opt/mydoc/deploy.sh
#
# 不用 Docker：安装 Node.js 22，构建后注册成 systemd 服务（开机自启、崩溃自动重启）。
# 默认使用国内镜像（npmmirror），国外服务器加 --overseas。
#
# 选项：
#   --port 端口         监听端口，默认 3000（只在第一次部署时生效，之后改 /etc/mydoc/mydoc.env）
#   --reset-password    重新设置登录密码
#   --no-pull           不从 GitHub 拉取最新代码，直接用当前目录的代码构建
#   --overseas          使用官方源（服务器在国外时）
#   -h, --help          显示帮助

set -euo pipefail
umask 022
ORIG_ARGS=("$@")

NODE_MAJOR=22
SERVICE=mydoc
SERVICE_USER=mydoc
CONFIG_DIR=/etc/mydoc
ENV_FILE=$CONFIG_DIR/mydoc.env
DEFAULT_DIR=/opt/mydoc
REPO_URL=${REPO_URL:-https://github.com/9862226-ui/MyDoc.git}

PORT=3000
RESET_PASSWORD=0
PULL=1
OVERSEAS=0

# ---------- 输出 ----------
if [ -t 1 ]; then
  C_BLUE=$'\e[1;34m' C_GREEN=$'\e[1;32m' C_YELLOW=$'\e[1;33m' C_RED=$'\e[1;31m' C_OFF=$'\e[0m'
else
  C_BLUE='' C_GREEN='' C_YELLOW='' C_RED='' C_OFF=''
fi
step() { echo; echo "${C_BLUE}==> $*${C_OFF}"; }
ok() { echo "${C_GREEN}✓ $*${C_OFF}"; }
warn() { echo "${C_YELLOW}! $*${C_OFF}"; }
die() {
  echo "${C_RED}✗ $*${C_OFF}" >&2
  exit 1
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port)
      PORT=${2:-}
      shift
      ;;
    --reset-password) RESET_PASSWORD=1 ;;
    --no-pull) PULL=0 ;;
    --overseas) OVERSEAS=1 ;;
    -h | --help) usage ;;
    *) die "不认识的选项：$1（用 --help 查看说明）" ;;
  esac
  shift
done
[[ $PORT =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "端口不正确：$PORT"

if [ "$OVERSEAS" = 1 ]; then
  NPM_REGISTRY=https://registry.npmjs.org
  NODE_DIST=https://nodejs.org/dist
else
  NPM_REGISTRY=https://registry.npmmirror.com
  NODE_DIST=https://registry.npmmirror.com/-/binary/node
fi

# ---------- 前置检查 ----------
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "请用 root 用户运行"
  exec sudo -E bash "$0" "${ORIG_ARGS[@]}"
fi
command -v apt-get >/dev/null || die "这个脚本只支持 Ubuntu / Debian（需要 apt）"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"name": "mydoc"' "$SCRIPT_DIR/package.json"; then
  APP_DIR=$SCRIPT_DIR
else
  APP_DIR=$DEFAULT_DIR
fi

echo "${C_BLUE}MyDoc 部署脚本${C_OFF}  目录：$APP_DIR  端口：$PORT  镜像：$([ "$OVERSEAS" = 1 ] && echo 官方源 || echo 国内)"

# ---------- 1. 系统软件 ----------
step "检查系统软件"
NEED_PKGS=()
for pkg in curl ca-certificates git xz-utils; do
  dpkg -s "$pkg" >/dev/null 2>&1 || NEED_PKGS+=("$pkg")
done
if [ ${#NEED_PKGS[@]} -gt 0 ]; then
  echo "安装：${NEED_PKGS[*]}"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEED_PKGS[@]}" >/dev/null
fi
ok "系统软件已就绪"

# 内存小于 2G 且没有交换空间时，加 2G 交换文件，避免构建时内存不够
MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ {print int($2 / 1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 1900 ] && [ "$SWAP_MB" -lt 512 ] && [ ! -e /swapfile ]; then
  step "内存只有 ${MEM_MB}MB，添加 2G 交换文件"
  if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
    chmod 600 /swapfile
    if mkswap /swapfile >/dev/null && swapon /swapfile; then
      grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
      ok "已添加交换文件"
    else
      rm -f /swapfile
      warn "添加交换文件失败，继续部署（构建时可能内存不足）"
    fi
  fi
fi

FREE_MB=$(df -Pm "$(dirname "$APP_DIR")" | awk 'NR == 2 {print $4}')
[ "$FREE_MB" -ge 1200 ] || warn "磁盘剩余空间只有 ${FREE_MB}MB，构建可能需要 1G 以上"

# ---------- 2. Node.js ----------
step "检查 Node.js $NODE_MAJOR"
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
NODE_BIN=$(command -v node || true)
if [ -n "$NODE_BIN" ] && [ "$(node_major "$NODE_BIN")" -ge "$NODE_MAJOR" ]; then
  ok "已安装 Node.js $("$NODE_BIN" -v)"
else
  case "$(dpkg --print-architecture)" in
    amd64) NODE_ARCH=x64 ;;
    arm64) NODE_ARCH=arm64 ;;
    *) die "不支持的处理器架构：$(dpkg --print-architecture)" ;;
  esac
  NODE_VERSION=$(curl -fsSL --retry 3 "$NODE_DIST/index.json" | grep -o "\"version\":\"v$NODE_MAJOR\.[0-9.]*\"" | head -1 | cut -d'"' -f4)
  [ -n "$NODE_VERSION" ] || die "获取 Node.js 版本列表失败，请检查网络"
  echo "下载 Node.js $NODE_VERSION ($NODE_ARCH)"
  TMP_TAR=$(mktemp)
  curl -fL --retry 3 $([ -t 1 ] && echo --progress-bar || echo -sS) -o "$TMP_TAR" "$NODE_DIST/$NODE_VERSION/node-$NODE_VERSION-linux-$NODE_ARCH.tar.xz" ||
    die "下载 Node.js 失败，请检查网络"
  mkdir -p /usr/local/lib/nodejs
  rm -rf "/usr/local/lib/nodejs/node-$NODE_VERSION"
  tar -xJf "$TMP_TAR" -C /usr/local/lib/nodejs
  mv "/usr/local/lib/nodejs/node-$NODE_VERSION-linux-$NODE_ARCH" "/usr/local/lib/nodejs/node-$NODE_VERSION"
  rm -f "$TMP_TAR"
  for bin in node npm npx; do
    ln -sf "/usr/local/lib/nodejs/node-$NODE_VERSION/bin/$bin" "/usr/local/bin/$bin"
  done
  hash -r
  NODE_BIN=/usr/local/bin/node
  ok "已安装 Node.js $("$NODE_BIN" -v)"
fi
NODE_DIR=$(dirname "$(readlink -f "$NODE_BIN")")
export PATH="$NODE_DIR:$PATH"

# ---------- 3. 代码 ----------
step "准备代码"
git_() { git -c safe.directory="$APP_DIR" -C "$APP_DIR" "$@"; }
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "从 $REPO_URL 下载到 $APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR" ||
    die "下载代码失败。可以在电脑上从 GitHub 下载 ZIP，解压后上传到 $APP_DIR，再运行：bash $APP_DIR/deploy.sh --no-pull"
  exec bash "$APP_DIR/deploy.sh" --port "$PORT" --no-pull \
    $([ "$RESET_PASSWORD" = 1 ] && echo --reset-password) $([ "$OVERSEAS" = 1 ] && echo --overseas)
elif [ "$PULL" = 1 ] && [ -d "$APP_DIR/.git" ]; then
  if git_ pull --ff-only; then
    ok "代码已更新到最新：$(git_ log -1 --format='%h %s')"
  else
    warn "拉取最新代码失败（网络问题或本地有改动），先用当前代码继续部署"
  fi
else
  ok "使用当前目录的代码"
fi

# 服务用独立的系统用户运行，需要能读到代码目录（放在 /root 下面读不到）
id -u "$SERVICE_USER" >/dev/null 2>&1 ||
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"
runuser -u "$SERVICE_USER" -- test -r "$APP_DIR/package.json" ||
  die "服务用户 $SERVICE_USER 读不到 $APP_DIR（比如放在 /root 下面）。请把代码放到 $DEFAULT_DIR 后重新运行"

# ---------- 4. 登录密码和配置 ----------
step "检查配置"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

ask_password() {
  local p1 p2
  if [ -n "${APP_PASSWORD:-}" ]; then
    NEW_PASSWORD=$APP_PASSWORD
  elif [ -r /dev/tty ]; then
    while true; do
      read -rsp "设置登录密码（至少 6 位）：" p1 </dev/tty
      echo
      read -rsp "再输入一次：" p2 </dev/tty
      echo
      if [ "$p1" != "$p2" ]; then
        warn "两次输入不一样，请重新输入"
      elif [ ${#p1} -lt 6 ]; then
        warn "密码太短，至少 6 位"
      elif [[ $p1 == *"'"* ]]; then
        warn "密码里不能有单引号 '"
      else
        break
      fi
    done
    NEW_PASSWORD=$p1
  else
    NEW_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)
    GENERATED_PASSWORD=$NEW_PASSWORD
  fi
  [ ${#NEW_PASSWORD} -ge 6 ] || die "密码太短，至少 6 位"
  [[ $NEW_PASSWORD != *"'"* ]] || die "密码里不能有单引号 '"
}

write_env() {
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
# MyDoc 配置，修改后运行 systemctl restart $SERVICE 生效
APP_PASSWORD='$NEW_PASSWORD'
PORT=$1
DATA_DIR=$APP_DIR/data
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
  )
}

if [ ! -f "$ENV_FILE" ]; then
  ask_password
  write_env "$PORT"
  ok "已保存配置：$ENV_FILE"
else
  # 已有配置：端口以配置文件为准
  PORT=$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2 || echo "$PORT")
  if [ "$RESET_PASSWORD" = 1 ]; then
    ask_password
    write_env "$PORT"
    ok "已更新登录密码"
  else
    ok "沿用已有配置（端口 $PORT；改密码用 --reset-password）"
  fi
fi

# ---------- 5. 安装依赖并构建 ----------
HAS_SYSTEMD=0
[ -d /run/systemd/system ] && HAS_SYSTEMD=1
# 更新时先停掉旧服务（重新安装依赖会删掉正在用的文件），大约停一两分钟
if [ "$HAS_SYSTEMD" = 1 ] && systemctl is-active --quiet "$SERVICE"; then
  systemctl stop "$SERVICE"
  warn "已暂停服务，构建完成后自动启动"
fi

step "安装依赖（$NPM_REGISTRY）"
cd "$APP_DIR"
export NEXT_TELEMETRY_DISABLED=1
# better-sqlite3 自带各平台的预编译文件，跳过安装脚本就不需要编译工具
npm ci --registry="$NPM_REGISTRY" --no-audit --no-fund --loglevel=error --ignore-scripts
if ! node -e 'new (require("better-sqlite3"))(":memory:").close()' 2>/dev/null; then
  warn "数据库驱动没有可用的预编译文件，安装编译工具后现场编译（需要几分钟）"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential python3 >/dev/null
  npm rebuild better-sqlite3 --loglevel=error
  node -e 'new (require("better-sqlite3"))(":memory:").close()' || die "数据库驱动安装失败"
fi
ok "依赖安装完成"

step "构建（大约 1~3 分钟）"
npm run build --silent
ok "构建完成"

mkdir -p "$APP_DIR/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/data" "$APP_DIR/.next"

# ---------- 6. 启动服务 ----------
step "启动服务"
START_CMD="$NODE_DIR/node $APP_DIR/node_modules/next/dist/bin/next start"

# 端口被别的程序占用时提示（自己的服务除外）
port_owner() { ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'users:(("[^"]*"' | head -1 | cut -d'"' -f2; }

if [ "$HAS_SYSTEMD" = 1 ]; then
  if [ -n "$(port_owner)" ]; then
    die "端口 $PORT 已被「$(port_owner)」占用（如果是之前用 Docker 部署的，先在那个目录运行 docker compose down）。也可以换端口：--port 8080"
  fi
  cat >/etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=MyDoc 共享文档链接管理
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$START_CMD
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null 2>&1
  systemctl restart "$SERVICE"
else
  # 没有 systemd（例如容器里）：直接在后台运行
  warn "系统没有 systemd，改为直接在后台运行（重启服务器后需要再运行一次本脚本）"
  pkill -f "$APP_DIR/node_modules/next/dist/bin/next start" 2>/dev/null || true
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  nohup runuser -u "$SERVICE_USER" -- $START_CMD >"$APP_DIR/data/server.log" 2>&1 &
fi

for _ in $(seq 1 40); do
  curl -fs --noproxy '*' -o /dev/null "http://127.0.0.1:$PORT/login" && break
  sleep 1
done
if ! curl -fs --noproxy '*' -o /dev/null "http://127.0.0.1:$PORT/login"; then
  [ "$HAS_SYSTEMD" = 1 ] && journalctl -u "$SERVICE" -n 30 --no-pager || tail -30 "$APP_DIR/data/server.log"
  die "服务没有正常启动，上面是最近的日志"
fi
ok "服务已启动"

# 本机防火墙（ufw）开着时放行端口
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow "$PORT/tcp" >/dev/null && ok "已在 ufw 防火墙放行 $PORT 端口"
fi

# ---------- 完成 ----------
PUBLIC_IP=$(curl -fsS -m 5 https://4.ipw.cn 2>/dev/null || curl -fsS -m 5 https://ifconfig.me 2>/dev/null || true)
[[ $PUBLIC_IP =~ ^[0-9.]+$ ]] || PUBLIC_IP="服务器公网IP"

echo
echo "${C_GREEN}部署完成！${C_OFF}"
echo
echo "  访问地址：http://$PUBLIC_IP:$PORT"
if [ -n "${GENERATED_PASSWORD:-}" ]; then
  echo "  登录密码：$GENERATED_PASSWORD   （自动生成，请记下来；改密码：sudo bash $APP_DIR/deploy.sh --reset-password）"
fi
echo "  数据目录：$APP_DIR/data   （备份时复制这个目录）"
echo
echo "  还打不开的话，去云服务器控制台的「安全组 / 防火墙」放行 TCP $PORT 端口"
echo
echo "  常用命令："
echo "    更新版本   sudo bash $APP_DIR/deploy.sh"
echo "    修改密码   sudo bash $APP_DIR/deploy.sh --reset-password"
echo "    查看状态   systemctl status $SERVICE"
echo "    查看日志   journalctl -u $SERVICE -f"
echo "    重启服务   sudo systemctl restart $SERVICE"
