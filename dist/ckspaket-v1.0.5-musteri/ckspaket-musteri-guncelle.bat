@echo off
title CKS Paket - Otomatik Guncelleme
cd /d "%~dp0"
set CKSPAKET=1
set CKS_PORT=3030
set PORT=3030

echo(
echo ========================================
echo   CKS PAKET - OTOMATIK GUNCELLEME
echo ========================================
echo(
echo Sunucu durduruluyor, guncelleme uygulanacak...
echo(

echo Port %CKS_PORT% temizleniyor...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%CKS_PORT%" ^| findstr LISTENING') do (
  echo   Kapatiliyor PID: %%a
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

node ckspaket-musteri-guncelle.js
if errorlevel 1 goto guncelleme_hata

echo(
echo Sunucu yeniden baslatiliyor...
call "%~dp0baslat.bat"
echo(
echo TAMAM - Guncelleme basarili. Tarayiciyi yenileyin.
timeout /t 5 /nobreak >nul
exit /b 0

:guncelleme_hata
echo(
echo GUNCELLEME BASARISIZ.
pause
exit /b 1
