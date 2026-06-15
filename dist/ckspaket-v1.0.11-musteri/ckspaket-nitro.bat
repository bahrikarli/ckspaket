@echo off
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

echo [1/4] Eski Chrome ve CKS sunucusu temizleniyor...
taskkill /f /im chrome.exe >nul 2>&1
call "%~dp0port-temizle.bat" %CKS_PORT% >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] CKS Paket sunucusu baslatiliyor (port %CKS_PORT%)...
if not exist "logs" mkdir logs
wscript //Nologo "%~dp0sunucu-baslat.vbs"
echo       Sunucu bekleniyor...
ping 127.0.0.1 -n 6 >nul

netstat -ano 2>nul | findstr ":%CKS_PORT%" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo.
  echo HATA: Sunucu port %CKS_PORT% uzerinde acilmadi!
  echo       logs\server.log dosyasina bakin veya MUSTERI-KUR.bat calistirin.
  echo.
  pause
  exit /b 1
)

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
