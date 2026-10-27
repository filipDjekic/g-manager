@echo off
powershell.exe -STA -NoProfile -ExecutionPolicy AllSigned -File "%~dp0gmanagerctl.ps1" %*
exit /b %errorlevel%
