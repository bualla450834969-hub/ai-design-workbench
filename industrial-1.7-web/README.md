# 工业设计智能体 1.7 网页版

这是独立的 `industrial-design-agent` 1.7 本地网页，不修改 LIHUO / ai-workbench（`apps/web`、`packages/*`、`启动工作台.bat`）。

建议把整个仓库放在 Windows 路径：

`D:\ai-industrial-web`

网页目录是其中的 `industrial-1.7-web`。开发服务固定使用端口 **3002**（3001 留给 LIHUO）。

## 启动

```bat
cd /d D:\ai-industrial-web\industrial-1.7-web
npm install
npm run dev
```

或在仓库根目录双击 `启动工业设计网页.bat`。浏览器打开 <http://localhost:3002>。

## 使用顺序

1. **激活软件**。本机离线授权码是 `LOCAL-INDUS-1.7`。它不是官方 IDAI1 签名。短授权码 `ID2-…` 需要云端授权服务器，当前版本会拒绝，并且不会请求 `app.zhengshixiong.cn`。
2. **连接模型**。填写自己的供应商 HTTPS 地址和 API Key。Key 只写入这台浏览器的 IndexedDB。
3. **创建项目**，进入工作台。

工作流与 1.7 平板一致：外观改款、配色 CMF、草图与结构、场景图、局部精修、多角度、细节图、自由对话。

生成、项目和图片走快照里的浏览器本地实现（`lib/browser-local-api.ts`、`lib/browser-local-store.ts` 及提示词库）。结果保存在本机项目素材里，不是 LIHUO 的 GeneratePanel。

带有效 Ed25519 签名、且能被 `license-ref/license-public.pem` 验过的 `IDAI1` 授权码可以离线激活。验签失败会拒绝。本程序不签发、不伪造官方签名。

## 目录说明

- `lib/`、`components/`、`app/api/projects/`、`license-ref/`、`ref-built/`、`SNAPSHOT.md` 来自 1.7 打包快照，作为行为依据。
- 新增页面在 `app/page.tsx` 和 `components/tablet/`。
- 离线授权在 `lib/offline-license.ts`，会话写在本目录 `.data/`（已忽略，不提交）。

`package.snapshot.json` 保留原 1.7 包说明。当前 `package.json` 只安装本地网页需要的依赖。
