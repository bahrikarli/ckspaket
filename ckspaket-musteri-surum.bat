@echo off
title CKS Paket — Musteri Surum Cikar
cd /d "%~dp0"
call ckspaket-ayar.bat

echo.
echo ========================================
echo   MUSTERI SURUM PAKETI
echo ========================================
echo.
echo Surum: package.json icindeki version (simdiki paket)
echo.
echo Olusturulacak:
echo   dist\ckspaket-vX.X.X-musteri\   ^<- C:\ckspaket'e kopyalanir
echo   dist\ckspaket-vX.X.X-musteri.zip
echo.
echo Musteri: klasoru C:\ckspaket'e atar, MUSTERI-KUR.bat calistirir.
echo.

set /p NOTLAR=Surum notu (Enter = bos): 

if "%NOTLAR%"=="" (
  node ckspaket-paketle.js --musteri
) else (
  node ckspaket-paketle.js --musteri %NOTLAR%
)

echo.
echo dist klasorunu acmak icin bir tusa basin...
pause >nul
explorer dist
