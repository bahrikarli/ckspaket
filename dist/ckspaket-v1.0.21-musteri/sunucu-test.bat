@echo off
title CKS Paket — Sunucu Test (hata gorunur)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo HATA: Node.js kurulu degil.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.musteri" copy /Y ".env.musteri" ".env" >nul
)

if not exist "node_modules\" (
  echo HATA: node_modules yok. MUSTERI-KUR.bat calistirin.
  pause
  exit /b 1
)

set CKSPAKET=1
echo.
echo Sunucu baslatiliyor — hata varsa asagida gorunur.
echo Kapatmak icin Ctrl+C
echo.
node server.js
echo.
echo Sunucu kapandi.
pause
