# 构建阶段用完整镜像：自带编译工具，better-sqlite3 下载不到预编译文件时可以现场编译
# ---- 安装依赖 ----
FROM node:22-bookworm AS deps
WORKDIR /app
# 国内服务器可以用 --build-arg NPM_REGISTRY=https://registry.npmmirror.com 加速
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
RUN npm ci --registry=$NPM_REGISTRY

# ---- 构建 ----
FROM node:22-bookworm AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 运行 ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY docker-entrypoint.sh /usr/local/bin/mydoc-entrypoint
RUN chmod +x /usr/local/bin/mydoc-entrypoint && mkdir -p /app/data
VOLUME /app/data
EXPOSE 3000
ENTRYPOINT ["mydoc-entrypoint"]
CMD ["node", "server.js"]
