@echo off
echo Starting G-Manager backend...

REM koristi Maven wrapper
call mvnw.cmd clean spring-boot:run

pause