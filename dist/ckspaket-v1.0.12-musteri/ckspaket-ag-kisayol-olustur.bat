@echo off
title CKS Paket — Ag kisayolu
cd /d "%~dp0"

if not exist "%~dp0ckspaket-ac.vbs" (
  echo HATA: ckspaket-ac.vbs bulunamadi!
  pause
  exit /b 1
)

echo(
echo CKS Paket ag kisayolu olusturuluyor...
echo Sunucu: 
call "%~dp0ckspaket-ag-ayar.bat"
echo   %CKS_AC_URL%
echo(
echo Masaustune "CKS Paket" simgesi konacak.
echo(
pause

wscript.exe //nologo "%~dp0ag-kisayol-olustur.vbs"
echo(
pause
