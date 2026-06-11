@echo off
REM === CKS Paket ag ayarlari ===
REM Ana CKS (c:\cks) ile ayni anda calisabilir — farkli port

set CKS_SUNUCU_IP=192.168.1.123
set CKS_PORT=3030
set PORT=3030
set CKSPAKET=1
set CKS_BASE_URL=http://%CKS_SUNUCU_IP%:%CKS_PORT%
set CKS_LOCAL_URL=http://127.0.0.1:%CKS_PORT%

if exist "C:\ckspaket\server.js" (
  set CKS_KOK=C:\ckspaket
) else (
  set "CKS_KOK=%~dp0"
  set "CKS_KOK=%CKS_KOK:~0,-1%"
)
