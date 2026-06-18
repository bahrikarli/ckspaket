@echo off
REM CKS Paket — Program baslat (sunucu gizli + tarayici)
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

netstat -ano 2>nul | findstr ":%PORT%" | findstr "LISTENING" >nul
if errorlevel 1 (
  if not exist "logs" mkdir logs
  wscript //Nologo "%~dp0sunucu-baslat.vbs"
  call "%~dp0sunucu-bekle.bat" %PORT% 60
) else (
  call "%~dp0sunucu-bekle.bat" %PORT% 5
)

start "" "http://127.0.0.1:%PORT%"
exit /b 0
