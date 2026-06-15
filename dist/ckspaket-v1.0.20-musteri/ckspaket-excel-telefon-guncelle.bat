@echo off
title CKS Paket — Telefon guncelleme (TC ile)
cd /d "%~dp0"

if not exist "%~dp0ckspaket-excel-telefon-guncelle.js" (
  echo HATA: ckspaket-excel-telefon-guncelle.js bulunamadi!
  pause
  exit /b 1
)

if "%~1"=="" (
  echo(
  echo Kullanim:
  echo   ckspaket-excel-telefon-guncelle.bat "C:\ckspaket\yol\tel.csv"
  echo   ckspaket-excel-telefon-guncelle.bat "C:\ckspaket\yol\tel.csv" uygula
  echo(
  echo CSV basliklari: tc ^(veya Tc Kimlik No^) + tel
  echo(
  pause
  exit /b 1
)

set "DOSYA=%~1"
if /i "%~2"=="uygula" (
  node ckspaket-excel-telefon-guncelle.js "%DOSYA%" --uygula
) else (
  node ckspaket-excel-telefon-guncelle.js "%DOSYA%"
)

echo(
pause
