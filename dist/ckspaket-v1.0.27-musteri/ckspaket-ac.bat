@echo off
title CKS Paket
cd /d "%~dp0"
call "%~dp0ckspaket-ag-ayar.bat"
start "" "%CKS_AC_URL%"
