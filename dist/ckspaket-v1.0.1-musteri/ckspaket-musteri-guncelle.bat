@echo off
title CKS Paket — Otomatik Guncelleme
cd /d "%~dp0"
call ckspaket-ayar.bat

echo.
echo ========================================
echo   CKS PAKET — OTOMATIK GUNCELLEME
echo ========================================
echo.
echo Sunucu durduruluyor, guncelleme uygulanacak, sunucu yeniden acilacak...
echo.

echo Port %CKS_PORT% temizleniyor...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%CKS_PORT%" ^| findstr LISTENING') do (
  echo   Kapatiliyor PID: %%a
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

node ckspaket-musteri-guncelle.js
if errorlevel 1 (
  echo.
  echo GUNCELLEME BASARISIZ.
  pause
  exit /b 1
)

echo.
echo Sunucu yeniden baslatiliyor...
start "CKS Paket Sunucu" cmd /c "%~dp0ckspaket-baslat.bat"
echo.
echo Tamamlandi. Tarayiciyi birkaç saniye sonra yenileyin.
timeout /t 5 /nobreak >nul
