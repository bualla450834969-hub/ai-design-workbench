# AI 产品外观重构工作台

基于 AI-Design-Pro 学习源码重构的移动优先工作台，核心层独立可替换，支持渐进式优化。

## 项目结构

```
ai-workbench/
├── apps/
│   └── web/                  # 应用层（移动优先 UI）
│       ├── app/
│       │   ├── page.tsx      # 首页（底部Tab + 响应式布局）
│       │   ├── layout.tsx
│       │   ├── globals.css
│       │   └── api/generate/ # API 路由（调用核心层）
│       ├── components/
│       │   └── AppNavigation.tsx  # 导航（移动端底部Tab/桌面端侧边栏）
│       ├── .env.local        # 环境变量（不提交到 git）
│       └── package.json
├── packages/
│   └── core/                 # 核心层（独立包，可替换）
│       ├── src/
│       │   ├── index.ts      # 唯一对外接口
│       │   ├── types/app.ts  # 类型定义
│       │   ├── pipeline/
│       │   │   └── generate-engine.ts  # 完整生成 pipeline（4012行，原样迁移）
│       │   ├── providers/    # 4个供应商适配
│       │   │   ├── geeknow.ts
│       │   │   ├── apiyi.ts
│       │   │   ├── aihubmix.ts
│       │   │   └── custom-openai.ts
│       │   └── lib/          # 工具模块
│       │       ├── templates.ts          # 11种设计方向模板
│       │       ├── models.ts             # 模型列表
│       │       ├── provider-resilience.ts # 供应商弹性容错
│       │       ├── reference-color-palette.ts # 配色提取
│       │       ├── reference-evidence.ts # 参考图证据
│       │       ├── product-view-evidence.ts
│       │       ├── prompt-contract.ts
│       │       ├── local-edit.ts         # 局部改款
│       │       ├── image-resolution.ts
│       │       ├── commerce.ts
│       │       ├── server-api-key.ts
│       │       ├── license-auth.ts       # 授权
│       │       └── license-db.ts
│       ├── __tests__/
│       ├── CHANGELOG.md
│       └── package.json
├── package.json              # workspace 根配置
├── tsconfig.base.json
└── .gitignore
```

## 核心设计原则

### 1. 核心层与应用层完全解耦
- 核心层 `@workbench/core` 是独立 npm 包
- 应用层只依赖核心层暴露的接口
- 换核心版本 = 换电池，接口不变，内部可随便优化

### 2. 核心层 100% 保真迁移
- `generate-engine.ts` 从原项目原样复制，仅修改导入路径
- 11种设计方向模板、4个供应商、质量校验逻辑全部保留
- 行为与原项目一致，v1.0.0 作为稳定基线

### 3. 移动优先响应式布局
- 移动端：底部 Tab 导航 + 单列堆叠
- 桌面端（xl 断点）：左侧边栏 + 左右分栏
- 一套代码，两端共享业务逻辑

### 4. 可回滚的版本管理
- 核心层稳定版打 git tag（`core-v1.0.0`）
- 优化在新分支做，对比验证后才合入
- 出问题随时回退到稳定标签

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制 `.env.example` 为 `.env.local`，填写：
```bash
APP_ACCESS_CODE=你的访问码
GEEKNOW_API_KEY=你的GeekAI密钥（可选）
```

### 3. 构建核心层
```bash
npm run build:core
```

### 4. 启动开发服务器
```bash
npm run dev
```
访问 http://localhost:3001

## 核心层版本管理

### 查看当前版本
```bash
git tag -l "core-*"
```

### 打新版本标签
```bash
git tag core-v1.1.0 -m "核心层 v1.1.0：优化 prompt"
```

### 回滚到稳定版
```bash
git checkout core-v1.0.0 -- packages/core/
```

### 在分支上优化核心层
```bash
git checkout -b core/optimize-prompt
# 修改 packages/core/ 中的代码
npm run build:core  # 编译验证
npm run test:core   # 类型检查
# 对比验证后合入主干
```

## 技术栈

- **框架**: Next.js 15.5 + React 19
- **语言**: TypeScript (strict)
- **样式**: Tailwind CSS 3.4
- **核心引擎**: 从 AI-Design-Pro 抽取
- **包管理**: npm workspaces (monorepo)
- **Node**: 22.x

## 后续优化方向

1. **核心层模块化**: 逐步拆分 4012 行的 generate-engine.ts 为 prompts/、quality/、pipeline/
2. **快照测试**: 为核心 prompt 输出写快照测试，锁定行为
3. **状态管理**: 引入 Zustand 管理生成状态
4. **本地存储**: IndexedDB 保存历史记录
5. **PWA**: 添加 Serwist 支持离线安装
6. **涂抹工具**: 触摸优化的局部改款画布
