# 多阶段构建
FROM node:22-alpine AS builder
WORKDIR /app

# 复制 monorepo 配置
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY apps/web/package.json ./apps/web/

# 安装依赖
RUN npm ci

# 复制源码
COPY . .

# 构建
RUN npm run build

# 生产阶段
FROM node:22-alpine AS runner
WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV PORT=8080

# 复制构建产物
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json* /app/package-lock.json
COPY --from=builder /app/packages/core /app/packages/core
COPY --from=builder /app/apps/web /app/apps/web
COPY --from=builder /app/node_modules /app/node_modules

# 暴露端口
EXPOSE 8080

# 启动命令（明确指定 8080 端口）
CMD ["npx", "next", "start", "-p", "8080"]
