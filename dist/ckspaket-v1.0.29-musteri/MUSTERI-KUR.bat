@echo off
title CKS Paket v1.0.29 — Ilk Kurulum
cd /d "%~dp0"

echo.
echo ========================================
echo   CKS PAKET v1.0.29 — ILK KURULUM
echo ========================================
echo.
echo Bu klasor C:\ckspaket icinde olmali.
echo Ornek: C:\ckspaket\MUSTERI-KUR.bat
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo HATA: Node.js yuklu degil.
  echo Indirin: https://nodejs.org  ^(LTS surumu^)
  pause
  exit /b 1
)

if /i not "%CD%"=="C:\ckspaket" (
  echo UYARI: Su anki klasor C:\ckspaket degil: %CD%
  echo Dosyalari C:\ckspaket klasorune kopyalamaniz onerilir.
  echo.
)

if not exist ".env" (
  if exist ".env.musteri" (
    copy /Y ".env.musteri" ".env" >nul
    echo .env olusturuldu — SQL bilgilerini duzenleyin.
    notepad .env
  ) else (
    echo HATA: .env.musteri bulunamadi.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo.
  echo npm install calistiriliyor ^(ilk kurulum, birkaç dakika^)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo HATA: npm install basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo Masaustu kisayolu olusturuluyor...
wscript.exe //nologo "%~dp0kisayol-olustur.vbs"

echo.
echo Kurulum tamam. Program baslatiliyor...
call baslat.bat
