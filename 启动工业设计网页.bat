@echo off
chcp 65001 >nul
title 工业设计智能体桌面网页
cd /d "%~dp0industrial-1.7-web"

echo ========================================
echo   工业设计智能体 1.9.0
echo   桌面客户端界面（浏览器）
echo   建议仓库路径: D:\ai-industrial-web
echo   端口: 3002
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\next" (
    echo [提示] 正在安装运行依赖...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [启动] http://127.0.0.1:3002
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:3002"

rem Desktop kernel after license auth. Do not set WEB_LOCAL_MODE or
rem NEXT_PUBLIC_WEB_LOCAL_MODE: that path answers POST /api/projects with 410.
set DESKTOP_MODE=true
set WEB_MODE=
set WEB_LOCAL_MODE=
set NEXT_PUBLIC_WEB_MODE=
set NEXT_PUBLIC_WEB_LOCAL_MODE=
set PORT=3002
set HOSTNAME=0.0.0.0
call npx next start -H 0.0.0.0 -p 3002
if %errorlevel% neq 0 (
    echo [提示] next start 未成功，改用安装包入口 server.js
    node server.js
)
pause
