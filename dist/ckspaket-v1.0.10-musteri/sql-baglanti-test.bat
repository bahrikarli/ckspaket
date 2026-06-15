@echo off
title CKS Paket — SQL baglanti testi
cd /d "%~dp0"
echo.
echo SQL baglanti testi (.env: sa / ckspaketdata)
echo.

set PASS=189189
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="DB_PASS" set PASS=%%b
    if /i "%%a"=="DB_USER" set USER=%%b
    if /i "%%a"=="DB_NAME" set DB=%%b
  )
)
if not defined USER set USER=sa
if not defined DB set DB=ckspaketdata

echo Kullanici: %USER%   Veritabani: %DB%
echo.

set OK=0
for %%S in (localhost "localhost\SQLEXPRESS" ".\SQLEXPRESS" "(local)\SQLEXPRESS" "%COMPUTERNAME%" "%COMPUTERNAME%\SQLEXPRESS") do (
  echo Deneniyor: %%~S
  sqlcmd -S %%~S -U %USER% -P %PASS% -d %DB% -Q "SELECT 1 AS test" -W -h-1 2>nul | findstr /R "^1$" >nul
  if not errorlevel 1 (
    echo   *** BASARILI: %%~S ***
    echo.
    echo .env dosyaniza su satiri yazin:
    echo DB_SERVER=%%~S
    echo.
    set OK=1
    goto :bitti
  ) else (
    echo   basarisiz
  )
)

:bitti
if "%OK%"=="0" (
  echo.
  echo Hicbiri baglanmadi.
  echo.
  echo Kontrol:
  echo  1) SSMS - sa sifresi .env ile ayni mi? ^(189189^)
  echo  2) sa hesabi Enabled mi?
  echo  3) TCP/IP - IP4 127.0.0.1 Enabled Yes, port 1433
  echo  4) SQL Server servisi calisiyor mu?
)

echo.
pause
