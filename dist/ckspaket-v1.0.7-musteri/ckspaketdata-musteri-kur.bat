@echo off
title CKS Paket — SQL ckspaketdata (musteri)
cd /d "%~dp0"

echo.
echo ========================================
echo   SQL EXPRESS — ckspaketdata KURULUM
echo ========================================
echo.
echo localhost SQL Server uzerinde
echo ckspaketdata veritabani olusturulacak.
echo.
echo ONCE: SQL Server kurulu olmali (default instance — localhost)
echo       Mixed Mode + sa sifresi (189189 veya .env)
echo.

if not exist "sema\ckspaketdata-sema.bak" (
  echo HATA: sema\ckspaketdata-sema.bak yok.
  echo Gelistiriciden guncel musteri paketini isteyin.
  pause
  exit /b 1
)

node ckspaketdata-musteri-kur.js
if errorlevel 1 pause & exit /b 1

echo.
pause
