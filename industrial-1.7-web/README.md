# 工业设计智能体桌面客户端网页

这个目录是桌面安装包里 Electron 所包的 Next 服务端，在浏览器里提供同一套界面（React Flow 画布、成果面板、项目素材）。这里没有另做平板或网页皮肤。

当前源码对应桌面端 **1.9.0**（`package.json` version `1.9.0`），来自安装目录：

`D:\工业作图软件\1.9\industrial-design-agent\resources\server`

`vendor/` 与 `node_modules/` 不提交。页面源码不在这份服务端提取里（`app/` 只有部分接口），已提交的 `.next` 仍是上一份可启动的桌面编译结果。换成 1.9 安装目录时，请一并复制该目录的 `.next`，不要带上 `vendor` 或 `node_modules`。

开发机建议放在 `D:\ai-industrial-web`。网页端口 **3002**，监听 **0.0.0.0**，本机用 `http://127.0.0.1:3002` 打开。

```bat
cd /d D:\ai-industrial-web
启动工业设计网页.bat
```

或：

```bat
cd /d D:\ai-industrial-web\industrial-1.7-web
npm install --omit=dev
set DESKTOP_MODE=true
set PORT=3002
set HOSTNAME=0.0.0.0
npx next start -H 0.0.0.0 -p 3002
```

`npm start` 同样绑定 `HOSTNAME`（默认 `0.0.0.0`）和 `PORT`，并设置 `DESKTOP_MODE=true`。不要设置 `WEB_MODE`、`WEB_LOCAL_MODE` 或 `NEXT_PUBLIC_WEB_LOCAL_MODE`。浏览器本地模式会把 `POST /api/projects` 拦在授权接口之外。

若 `next start` 因独立打包目录结构无法启动，则使用安装包自带入口（同样读取 `PORT` 和 `HOSTNAME`）：

```bat
set DESKTOP_MODE=true
set PORT=3002
set HOSTNAME=0.0.0.0
node server.js
```

客户机不需要把 `GEEKAI_API_KEY` 写进仓库。文字和图片走模型网关 `POST /v1/generate/text` 与 `POST /v1/generate/images`（`Authorization: Bearer`，`X-Client: industrial-design-agents-desktop`）。地址和令牌优先读 `MODEL_GATEWAY_URL`、`MODEL_GATEWAY_TOKEN`；这两项为空时，再读 `${IDAI_DATA_DIR}/license-gateway.json`（未设置数据目录时是 `industrial-1.7-web/.data/license-gateway.json`）里的 `url` 和 `token`。

视频仍使用 1.9 桌面端的供应商连接（`DESKTOP_MODE=true` 时的 `IDAI_VIDEO_*` 或 `DESKTOP_PROVIDER_RUNTIME_FILE`）。当前许可证网关没有视频接口，网页模式不会另造一条视频 API。
