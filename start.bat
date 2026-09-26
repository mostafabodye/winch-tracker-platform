@echo off
title Winch Tracking & Marketing Dispatch Platform
echo ====================================================
echo  Starting Winch Platform on D: Drive...
echo ====================================================
cd /d "%~dp0"
"D:\tools\nodejs\node.exe" server.js
pause
