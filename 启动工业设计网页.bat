@echo off
chcp 65001 >nul
title 工业设计智能体 1.7 网页版

cd /d "%~dp0industrial-1.7-web"

echo ========================================
echo   工业设计智能体 1.7 网页版
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

if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [启动] http://localhost:3002
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3002"
call npm run dev
pause
