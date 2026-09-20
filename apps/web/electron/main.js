const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");
const waitOn = require("wait-on");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let nextProcess = null;
const PORT = 3001;

// 判断是否是打包后的生产环境
const isPackaged = app.isPackaged;

// 内置默认授权码（桌面软件不需要环境变量配置）
process.env.APP_ACCESS_CODE = "LIHUO88888888";
process.env.UNLIMITED_LICENSE_CODES = "TESTER88888888";

// 跳过 TypeScript 检查（生产环境不需要）
process.env.NEXT_PRIVATE_SKIP_TYPESCRIPT = "true";
process.env.NEXT_DISABLE_TYPESCRIPT = "true";

// 配置自动更新
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// 自动更新状态
let updateDownloaded = false;

function sendUpdateStatus(message) {
  if (mainWindow) {
    mainWindow.webContents.send("update-status", message);
  }
}

// 自动更新事件
autoUpdater.on("checking-for-update", () => {
  console.log("正在检查更新...");
});

autoUpdater.on("update-available", (info) => {
  console.log("发现新版本:", info.version);
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "发现新版本",
    message: `发现新版本 v${info.version}`,
    detail: "是否现在下载更新？下载完成后会提示重启安装。",
    buttons: ["立即下载", "稍后再说"],
    defaultId: 0,
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on("update-not-available", () => {
  console.log("当前已是最新版本");
});

autoUpdater.on("download-progress", (progressObj) => {
  const percent = Math.round(progressObj.percent);
  console.log(`更新下载中: ${percent}%`);
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("更新下载完成:", info.version);
  updateDownloaded = true;
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "更新下载完成",
    message: `新版本 v${info.version} 已下载完成`,
    detail: "是否现在重启安装更新？",
    buttons: ["立即重启", "稍后重启"],
    defaultId: 0,
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on("error", (err) => {
  console.error("自动更新错误:", err);
});

// 获取应用根目录（包含 .next 的目录）
function getAppDir() {
  if (isPackaged) {
    // 打包后（asar: false）：应用文件在 resources/app 目录下
    return path.join(process.resourcesPath, "app");
  }
  // 开发环境：apps/web 目录
  return path.join(__dirname, "..");
}

// 获取 next CLI 入口文件路径（JS文件，用 node 直接执行）
function getNextCliPath() {
  if (isPackaged) {
    // 打包后：node_modules 在 app.asar 中
    return path.join(app.getAppPath(), "node_modules", "next", "dist", "bin", "next");
  }
  // 开发环境：monorepo 根目录的 node_modules
  return path.join(__dirname, "..", "..", "..", "node_modules", "next", "dist", "bin", "next");
}

// 启动 Next.js 服务器（编程式 API，直接在主进程中运行）
function startNextServer() {
  return new Promise((resolve, reject) => {
    const appDir = getAppDir();
    console.log("App dir:", appDir);
    console.log(".next exists:", fs.existsSync(path.join(appDir, ".next")));
    console.log("next exists:", fs.existsSync(path.join(appDir, "node_modules", "next")));

    try {
      // 动态加载 next
      const nextPath = path.join(appDir, "node_modules", "next");
      console.log("Loading next from:", nextPath);
      const next = require(nextPath);
      console.log("next loaded, type:", typeof next);

      const nextApp = next({ dev: false, dir: appDir });
      const handle = nextApp.getRequestHandler();

      nextApp.prepare().then(() => {
        const server = http.createServer((req, res) => {
          handle(req, res);
        });

        server.listen(PORT, () => {
          console.log(`> Ready on http://localhost:${PORT}`);
          nextProcess = server; // 保存服务器引用，用于退出时关闭
          resolve();
        });

        server.on("error", (err) => {
          console.error("Server error:", err);
          reject(err);
        });
      }).catch((err) => {
        console.error("Next prepare error:", err);
        dialog.showErrorBox("Next.js 启动失败", err.message + "\n\n" + (err.stack || ""));
        reject(err);
      });
    } catch (err) {
      console.error("Failed to load next:", err);
      dialog.showErrorBox("加载 Next.js 失败", "路径: " + path.join(appDir, "node_modules", "next") + "\n\n错误: " + err.message + "\n\n" + (err.stack || ""));
      reject(err);
    }
  });
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "璃火矩创-工业设计AI",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 加载本地 Next.js 应用
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 外部链接在浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 应用就绪
app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();

    // 打包后检查更新
    if (isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.error("检查更新失败:", err);
        });
      }, 5000);
    }
  } catch (err) {
    console.error("启动失败:", err);
    dialog.showErrorBox("启动失败", err.message || "未知错误");
    app.quit();
  }
});

// 所有窗口关闭时退出
app.on("window-all-closed", () => {
  if (nextProcess) {
    nextProcess.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 退出时关闭服务器
app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.close();
  }
});
