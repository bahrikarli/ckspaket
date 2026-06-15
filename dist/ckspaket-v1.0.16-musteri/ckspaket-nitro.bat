@echo off
setlocal enabledelayedexpansion
title CKS Paket — Nitro Belgenet Baslatici (port 3030)
cd /d "%~dp0"
call "%~dp0ckspaket-ayar.bat"

if not defined CKS_PORT set CKS_PORT=3030
if not defined CKS_LOCAL_URL set CKS_LOCAL_URL=http://127.0.0.1:%CKS_PORT%
if not defined CHROME_ROBOT_PORT set CHROME_ROBOT_PORT=9222

echo.
echo ======================================================
echo   CKS PAKET — NITRO BELGENET OTOMATIK SEKMELER
echo   Klasor : %CKS_KOK%
echo   CKS    : %CKS_LOCAL_URL%
echo   Robot  : port %CHROME_ROBOT_PORT%
echo ======================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo HATA: Node.js kurulu degil veya PATH icinde yok.
  echo       https://nodejs.org — LTS surumunu kurun, bilgisayari yeniden baslatin.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo HATA: node_modules yok.
  echo       Once MUSTERI-KUR.bat calistirin.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.musteri" (
    copy /Y ".env.musteri" ".env" >nul
  ) else (
    echo HATA: .env dosyasi yok. MUSTERI-KUR.bat calistirin.
    echo.
    pause
    exit /b 1
  )
)

echo [1/4] Eski Chrome ve CKS sunucusu temizleniyor...
taskkill /f /im chrome.exe >nul 2>&1
call "%~dp0port-temizle.bat" %CKS_PORT%
timeout /t 3 /nobreak >nul

echo [2/4] CKS Paket sunucusu baslatiliyor (port %CKS_PORT%)...
if not exist "logs" mkdir logs
echo.>> logs\server.log
echo ===== nitro baslat %DATE% %TIME% =====>> logs\server.log
wscript //Nologo "%~dp0sunucu-baslat.vbs"

call "%~dp0sunucu-bekle.bat" %CKS_PORT% 60
if errorlevel 1 (
  echo.
  echo HATA: Sunucu port %CKS_PORT% uzerinde acilmadi!
  echo.
  echo --- logs\server.log son satirlar ---
  if exist "logs\server.log" (
    powershell -NoProfile -Command "Get-Content -Path 'logs\server.log' -Tail 25 -ErrorAction SilentlyContinue"
  ) else (
    echo   ^(log dosyasi olusmadi — node bulunamamis olabilir^)
  )
  echo ------------------------------------
  echo.
  echo Cozum onerileri:
  echo   1^) sunucu-test.bat calistirin — hatayi ekranda gorursunuz
  echo   2^) SQL Server acik mi? .env icinde DB_SERVER=localhost olmali
  echo   3^) MUSTERI-KUR.bat ile npm install yapilmis mi?
  echo.
  pause
  exit /b 1
)

echo       Sunucu hazir.
echo [3/4] Robot Chrome aciliyor (3 sekme)...
start "" chrome ^
  --remote-debugging-port=%CHROME_ROBOT_PORT% ^
  --remote-allow-origins=* ^
  --user-data-dir="C:\chrome_robot" ^
  "%CKS_LOCAL_URL%" ^
  "https://belgenet.tzob.org.tr" ^
  "http://127.0.0.1:%CHROME_ROBOT_PORT%/json/version"

echo [4/4] Tamamlandi.
echo.
echo ------------------------------------------------------
echo  SEKME 1 : %CKS_LOCAL_URL%
echo            ^(CKS Paket — Belgenet islemleri buradan^)
echo  SEKME 2 : https://belgenet.tzob.org.tr
echo            ^(Belgenet giris — robot burada calisir^)
echo  SEKME 3 : http://127.0.0.1:%CHROME_ROBOT_PORT%/json/version
echo            ^(Robot kapisi acik mi — JSON yazisi gorunmeli^)
echo ------------------------------------------------------
echo  Agdan baska PC baglanacaksa Windows guvenlik duvarinda
echo  gelen kural: TCP port %CHROME_ROBOT_PORT%
echo  CKS arayuzu agdan: %CKS_BASE_URL%
echo ------------------------------------------------------
echo.
pause
