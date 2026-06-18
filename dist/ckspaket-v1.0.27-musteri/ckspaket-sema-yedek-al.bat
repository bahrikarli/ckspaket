@echo off
title CKS Paket — Sema yedegi al (gelistirici)
cd /d "%~dp0"
call ckspaket-ayar.bat 2>nul

echo.
echo ckspaketdata sema yedegi aliniyor...
echo Bu dosya musteri paketine eklenir: sema\ckspaketdata-sema.bak
echo.

if not exist sema mkdir sema

node ckspaket-sema-yedek-al.js
if errorlevel 1 (
  echo.
  echo Yedek alinamadi. SQL sunucusunda manuel:
  echo   BACKUP DATABASE ckspaketdata TO DISK = 'C:\ckspaket\sema\ckspaketdata-sema.bak'
  pause
  exit /b 1
)

echo.
echo Tamam: sema\ckspaketdata-sema.bak
pause
