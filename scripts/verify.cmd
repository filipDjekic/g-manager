@echo off
setlocal

where java >nul 2>nul
if errorlevel 1 (
    echo Java 21 is required.
    exit /b 1
)

for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /i "version"') do set "JAVA_VERSION=%%~V"
echo %JAVA_VERSION% | findstr /b "21." >nul
if errorlevel 1 (
    echo Java 21 is required. Found %JAVA_VERSION%.
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js 22 or newer is required.
    exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node --version') do set "NODE_MAJOR=%%V"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 22 (
    echo Node.js 22 or newer is required.
    exit /b 1
)

pushd "%~dp0..\gm"
call mvnw.cmd clean verify
if errorlevel 1 goto :failure
popd

pushd "%~dp0..\frontend\g-manager"
call npm.cmd ci
if errorlevel 1 goto :failure
call npm.cmd run lint
if errorlevel 1 goto :failure
call npm.cmd run typecheck
if errorlevel 1 goto :failure
call npm.cmd test
if errorlevel 1 goto :failure
call npm.cmd run build
if errorlevel 1 goto :failure
popd

echo G-Manager verification completed successfully.
exit /b 0

:failure
set "VERIFY_EXIT=%ERRORLEVEL%"
popd
echo G-Manager verification failed with exit code %VERIFY_EXIT%.
exit /b %VERIFY_EXIT%
