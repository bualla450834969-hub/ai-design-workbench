# 工业设计智能体 · 本地平板网页版

在 Windows 上把这个仓库放到 `D:\ai-tablet-web` 后，用浏览器打开和 https://app.zhengshixiong.cn/tablet/ 同一套布局的工作台：激活、连接自己的模型 API Key、创建项目、外观改款、结果和历史。

授权只在本机完成。页面不会把授权码发给 `app.zhengshixiong.cn`，也不会补签官方服务器签名。API Key 保存在当前浏览器的本地存储里，生成请求发给你填写的模型供应商。

## 准备

1. 安装 [Node.js 24.x](https://nodejs.org/)。
2. 把仓库克隆到 `D:\ai-tablet-web`。如果这台电脑上已经有 `D:\ai-workbench-web`，也可以在那个目录里拉取这个分支。

```bat
git clone <your-repo-url> D:\ai-tablet-web
cd /d D:\ai-tablet-web
npm install
```

## 启动

```bat
cd /d D:\ai-tablet-web
npm run dev
```

或双击仓库根目录的 `启动平板工作台.bat`。

浏览器打开 http://localhost:3001 。

## 激活

1. 在第一步粘贴你已有的完整 `IDAI1...` 授权码（区分大小写，整段粘贴）。
2. 第二步填写模型供应商和 API Key。密钥只留在这台浏览器。
3. 第三步创建项目，进入工作台。

也可以不改代码、只打开本地测试模式。在 `apps\web\.env.local` 写入：

```
TABLET_ALLOW_TEST_CODE=1
```

重启 `npm run dev` 后，授权码填写 `LOCAL-TABLET`。未设置这个变量时，测试码不会通过。

已有的 `LIHUO` / `TESTER` 授权码仍然可用。

## 生成

进入工作台后，在左侧选择「外观改款」「配色 CMF」「场景图」或「局部精修」，上传产品图，点击「开始生成」。没有 API Key 时，生成会提示先到「模型与授权」里填写。
