@echo off
title CKS Paket — Musteri Surum Cikar
cd /d "%~dp0"
call ckspaket-ayar.bat

echo.
echo ========================================
echo   MUSTERI SURUM PAKETI
echo ========================================
echo.
echo Surum: otomatik artirilir (1.0.12 -^> 1.0.13)
echo         package.json + surum.json + guncelleme.json guncellenir
echo.
echo Olusturulacak:
echo   dist\ckspaket-vX.X.X-musteri\   ^<- C:\ckspaket'e kopyalanir
echo   dist\ckspaket-vX.X.X-musteri.zip
echo.
echo Musteri: klasoru C:\ckspaket'e atar, MUSTERI-KUR.bat calistirir.
echo.

set /p NOTLAR=Surum notu (Enter = bos): 

if "%NOTLAR%"=="" (
  node ckspaket-paketle.js --musteri --artir
) else (
  node ckspaket-paketle.js --musteri --artir %NOTLAR%
)

echo.
echo dist klasorunu acmak icin bir tusa basin...
pause >nul
explorer dist
