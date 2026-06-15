@echo off
REM CKS Paket — arka plan sunucu (sunucu-baslat.vbs cagirir, pencere acilmaz)
cd /d "%~dp0"
set CKSPAKET=1

if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="PORT" set "PORT=%%b"
    if /i "%%a"=="DB_SERVER" set "DB_SERVER=%%b"
  )
)
if not defined PORT set PORT=3030

if not exist "node_modules\" exit /b 2

set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do (
  set "NODE_EXE=%%i"
  goto :node_bulundu
)
:node_bulundu
if not defined NODE_EXE exit /b 3

if not exist "logs\" mkdir logs
"%NODE_EXE%" "%~dp0server.js" >> "%~dp0logs\server.log" 2>&1
exit /b %ERRORLEVEL%
