@echo off
REM Portu dinleyen tum surecleri kapat (cmd + node agaci dahil)
setlocal enabledelayedexpansion
set "HEDEF_PORT=%~1"
if not defined HEDEF_PORT set "HEDEF_PORT=3030"

if exist "%~dp0.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%~dp0.env") do (
    if /i "%%a"=="PORT" set "HEDEF_PORT=%%b"
  )
)

echo Port !HEDEF_PORT! temizleniyor...

for /L %%r in (1,1,6) do (
  set "KAPAT=0"
  for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":!HEDEF_PORT!" ^| findstr "LISTENING"') do (
    echo   PID %%a kapatiliyor...
    taskkill /F /T /PID %%a >nul 2>&1
    set "KAPAT=1"
  )
  taskkill /F /FI "WINDOWTITLE eq CKSPaket" >nul 2>&1
  if "!KAPAT!"=="0" goto port_bitti
  timeout /t 1 /nobreak >nul
)

:port_bitti
netstat -ano 2>nul | findstr ":!HEDEF_PORT!" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Port !HEDEF_PORT! bos.
) else (
  echo UYARI: Port !HEDEF_PORT! hala kullanimda — gorev yoneticisinden node.exe kontrol edin.
)
endlocal
