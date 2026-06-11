@echo off
title CKS Paket — TCP SQL testi (Node ile ayni yol)
cd /d "%~dp0"
echo.
echo sqlcmd "localhost" calisip program calismiyorsa TCP ayari eksiktir.
echo Node.js TCP kullanir; sqlcmd bazen Named Pipe ile baglanir.
echo.
echo --- Test 1: localhost (sqlcmd gibi) ---
sqlcmd -S localhost -U sa -P 189189 -Q "SELECT 1" -W -h-1
echo.
echo --- Test 2: TCP 127.0.0.1,1433 (Node gibi) ---
sqlcmd -S 127.0.0.1,1433 -U sa -P 189189 -Q "SELECT 1" -W -h-1
if errorlevel 1 (
  echo.
  echo TCP BASARISIZ — SQL Configuration Manager:
  echo   IP4 ^(127.0.0.1^) Enabled: Yes
  echo   IPAll TCP Dynamic Ports: BOS
  echo   IPAll TCP Port: 1433
  echo   SQL servisini Restart
) else (
  echo.
  echo TCP OK — .env dosyasina ekleyin veya degistirin:
  echo   DB_SERVER=127.0.0.1
  echo   DB_PORT=1433
)
echo.
pause
