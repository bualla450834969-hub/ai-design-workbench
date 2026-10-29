# 工业设计智能体桌面客户端网页

这个目录是桌面安装包里 Electron 所包的 Next 服务端，对应安装路径：

`D:\AI作图软件\工业设计智能体-1.7.0\resources\server`

界面、接口和静态资源都来自该服务目录（`lib/`、`components/`、`app/`、`public/`、`scripts/`、`package.json`，以及编译后的 `.next`）。这里没有另做网页皮肤。

当前提交取自更新通道上仍可下载的 Windows 安装包 **1.8.0** 的 `resources/server`（`Industrial-Design-Agent-Setup-1.8.0-x64.exe`）。1.7.0 安装包地址已返回 404。若本机安装的仍是 1.7.0，用该安装目录下的 `resources\server` 覆盖本目录即可，保留其中的 `.next`，不要带上 `vendor` 或 `node_modules`。

`.next` 已包含在仓库中（桌面界面的页面在编译结果里，源码树的 `app/` 只有部分接口）。若换用本机安装目录，请一并复制该目录的 `.next`。`vendor/` 与 `node_modules/` 不提交。

开发机建议放在 `D:\ai-industrial-web`。网页端口 **3002**。

```bat
cd /d D:\ai-industrial-web
启动工业设计网页.bat
```

或：

```bat
cd /d D:\ai-industrial-web\industrial-1.7-web
npm install --omit=dev
npx next start -H 127.0.0.1 -p 3002
```

若 `next start` 因独立打包目录结构无法启动，则使用安装包自带入口：

```bat
set PORT=3002
set HOSTNAME=127.0.0.1
node server.js
```
