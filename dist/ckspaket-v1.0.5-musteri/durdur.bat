@echo off
title CKS Paket — Durdur
cd /d "%~dp0"
call ckspaket-ayar.bat 2>nul
if not defined CKS_PORT set CKS_PORT=3030

echo.
echo CKS Paket sunucusu durduruluyor (port %CKS_PORT%)...
echo.

set KAPAT=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%CKS_PORT%" ^| findstr LISTENING') do (
  echo   PID %%a kapatiliyor...
  taskkill /F /PID %%a >nul 2>&1
  set KAPAT=1
)

if "%KAPAT%"=="0" (
  echo Sunucu zaten calismiyor.
) else (
  echo Sunucu durduruldu.
)
echo.
timeout /t 3 /nobreak >nul
