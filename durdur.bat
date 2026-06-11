@echo off
title CKS Paket — Durdur
cd /d "%~dp0"
call ckspaket-ayar.bat 2>nul
if not defined CKS_PORT set CKS_PORT=3030

echo(
echo CKS Paket sunucusu durduruluyor...
echo(
call "%~dp0port-temizle.bat" %CKS_PORT%
echo(
timeout /t 2 /nobreak >nul
