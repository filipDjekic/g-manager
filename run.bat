@echo off
title G-Manager Launcher

echo ==============================
echo BUILD BACKEND
echo ==============================

cd backend

call mvnw.cmd clean package -DskipTests

if %errorlevel% neq 0 (
    echo Backend build FAILED
    pause
    exit /b
)

echo ==============================
echo START BACKEND
echo ==============================

start "G-Manager Backend" cmd /k java -jar target\gmanager-backend-0.0.1-SNAPSHOT.jar

timeout /t 5

echo ==============================
echo START FRONTEND
echo ==============================

cd ..\g-manager

call npm install

start "G-Manager Frontend" cmd /k npm run dev

timeout /t 5

echo ==============================
echo OPEN BROWSER
echo ==============================

start "" "C:\Program Files\Mozilla Firefox\firefox.exe" http://localhost:5173

exit