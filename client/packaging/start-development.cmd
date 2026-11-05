@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-development.ps1" %*
exit /b %errorlevel%
