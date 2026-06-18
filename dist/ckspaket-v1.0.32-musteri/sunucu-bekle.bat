@echo off
REM Sunucu /api/health yanit verene kadar bekler
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3030"
set "MAX=%~2"
if "%MAX%"=="" set "MAX=60"

powershell -NoProfile -Command ^
  "$port='%PORT%'; $max=[int]'%MAX%'; $url='http://127.0.0.1:'+$port+'/api/health';" ^
  "for($i=0; $i -lt $max; $i++) { try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 2 };" ^
  "exit 1"
exit /b %ERRORLEVEL%
