@echo off
title CKS Paket — Excel/CSV dilekce aktarimi
cd /d "%~dp0"

if not exist "%~dp0ckspaket-excel-dilekce-aktar.js" (
  echo(
  echo HATA: ckspaket-excel-dilekce-aktar.js bulunamadi!
  echo Bu dosyayi C:\ckspaket klasorune kopyalamaniz gerekiyor.
  echo Birlikte olmasi gereken dosyalar:
  echo   ckspaket-excel-dilekce-aktar.js
  echo   ckspaket-excel-dilekce-aktar.bat
  echo(
  pause
  exit /b 1
)

if "%~1"=="" (
  echo(
  echo Dilekce aktarimi:
  echo   ckspaket-excel-dilekce-aktar.bat "C:\ckspaket\yol\dilekce.csv"
  echo   ckspaket-excel-dilekce-aktar.bat "C:\ckspaket\yol\dilekce.csv" uygula yil=2025
  echo(
  echo TRGM/TKGM guncelle — ayri Excel, TC ile eslestir:
  echo   ckspaket-excel-dilekce-aktar.bat "C:\ckspaket\yol\trgm.csv" tc-tkgm yil=2025
  echo   ckspaket-excel-dilekce-aktar.bat "C:\ckspaket\yol\trgm.csv" tc-tkgm yil=2025 uygula
  echo(
  echo TRGM/TKGM guncelle — ciftci CSV ^(Kimlik + tkgm^):
  echo   ckspaket-excel-dilekce-aktar.bat "C:\ckspaket\yol\ciftciler.csv" tkgm yil=2025 uygula
  echo(
  pause
  exit /b 1
)

set "DOSYA=%~1"
set "EK="
set "YIL="
set "TKGM="

if /i "%~2"=="uygula" set "EK=--uygula"
if /i "%~3"=="uygula" set "EK=--uygula"
if /i "%~4"=="uygula" set "EK=--uygula"
if /i "%~5"=="uygula" set "EK=--uygula"

if /i "%~2"=="tkgm" set "TKGM=--tkgm-guncelle"
if /i "%~3"=="tkgm" set "TKGM=--tkgm-guncelle"
if /i "%~4"=="tkgm" set "TKGM=--tkgm-guncelle"

if /i "%~2"=="tc-tkgm" set "TKGM=--tkgm-tc"
if /i "%~3"=="tc-tkgm" set "TKGM=--tkgm-tc"
if /i "%~4"=="tc-tkgm" set "TKGM=--tkgm-tc"

for %%A in (%*) do (
  echo %%A | findstr /i "^yil=" >nul && set "YIL=--%%A"
)

node ckspaket-excel-dilekce-aktar.js "%DOSYA%" %TKGM% %YIL% %EK%

echo(
pause
