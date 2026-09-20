"use client";

import { useState, useEffect } from "react";

/**
 * 更新通知组件
 * 监听 Electron 主进程的更新事件，显示更新提示
 */
export default function UpdateNotification() {
  const [updateState, setUpdateState] = useState<
    "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "idle"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    // 检查是否在 Electron 环境中
    if (typeof window === "undefined") return;
    
    // Electron 环境下，监听主进程的更新事件
    const electron = (window as any).electron;
    if (!electron) return;

    // 监听更新状态
    const handleUpdateStatus = (status: string, data?: any) => {
      console.log("Update status:", status, data);
      
      switch (status) {
        case "checking":
          setUpdateState("checking");
          break;
        case "available":
          setUpdateState("available");
          setVersion(data?.version || "");
          setShowModal(true);
          break;
        case "not-available":
          setUpdateState("not-available");
          break;
        case "downloading":
          setUpdateState("downloading");
          setProgress(data?.percent || 0);
          break;
        case "downloaded":
          setUpdateState("downloaded");
          setShowModal(true);
          break;
        case "error":
          setUpdateState("error");
          break;
      }
    };

    // 注册监听
    electron.onUpdateStatus(handleUpdateStatus);

    // 启动时检查更新
    setTimeout(() => {
      electron.checkForUpdates();
    }, 3000);

    return () => {
      // 清理监听
      if (electron.removeUpdateStatusListener) {
        electron.removeUpdateStatusListener(handleUpdateStatus);
      }
    };
  }, []);

  const handleDownload = () => {
    const electron = (window as any).electron;
    if (electron && electron.downloadUpdate) {
      electron.downloadUpdate();
      setUpdateState("downloading");
    }
  };

  const handleInstall = () => {
    const electron = (window as any).electron;
    if (electron && electron.quitAndInstall) {
      electron.quitAndInstall();
    }
  };

  // 不在 Electron 环境，或者没有可用更新，不显示
  if (typeof window === "undefined" || !(window as any).electron) return null;
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-2xl bg-gray-900/90 backdrop-blur-xl border border-white/10 p-6 max-w-sm w-full mx-4 shadow-2xl">
        {updateState === "available" && (
          <>
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-xl font-bold text-white mb-2">发现新版本</h3>
              {version && (
                <p className="text-sm text-white/60">版本 {version}</p>
              )}
              <p className="text-sm text-white/70 mt-3">
                有新的更新可用，是否立即下载？
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              >
                稍后
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                立即下载
              </button>
            </div>
          </>
        )}

        {updateState === "downloading" && (
          <div className="text-center">
            <div className="text-4xl mb-3">⏳</div>
            <h3 className="text-xl font-bold text-white mb-4">正在下载更新</h3>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-white/60">{Math.round(progress)}%</p>
          </div>
        )}

        {updateState === "downloaded" && (
          <>
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-xl font-bold text-white mb-2">更新下载完成</h3>
              <p className="text-sm text-white/70">
                重启应用以安装更新
              </p>
            </div>
            <button
              onClick={handleInstall}
              className="w-full px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              立即重启
            </button>
          </>
        )}

        {updateState === "error" && (
          <>
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">❌</div>
              <h3 className="text-xl font-bold text-white mb-2">更新失败</h3>
              <p className="text-sm text-white/70">
                检查更新时出错，请稍后再试
              </p>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="w-full px-4 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
            >
              关闭
            </button>
          </>
        )}
      </div>
    </div>
  );
}
