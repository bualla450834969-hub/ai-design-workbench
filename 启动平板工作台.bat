@echo off
chcp 65001 >nul
title 工业设计智能体 · 本地网页版

cd /d "%~dp0"

echo ========================================
echo   工业设计智能体 · 本地平板网页版
echo   http://localhost:3001
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 24.x
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [启动] 开发服务器启动后会打开浏览器
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3001"
call npm run dev

pause
