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

wscript.exe //nologo "%~dp0baslat-launcher.vbs"
exit /b 0
