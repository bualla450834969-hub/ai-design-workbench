@echo off
chcp 65001 >nul
title AI 产品外观重构工作台

cd /d "%~dp0"

echo ========================================
echo   AI 产品外观重构工作台
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 22.x
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [完成] 依赖安装成功
    echo.
)

REM 检查是否已构建
if not exist "apps\web\.next" (
    echo [提示] 首次运行，正在构建项目...
    call npm run build
    if %errorlevel% neq 0 (
        echo [错误] 构建失败
        pause
        exit /b 1
    )
    echo [完成] 构建成功
    echo.
)

echo [启动] 正在启动服务器...
echo [提示] 关闭此窗口即可停止服务器
echo.

REM 延迟3秒后打开浏览器
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3001"

REM 启动服务器（当前窗口）
cd /d "%~dp0apps\web"
npm run start -- -p 3001

pause
