@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo   培训证书系统 - 本地启动
echo ==========================================
echo.
echo   学员端 : http://localhost:3001
echo   管理端 : http://localhost:3001/admin.html
echo   管理密码 : admin123
echo.
echo   正在启动服务，请勿关闭本窗口...
echo.
set PORT=3001
bin\node.exe server.js
echo.
pause
