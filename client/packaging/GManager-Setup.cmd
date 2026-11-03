@echo off
rem Use a separate Windows administrator session. AllSigned remains enforced.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy AllSigned -File "%~dp0GManager-SetupWizard.ps1" -PackageDirectory "%~dp0."
if errorlevel 1 (
  echo G-Manager Setup failed. Review the message above and the protected recovery audit.
  pause
  exit /b 1
)
pause
