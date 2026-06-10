@echo off
title CKS Paket — Musteri ZIP olustur
cd /d "%~dp0"

echo.
echo === CKS PAKET — MUSTERI ZIP ===
echo Surum: package.json icindeki version alani kullanilir.
echo Yeni surum icin once package.json version degerini artirin.
echo.

set /p NOTLAR=Surum notu (opsiyonel): 

if "%NOTLAR%"=="" (
  node ckspaket-paketle.js
) else (
  node ckspaket-paketle.js %NOTLAR%
)

echo.
pause
