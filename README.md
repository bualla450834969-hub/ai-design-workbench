# AI 产品外观重构工作台

基于 AI-Design-Pro 核心引擎重构的产品外观设计工作台，支持产品外观重构、商品套图生成、电商详情页设计。

## 功能特性

### 核心功能
- **外观重构**：上传产品图，AI 生成多套外观重构方案
- **商品套图**：生成标准六视图、场景图、白底主图等电商商品图
- **电商详情页**：自动生成详情页设计方案
- **局部改款**：涂抹指定区域，精准修改部件材质/造型
- **分组批量生成**：多组参数同时生成，对比不同设计方向

### 设计辅助
- **AI 智能编写设计需求**：根据产品图和名称自动生成专业设计需求
- **设计参考图**：最多8张参考图，可指定参考类型（造型/配色/材质/风格）
- **11种设计方向**：造型突破、功能重构、未来概念、高端升级等
- **重构比例调节**：从保守改款到造型突破，精准控制改动幅度

### 管理功能
- **历史记录**：自动保存生成记录，支持复盘和参数复用
- **方案收藏**：收藏喜欢的方案，最多50张
- **方案详情**：展示设计说明、核心卖点、材质工艺、与原图差异
- **生成上下文**：每次生成记录原图、参数、设计需求，方便复盘
- **费用估算**：实时显示预估生成费用

### 授权系统
- **授权码验证**：每个授权码最多绑定3个设备
- **设备绑定**：首次使用自动绑定，不可解绑
- **支持多授权码**：环境变量配置多个授权码

## 技术栈

- **框架**：Next.js 15.5 + React 19
- **语言**：TypeScript (strict)
- **样式**：Tailwind CSS 3.4
- **架构**：Monorepo (npm workspaces)
  - `packages/core`：核心生成引擎（原样迁移，v1.0.0）
  - `apps/web`：Web 应用层
- **AI 供应商**：GeekAI / API易 / AIHubMix / 自定义 OpenAI 兼容接口

## 本地开发

### 环境要求
- Node.js 22.x
- npm 10+

### 安装步骤

```bash
# 1. 克隆仓库
git clone <your-repo-url>
cd ai-workbench

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example apps/web/.env.local
# 编辑 apps/web/.env.local，填入授权码

# 4. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 生产构建

```bash
npm run build
npm run start
```

## 部署到 Vercel

### 前置准备
1. GitHub 账号
2. Vercel 账号（免费版即可）
3. Upstash Redis 账号（可选，用于设备绑定持久化）

### 部署步骤

#### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

#### 2. 导入 Vercel
1. 登录 [vercel.com](https://vercel.com)
2. 点击 "Add New" → "Project"
3. 选择你的 GitHub 仓库
4. Vercel 自动识别 Next.js 项目

#### 3. 配置环境变量
在 Vercel 项目设置 → Environment Variables 中添加：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `LICENSE_CODES` | 授权码列表（逗号分隔） | `LIHUO88888888,CODE-0002` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL（可选） | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token（可选） | `your-token` |

#### 4. 配置 Upstash Redis（推荐）
生产环境建议配置 Redis，否则服务器重启后设备绑定关系会丢失。

1. 登录 [upstash.com](https://upstash.com)
2. 创建 Redis 数据库（选择免费套餐）
3. 在 Vercel 项目中添加 Upstash 集成
4. 或手动复制 REST URL 和 Token 到环境变量

#### 5. 部署
点击 "Deploy"，等待 2-3 分钟完成。

部署完成后会得到一个 `xxx.vercel.app` 的域名，可以直接访问。

### 绑定自定义域名（可选）
1. Vercel 项目设置 → Domains
2. 输入你的域名
3. 按提示修改 DNS 解析
4. 等待 SSL 证书自动签发

## 授权码管理

### 添加授权码
编辑环境变量 `LICENSE_CODES`，用逗号分隔多个授权码：

```
LICENSE_CODES=LIHUO88888888,CLIENT-001,CLIENT-002
```

修改后需要重新部署 Vercel 才能生效。

### 设备绑定规则
- 每个授权码最多绑定 3 个设备
- 设备在首次使用授权码时自动绑定
- 绑定后不可解绑
- 清除浏览器数据会导致设备ID变化，需要重新绑定

## 项目结构

```
ai-workbench/
├── packages/
│   └── core/                    # 核心生成引擎
│       ├── src/
│       │   ├── pipeline/        # 生成流程
│       │   ├── providers/       # AI 供应商（4个）
│       │   ├── lib/             # 工具模块
│       │   └── types/           # 类型定义
│       └── package.json
├── apps/
│   └── web/                     # Web 应用
│       ├── app/
│       │   ├── api/             # API 路由
│       │   ├── page.tsx         # 主页面
│       │   └── globals.css      # 全局样式
│       ├── components/          # UI 组件
│       ├── lib/                 # 应用层工具
│       ├── types/               # 应用层类型
│       ├── constants/           # 常量定义
│       ├── utils/               # 工具函数
│       └── package.json
├── .env.example                 # 环境变量示例
├── package.json                 # Monorepo 配置
└── README.md
```

## 核心引擎版本

当前核心引擎版本：**v1.0.0**

核心层独立成包，原样迁移自 AI-Design-Pro，逻辑未做任何修改。可通过 git tag 管理版本：

```bash
git tag core-v1.0.0
git push origin core-v1.0.0
```

## 许可证

MIT
