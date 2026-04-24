@echo off
SET BACKEND_PATH=backend
SET FRONTEND_PATH=g-manager
SET JAR_NAME=gmanager-backend-0.0.1-SNAPSHOT.jar
SET FRONTEND_URL=http://localhost:5173

echo [1/4] Pakovanje backenda...
cd %BACKEND_PATH%
call mvnw.cmd clean package -DskipTests
if %ERRORLEVEL% NEQ 0 (
    echo [GRESKA] Backend build nije uspeo!
    pause
    exit /b %ERRORLEVEL%
)

echo [2/4] Pokretanje backenda u novom prozoru...
start "Backend - GManager" cmd /k java -jar target\%JAR_NAME%

echo Cekanje da se backend inicijalizuje (10 sekundi)...
timeout /t 10 /nobreak

echo [3/4] Pokretanje frontenda...
cd ..\%FRONTEND_PATH%
start "Frontend - React/Vite" cmd /k npm run dev

echo Cekanje da se frontend pokrene (5 sekundi)...
timeout /t 5 /nobreak

echo [4/4] Otvaranje browsera...
start "" "C:\Program Files\Mozilla Firefox\firefox.exe" %FRONTEND_URL%

echo SVE JE POKRENUTO!
pause