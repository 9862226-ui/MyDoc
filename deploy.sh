#!/usr/bin/env bash
# MyDoc 一键部署 / 更新脚本（Linux：Ubuntu、Debian、CentOS、Rocky、AlmaLinux、阿里云 / 腾讯云系统等）
#
# 第一次部署：
#   sudo git clone https://github.com/9862226-ui/MyDoc.git /opt/mydoc
#   sudo bash /opt/mydoc/deploy.sh
#
# 以后更新：再运行一次 sudo bash /opt/mydoc/deploy.sh
#
# 自动选择运行方式：较新的系统直接安装 Node.js 22 并注册成 systemd 服务；
# 较老的系统（如 CentOS 7、阿里云 Linux 2/3）安装 Docker，在容器里运行。
# 默认使用国内镜像，国外服务器加 --overseas。
#
# 选项：
#   --port 端口         监听端口，默认 3000（只在第一次部署时生效）
#   --reset-password    重新设置登录密码
#   --no-pull           不从 GitHub 拉取最新代码，直接用当前目录的代码
#   --docker            强制用 Docker 运行
#   --overseas          使用官方源（服务器在国外时）
#   -h, --help          显示帮助

set -euo pipefail

# 整个脚本放在 main 里：bash 会先读完再执行，脚本运行中被 git pull 更新也不会读到一半的新内容
main() {
umask 022
ORIG_ARGS=("$@")

NODE_MAJOR=22
SERVICE=mydoc
SERVICE_USER=mydoc
CONFIG_DIR=/etc/mydoc
ENV_FILE=$CONFIG_DIR/mydoc.env
DEFAULT_DIR=/opt/mydoc
REPO_URL=${REPO_URL:-https://github.com/9862226-ui/MyDoc.git}
# 直接运行需要的最低 glibc 版本（数据库驱动的预编译文件要求 2.34）
MIN_GLIBC=2.34

PORT=3000
RESET_PASSWORD=0
PULL=1
OVERSEAS=0
FORCE_DOCKER=0

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
  sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
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
    --docker) FORCE_DOCKER=1 ;;
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
  DOCKER_CE_MIRROR=https://download.docker.com
  DEFAULT_DOCKER_MIRRORS=""
else
  NPM_REGISTRY=https://registry.npmmirror.com
  NODE_DIST=https://registry.npmmirror.com/-/binary/node
  DOCKER_CE_MIRROR=https://mirrors.aliyun.com/docker-ce
  DEFAULT_DOCKER_MIRRORS="https://docker.m.daocloud.io https://docker.1ms.run"
fi
# 可以用环境变量指定 Docker 镜像加速地址（例如阿里云容器镜像服务里的专属地址），多个用空格分开
USER_MIRRORS=${DOCKER_MIRRORS:-}
DOCKER_MIRRORS=${DOCKER_MIRRORS:-$DEFAULT_DOCKER_MIRRORS}

# ---------- 前置检查 ----------
[ "$(uname -s)" = Linux ] || die "这个脚本只支持 Linux 服务器"
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "请用 root 用户运行"
  exec sudo -E bash "$0" "${ORIG_ARGS[@]}"
fi

OS_ID="" OS_VERSION="" OS_LIKE="" OS_NAME="Linux" OS_CODENAME="" OS_PLATFORM=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID=${ID:-} OS_VERSION=${VERSION_ID:-} OS_LIKE=${ID_LIKE:-} OS_NAME=${PRETTY_NAME:-Linux}
  OS_CODENAME=${VERSION_CODENAME:-} OS_PLATFORM=${PLATFORM_ID:-}
fi

if command -v apt-get >/dev/null; then
  PM=apt
elif command -v dnf >/dev/null; then
  PM=dnf
elif command -v yum >/dev/null; then
  PM=yum
else
  die "不支持的系统：$OS_NAME（需要 apt、dnf 或 yum 包管理器）"
fi

APT_UPDATED=0
pkg_install() {
  case $PM in
    apt)
      if [ "$APT_UPDATED" = 0 ]; then
        apt-get update -qq
        APT_UPDATED=1
      fi
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
      ;;
    *) $PM install -y -q "$@" >/dev/null ;;
  esac
}

ver_ge() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]; }

GLIBC=$(ldd --version 2>/dev/null | head -1 | awk '{print $NF}')
[[ $GLIBC =~ ^[0-9]+\.[0-9]+$ ]] || GLIBC=0

# libstdc++ 也要够新（GCC 11 及以上的运行库）
has_new_libstdcxx() {
  local lib
  lib=$(ldconfig -p 2>/dev/null | awk '/libstdc\+\+\.so\.6 .*x86-64|libstdc\+\+\.so\.6 .*AArch64/ {print $NF; exit}')
  [ -n "$lib" ] && grep -aq 'GLIBCXX_3\.4\.29' "$lib"
}

case "$(uname -m)" in
  x86_64 | amd64) NODE_ARCH=x64 ;;
  aarch64 | arm64) NODE_ARCH=arm64 ;;
  *) die "不支持的处理器架构：$(uname -m)" ;;
esac

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"name": "mydoc"' "$SCRIPT_DIR/package.json"; then
  APP_DIR=$SCRIPT_DIR
else
  APP_DIR=$DEFAULT_DIR
fi

# ---------- 1. 系统软件 ----------
step "检查系统软件（$OS_NAME）"
NEED_PKGS=()
need() { command -v "$1" >/dev/null || NEED_PKGS+=("$2"); }
need curl curl
need git git
need tar tar
if [ "$PM" = apt ]; then
  need xz xz-utils
  need ss iproute2
  dpkg -s ca-certificates >/dev/null 2>&1 || NEED_PKGS+=(ca-certificates)
else
  need xz xz
  need ss iproute
  rpm -q ca-certificates >/dev/null 2>&1 || NEED_PKGS+=(ca-certificates)
fi
if [ ${#NEED_PKGS[@]} -gt 0 ]; then
  echo "安装：${NEED_PKGS[*]}"
  pkg_install "${NEED_PKGS[@]}" || die "安装系统软件失败，请检查软件源（$PM）是否可用"
fi
ok "系统软件已就绪"

# 选择运行方式
if [ "$FORCE_DOCKER" = 1 ]; then
  MODE=docker
  MODE_REASON="按 --docker 选项"
elif [ -f "$APP_DIR/.env" ] && grep -q '^MYDOC_MODE=docker' "$APP_DIR/.env" 2>/dev/null; then
  MODE=docker
  MODE_REASON="之前用 Docker 部署"
elif ver_ge "$GLIBC" "$MIN_GLIBC" && has_new_libstdcxx; then
  MODE=native
  MODE_REASON="系统较新（glibc $GLIBC），直接运行"
else
  MODE=docker
  MODE_REASON="系统较老（glibc $GLIBC，直接运行需要 $MIN_GLIBC 以上），改用 Docker"
fi
ok "运行方式：$([ "$MODE" = docker ] && echo Docker || echo 直接运行)（$MODE_REASON）"

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
NEED_MB=$([ "$MODE" = docker ] && echo 3000 || echo 1200)
[ "$FREE_MB" -ge "$NEED_MB" ] || warn "磁盘剩余空间只有 ${FREE_MB}MB，建议至少 ${NEED_MB}MB"

# ---------- 2. 代码 ----------
step "准备代码"
# 不用 git -C：CentOS 7 自带的 git 1.8 不支持
git_() { (cd "$APP_DIR" && git -c safe.directory="$APP_DIR" "$@"); }
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "从 $REPO_URL 下载到 $APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR" ||
    die "下载代码失败。可以在电脑上从 GitHub 下载 ZIP，解压后上传到 $APP_DIR，再运行：bash $APP_DIR/deploy.sh --no-pull"
  exec bash "$APP_DIR/deploy.sh" "${ORIG_ARGS[@]}" --no-pull
elif [ "$PULL" = 1 ] && [ -d "$APP_DIR/.git" ]; then
  OLD_HEAD=$(git_ rev-parse HEAD)
  if git_ pull --ff-only; then
    ok "代码已更新到最新：$(git_ log -1 --format='%h %s')"
    # 部署脚本本身更新了：用新脚本重新运行
    if ! git_ diff --quiet "$OLD_HEAD" HEAD -- deploy.sh; then
      echo "部署脚本有更新，用新版本继续"
      exec bash "$APP_DIR/deploy.sh" "${ORIG_ARGS[@]}" --no-pull
    fi
  else
    warn "拉取最新代码失败（网络问题或本地有改动），先用当前代码继续部署"
  fi
else
  ok "使用当前目录的代码"
fi

# ---------- 3. 登录密码和配置 ----------
step "检查配置"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

ask_password() {
  local p1 p2
  if [ -n "${APP_PASSWORD:-}" ]; then
    NEW_PASSWORD=$APP_PASSWORD
  elif { : </dev/tty; } 2>/dev/null; then
    # 能打开终端才提问（通过 ssh 直接执行命令时没有终端，会自动生成密码）
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
    # 先读固定长度再过滤，避免 pipefail 下 tr 被提前关闭管道而退出
    NEW_PASSWORD=$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-16)
    GENERATED_PASSWORD=$NEW_PASSWORD
  fi
  [ ${#NEW_PASSWORD} -ge 6 ] || die "密码太短，至少 6 位"
  [[ $NEW_PASSWORD != *"'"* ]] || die "密码里不能有单引号 '"
}

write_env() {
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
# MyDoc 配置。直接运行时修改后执行 systemctl restart $SERVICE；Docker 运行时重新执行部署脚本
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
SAVED_PASSWORD=$(sed -n "s/^APP_PASSWORD='\(.*\)'$/\1/p" "$ENV_FILE")

# 端口被别的程序占用时的提示
port_owner() { ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'users:(("[^"]*"' | head -1 | cut -d'"' -f2; }
HAS_SYSTEMD=0
[ -d /run/systemd/system ] && HAS_SYSTEMD=1

if [ "$MODE" = native ]; then
  deploy_native
else
  deploy_docker
fi

# ---------- 防火墙 ----------
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow "$PORT/tcp" >/dev/null && ok "已在 ufw 防火墙放行 $PORT 端口"
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp" >/dev/null && firewall-cmd --reload >/dev/null &&
    ok "已在 firewalld 防火墙放行 $PORT 端口"
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
if [ "$MODE" = native ]; then
  echo "    查看状态   systemctl status $SERVICE"
  echo "    查看日志   journalctl -u $SERVICE -f"
  echo "    重启服务   sudo systemctl restart $SERVICE"
else
  echo "    查看状态   sudo docker ps"
  echo "    查看日志   sudo docker logs -f mydoc"
  echo "    重启服务   sudo docker restart mydoc"
fi
}

# 启动后等网站能打开
wait_ready() {
  for _ in $(seq 1 60); do
    curl -fs --noproxy '*' -o /dev/null "http://127.0.0.1:$PORT/login" && return 0
    sleep 1
  done
  return 1
}

# ---------- 直接运行：Node.js + systemd ----------
deploy_native() {
  step "检查 Node.js $NODE_MAJOR"
  node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
  NODE_BIN=$(command -v node || true)
  if [ -n "$NODE_BIN" ] && [ "$(node_major "$NODE_BIN")" -ge "$NODE_MAJOR" ]; then
    ok "已安装 Node.js $("$NODE_BIN" -v)"
  else
    NODE_VERSION=$(curl -fsSL --retry 3 "$NODE_DIST/index.json" | grep -o "\"version\":\"v$NODE_MAJOR\.[0-9.]*\"" | head -1 | cut -d'"' -f4)
    [ -n "$NODE_VERSION" ] || die "获取 Node.js 版本列表失败，请检查网络"
    echo "下载 Node.js $NODE_VERSION ($NODE_ARCH)"
    TMP_TAR=$(mktemp)
    curl -fL --retry 3 $([ -t 1 ] && echo --progress-bar || echo -sS) -o "$TMP_TAR" \
      "$NODE_DIST/$NODE_VERSION/node-$NODE_VERSION-linux-$NODE_ARCH.tar.xz" || die "下载 Node.js 失败，请检查网络"
    mkdir -p /usr/local/lib/nodejs
    rm -rf "/usr/local/lib/nodejs/node-$NODE_VERSION"
    tar -xJf "$TMP_TAR" -C /usr/local/lib/nodejs
    mv "/usr/local/lib/nodejs/node-$NODE_VERSION-linux-$NODE_ARCH" "/usr/local/lib/nodejs/node-$NODE_VERSION"
    rm -f "$TMP_TAR"
    for bin in node npm npx; do
      ln -sf "/usr/local/lib/nodejs/node-$NODE_VERSION/bin/$bin" "/usr/local/bin/$bin"
    done
    # 开着 SELinux 的系统（CentOS / Rocky 等）上，让 systemd 能执行这个程序
    if command -v selinuxenabled >/dev/null && selinuxenabled; then
      chcon -t bin_t "/usr/local/lib/nodejs/node-$NODE_VERSION/bin/node" 2>/dev/null || true
    fi
    hash -r
    NODE_BIN=/usr/local/bin/node
    ok "已安装 Node.js $("$NODE_BIN" -v)"
  fi
  NODE_DIR=$(dirname "$(readlink -f "$NODE_BIN")")
  export PATH="$NODE_DIR:$PATH"

  # 服务用独立的系统用户运行，需要能读到代码目录（放在 /root 下面读不到）
  id -u "$SERVICE_USER" >/dev/null 2>&1 ||
    useradd --system --no-create-home --home-dir /nonexistent \
      --shell "$(command -v nologin || echo /sbin/nologin)" "$SERVICE_USER"
  runuser -u "$SERVICE_USER" -- test -r "$APP_DIR/package.json" ||
    die "服务用户 $SERVICE_USER 读不到 $APP_DIR（比如放在 /root 下面）。请把代码放到 $DEFAULT_DIR 后重新运行"

  # 更新时先停掉旧服务（重新安装依赖会删掉正在用的文件），大约停一两分钟
  if [ "$HAS_SYSTEMD" = 1 ] && systemctl is-active --quiet "$SERVICE"; then
    systemctl stop "$SERVICE"
    warn "已暂停服务，构建完成后自动启动"
  fi

  step "安装依赖（$NPM_REGISTRY）"
  cd "$APP_DIR"
  export NEXT_TELEMETRY_DISABLED=1
  # better-sqlite3 自带各平台的预编译文件，跳过安装脚本就不需要编译工具
  npm ci --registry="$NPM_REGISTRY" --no-audit --no-fund --no-update-notifier --loglevel=error --ignore-scripts
  node -e 'new (require("better-sqlite3"))(":memory:").close()' 2>/dev/null ||
    die "数据库驱动无法在这个系统上运行，请改用 Docker：sudo bash $APP_DIR/deploy.sh --docker"
  ok "依赖安装完成"

  step "构建（大约 1~3 分钟）"
  BUILD_LOG=$(mktemp)
  if ! npm run build --silent >"$BUILD_LOG" 2>&1; then
    tail -40 "$BUILD_LOG"
    die "构建失败，上面是最后的输出（完整日志：$BUILD_LOG）"
  fi
  rm -f "$BUILD_LOG"
  ok "构建完成"

  mkdir -p "$APP_DIR/data"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/data" "$APP_DIR/.next"

  step "启动服务"
  START_CMD="$NODE_DIR/node $APP_DIR/node_modules/next/dist/bin/next start"
  if [ "$HAS_SYSTEMD" = 1 ]; then
    if [ -n "$(port_owner)" ]; then
      die "端口 $PORT 已被「$(port_owner)」占用（如果是之前用 Docker 部署的，先运行 sudo docker rm -f mydoc）。也可以换端口：--port 8080"
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

  if ! wait_ready; then
    [ "$HAS_SYSTEMD" = 1 ] && journalctl -u "$SERVICE" -n 30 --no-pager || tail -30 "$APP_DIR/data/server.log"
    die "服务没有正常启动，上面是最近的日志"
  fi
  ok "服务已启动"
}

# ---------- Docker 运行 ----------
install_docker() {
  step "安装 Docker（$DOCKER_CE_MIRROR）"
  if [ "$PM" = apt ]; then
    local distro=$OS_ID
    [ "$distro" = ubuntu ] || [ "$distro" = debian ] || distro=$([[ $OS_LIKE == *ubuntu* ]] && echo ubuntu || echo debian)
    pkg_install gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "$DOCKER_CE_MIRROR/linux/$distro/gpg" | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] $DOCKER_CE_MIRROR/linux/$distro $OS_CODENAME stable" \
      >/etc/apt/sources.list.d/docker.list
    APT_UPDATED=0
  else
    # CentOS 系的发行版都用 CentOS 的 Docker 源，按 el7 / el8 / el9 选择
    local el
    case "$OS_PLATFORM" in
      platform:el[0-9]*) el=${OS_PLATFORM#platform:el} ;;
      *)
        el=${OS_VERSION%%.*}
        if [ "$OS_ID" = alinux ]; then
          el=$([ "$el" = 2 ] && echo 7 || echo 8)
        elif ! [[ $el =~ ^(7|8|9|10)$ ]]; then
          el=8
        fi
        ;;
    esac
    curl -fsSL "$DOCKER_CE_MIRROR/linux/centos/docker-ce.repo" -o /etc/yum.repos.d/docker-ce.repo
    sed -i "s#https://download.docker.com#$DOCKER_CE_MIRROR#g; s#\$releasever#$el#g" /etc/yum.repos.d/docker-ce.repo
  fi
  pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin ||
    die "安装 Docker 失败，请把上面的输出发给开发者"
  ok "已安装 $(docker --version)"
}

# 给 Docker 配置镜像加速。参数为 1 时替换已有的配置（用户用 DOCKER_MIRRORS 指定了地址）
configure_docker_mirrors() {
  local force=${1:-0} json=/etc/docker/daemon.json list="" m
  [ -n "$DOCKER_MIRRORS" ] || return 1
  for m in $DOCKER_MIRRORS; do list="$list${list:+, }\"$m\""; done
  mkdir -p /etc/docker
  if [ -s "$json" ] && grep -q '"registry-mirrors"' "$json"; then
    if [ "$force" != 1 ]; then
      warn "$json 里已经配置了镜像加速，不做修改"
      return 1
    fi
    cp "$json" "$json.bak"
    sed -i "s#\"registry-mirrors\": *\[[^]]*\]#\"registry-mirrors\": [$list]#" "$json"
    if ! grep -qF "[$list]" "$json"; then
      warn "没能自动修改 $json，请手动把里面的 registry-mirrors 改成：$DOCKER_MIRRORS"
      return 1
    fi
  elif [ -s "$json" ] && [ "$(tr -d ' \n\t' <"$json")" != "{}" ]; then
    cp "$json" "$json.bak"
    sed -i "0,/{/s#{#{\n  \"registry-mirrors\": [$list],#" "$json"
    if ! grep -q '"registry-mirrors"' "$json"; then
      warn "没能自动修改 $json，请手动加上 registry-mirrors：$DOCKER_MIRRORS"
      return 1
    fi
  else
    printf '{\n  "registry-mirrors": [%s]\n}\n' "$list" >"$json"
  fi
  ok "已配置 Docker 镜像加速：$DOCKER_MIRRORS"
  if [ "$HAS_SYSTEMD" = 1 ]; then systemctl restart docker; fi
  return 0
}

BASE_IMAGES="node:22-bookworm node:22-bookworm-slim"
have_base_images() { docker image inspect $BASE_IMAGES >/dev/null 2>&1; }
pull_base_images() {
  local img
  for img in $BASE_IMAGES; do
    timeout 900 docker pull -q "$img" >/dev/null 2>&1 || return 1
  done
}

deploy_docker() {
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    install_docker
  fi
  if ! docker info >/dev/null 2>&1; then
    [ "$HAS_SYSTEMD" = 1 ] || die "Docker 没有运行，请先启动 Docker"
    systemctl enable --now docker >/dev/null 2>&1 || die "启动 Docker 失败"
  fi
  [ "$HAS_SYSTEMD" = 1 ] && systemctl enable docker >/dev/null 2>&1 || true

  # 之前是直接运行的，切换到 Docker 时停掉原来的服务
  if [ "$HAS_SYSTEMD" = 1 ] && systemctl is-enabled --quiet "$SERVICE" 2>/dev/null; then
    systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
    warn "已停用直接运行的 $SERVICE 服务，改用 Docker"
  fi

  step "准备基础镜像（node:22，约 400MB）"
  [ -n "$USER_MIRRORS" ] && { configure_docker_mirrors 1 || true; }
  if have_base_images; then
    ok "基础镜像已在本机"
  else
    echo "下载中，第一次需要几分钟…"
    # 先直接下载（失败重试一次），还不行再配置国内镜像加速
    if pull_base_images || pull_base_images ||
      { [ -z "$USER_MIRRORS" ] && configure_docker_mirrors && pull_base_images; }; then
      ok "基础镜像已就绪"
    else
      die "下载 Docker 镜像失败。可以在阿里云「容器镜像服务 → 镜像工具 → 镜像加速器」里复制专属加速地址，然后运行：
  sudo DOCKER_MIRRORS=你的加速地址 bash $APP_DIR/deploy.sh"
    fi
  fi

  # docker-compose.yml 从同目录的 .env 读取密码、端口和 npm 源
  (
    umask 077
    cat >"$APP_DIR/.env" <<EOF
# 由 deploy.sh 生成，改密码请运行 sudo bash $APP_DIR/deploy.sh --reset-password
MYDOC_MODE=docker
MYDOC_PORT=$PORT
APP_PASSWORD='$SAVED_PASSWORD'
NPM_REGISTRY=$NPM_REGISTRY
EOF
  )

  if ! docker ps --format '{{.Names}}' | grep -qx mydoc && [ -n "$(port_owner)" ]; then
    die "端口 $PORT 已被「$(port_owner)」占用，可以换端口：--port 8080"
  fi

  step "构建并启动（第一次大约 3~5 分钟）"
  mkdir -p "$APP_DIR/data"
  BUILD_LOG=$(mktemp)
  if ! (cd "$APP_DIR" && docker compose up -d --build) >"$BUILD_LOG" 2>&1; then
    tail -40 "$BUILD_LOG"
    die "构建或启动失败，上面是最后的输出（完整日志：$BUILD_LOG）"
  fi
  rm -f "$BUILD_LOG"
  docker image prune -f >/dev/null 2>&1 || true

  if ! wait_ready; then
    docker logs --tail 30 mydoc 2>&1 || true
    die "服务没有正常启动，上面是最近的日志"
  fi
  ok "服务已启动（Docker 容器 mydoc，开机自动启动）"
}

main "$@"
