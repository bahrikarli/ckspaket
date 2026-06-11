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

call "%~dp0port-temizle.bat" %CKS_PORT%

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
