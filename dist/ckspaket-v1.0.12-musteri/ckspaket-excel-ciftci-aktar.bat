@echo off
title CKS Paket — Excel/CSV ciftci aktarimi
cd /d "%~dp0"

if "%~1"=="" (
  echo(
  echo Kullanim:
  echo   ckspaket-excel-ciftci-aktar.bat "C:\yol\ciftciler.csv"
  echo   ckspaket-excel-ciftci-aktar.bat "C:\yol\ciftciler.csv" uygula
  echo(
  echo Excel: Dosya ^> Farkli Kaydet ^> CSV UTF-8
  echo(
  pause
  exit /b 1
)

set "DOSYA=%~1"
if /i "%~2"=="uygula" (
  node ckspaket-excel-ciftci-aktar.js "%DOSYA%" --uygula
) else (
  node ckspaket-excel-ciftci-aktar.js "%DOSYA%"
)

echo(
pause
