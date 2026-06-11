@echo off
REM CKS Paket — arka plan sunucu (baslat-launcher.vbs cagirir)
cd /d "%~dp0"
set CKSPAKET=1

if not exist ".env" (
  if exist ".env.musteri" copy /Y ".env.musteri" ".env" >nul
)

if not exist "node_modules\" exit /b 2

if not exist "logs\" mkdir logs

set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do (
  set "NODE_EXE=%%i"
  goto :node_bulundu
)
:node_bulundu
if not defined NODE_EXE exit /b 3

wscript //Nologo "%~dp0sunucu-baslat.vbs"
exit /b 0
