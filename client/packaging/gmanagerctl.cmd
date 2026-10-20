@echo off
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File "%~dp0gmanagerctl.ps1" %*
exit /b %errorlevel%
