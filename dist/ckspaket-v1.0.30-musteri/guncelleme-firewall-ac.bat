@echo off
REM Gelistirici makinede — musteri guncellemesi icin port 3030 ac
cd /d "%~dp0"
set PORT=3030
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="PORT" set PORT=%%b
)

echo Windows Firewall — TCP %PORT% gelen baglanti aciliyor...
netsh advfirewall firewall add rule name="CKS Paket Guncelleme %PORT%" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>&1
if errorlevel 1 (
  echo HATA: Yonetici olarak calistirin — sag tik ^> Yonetici olarak calistir
  pause
  exit /b 1
)

echo Tamam. Musteri su adresi kullanabilir:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto ip_bulundu
)
:ip_bulundu
for /f "tokens=* delims= " %%a in ("%IP%") do set IP=%%a
echo   GUNCELLEME_URL=http://%IP%:%PORT%/guncellemeler/guncelleme.json
echo.
pause
