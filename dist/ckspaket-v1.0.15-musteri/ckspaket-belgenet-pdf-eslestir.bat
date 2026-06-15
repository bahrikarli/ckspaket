@echo off
title CKS Paket — PDF belgenet eslestirme
cd /d "%~dp0"

if not exist "%~dp0ckspaket-belgenet-pdf-eslestir.js" (
  echo HATA: ckspaket-belgenet-pdf-eslestir.js bulunamadi!
  pause
  exit /b 1
)

if "%~1"=="" (
  echo(
  echo Kullanim:
  echo   ckspaket-belgenet-pdf-eslestir.bat
  echo   ckspaket-belgenet-pdf-eslestir.bat yil=2026
  echo   ckspaket-belgenet-pdf-eslestir.bat yil=2026 uygula
  echo(
  echo PDF klasoru: taramalar\2026cks ^(veya ayarlardan^)
  echo Dosya adinda TC veya vergi no olmali.
  echo(
  pause
  exit /b 1
)

set "YIL="
set "EK="
for %%A in (%*) do (
  echo %%A | findstr /i "^yil=" >nul && set "YIL=--%%A"
  if /i "%%A"=="uygula" set "EK=--uygula"
)

if defined YIL (
  if defined EK (
    node ckspaket-belgenet-pdf-eslestir.js %YIL% %EK%
  ) else (
    node ckspaket-belgenet-pdf-eslestir.js %YIL%
  )
) else (
  if defined EK (
    node ckspaket-belgenet-pdf-eslestir.js %EK%
  ) else (
    node ckspaket-belgenet-pdf-eslestir.js
  )
)

echo(
pause
