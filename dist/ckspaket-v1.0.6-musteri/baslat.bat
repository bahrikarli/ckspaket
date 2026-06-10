@echo off
REM CKS Paket — Program baslat (sunucu arka planda + tarayici)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  mshta "javascript:alert('Node.js kurulu degil.\n\nhttps://nodejs.org adresinden LTS surumunu indirin.');close()"
  exit /b 1
)

if not exist ".env" (
  if exist ".env.musteri" (
    copy /Y ".env.musteri" ".env" >nul
  ) else (
    mshta "javascript:alert('.env dosyasi bulunamadi.\nOnce MUSTERI-KUR.bat calistirin.');close()"
    exit /b 1
  )
)

if not exist "node_modules" (
  mshta "javascript:alert('node_modules yok.\nOnce MUSTERI-KUR.bat calistirin.');close()"
  exit /b 1
)

set CKSPAKET=1
set PORT=3030
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="PORT" set PORT=%%b
)

set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do set "NODE=%%i"
if not defined NODE (
  mshta "javascript:alert('Node.js bulunamadi.');close()"
  exit /b 1
)

netstat -ano 2>nul | findstr ":%PORT%" | findstr "LISTENING" >nul
if errorlevel 1 (
  if not exist "logs" mkdir logs
  start "CKSPaket" /D "%~dp0" cmd /V:ON /C "set CKSPAKET=1&& "%NODE%" "%~dp0server.js" >> "%~dp0logs\server.log" 2>&1"
  ping 127.0.0.1 -n 6 >nul
)

start "" "http://127.0.0.1:%PORT%"
exit /b 0
