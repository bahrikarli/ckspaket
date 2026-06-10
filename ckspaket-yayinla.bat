@echo off
title CKS Paket — Tek Tusla Yayin
cd /d "%~dp0"
call ckspaket-ayar.bat

echo.
echo ========================================
echo   CKS PAKET — TEK TUSLA YAYIN
echo ========================================
echo.
echo Otomatik yapilacaklar:
echo   1) Ana CKS senkronu (c:\cks varsa)
echo   2) Surum numarasi artirma (1.0.0 -^> 1.0.1)
echo   3) Git commit + push + tag (Git varsa)
echo   4) ZIP yedek (Git yoksa)
echo.
echo Sunucu IP: %CKS_SUNUCU_IP%  Port: %CKS_PORT%
echo.

set /p NOTLAR=Surum notu (Enter = otomatik): 

if "%NOTLAR%"=="" (
  node ckspaket-yayinla.js
) else (
  node ckspaket-yayinla.js %NOTLAR%
)

echo.
pause
