@echo off
title CKS Paket Sunucu (port 3030)
call "%~dp0ckspaket-ayar.bat"
cd /d "%CKS_KOK%"

echo.
echo === CKS PAKET ===
echo Klasor: %CKS_KOK%
echo Sunucu: %CKS_BASE_URL%
echo (Ana CKS port 3000 ile birlikte calisabilir)
echo.

echo === Port %CKS_PORT% temizleniyor ===
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%CKS_PORT%" ^| findstr LISTENING') do (
  echo Kapatiliyor PID: %%a
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

set CKS_BIND_HOST=%CKS_SUNUCU_IP%

echo === Sunucu basliyor ===
echo Kapatmak icin bu pencereyi kapatin veya Ctrl+C
echo.
"C:\Program Files\nodejs\node.exe" server.js
if errorlevel 1 (
  echo.
  echo HATA: Sunucu baslamadi. npm install denediniz mi?
)
pause
