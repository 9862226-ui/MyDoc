#!/bin/sh
set -e
# 以 root 启动时：把数据目录交给 node 用户，再降权运行，避免挂载目录没有写权限
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
