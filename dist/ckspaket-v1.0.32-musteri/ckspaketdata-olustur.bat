@echo off
title CKS Paket — ckspaketdata veritabani
cd /d "%~dp0"

echo.
echo === ckspaketdata VERITABANI ===
echo Kaynak: demoanaa  ^|  Hedef: ckspaketdata
echo.
echo [1] Sadece sema (bos tablolar)
echo [2] Sema + veri kopyala (demoanaa icerigi)
echo.
set /p SEC=Seciminiz (1/2): 

if "%SEC%"=="2" (
  node ckspaketdata-olustur.js --uygula --veri
) else (
  node ckspaketdata-olustur.js --uygula
)

echo.
pause
