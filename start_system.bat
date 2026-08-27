@echo off
title E-ISSP System Starter

echo ===================================================
echo [1/4] Cleaning up lingering background processes...
echo ===================================================
:: Terminate lingering python/uvicorn on 8000 and vite on 5173 to prevent conflicts
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a 2>nul

echo ===================================================
echo [2/4] Starting E-ISSP System Services...
echo ===================================================

:: 1. Start Redis (Remove the 'REM' below if your Redis does not start automatically)
REM start "Redis Server" cmd /k "redis-server"

:: 2. Start FastAPI Backend (Uses dynamic relative path %~dp0)
echo Starting FastAPI Backend...
start "FastAPI Backend" cmd /k "cd /d "%~dp0" && powershell -NoExit -Command Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"

:: 3. Start Celery Worker
echo Starting Celery Worker...
start "Celery Worker" cmd /k "cd /d "%~dp0" && powershell -NoExit -Command Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; .\venv\Scripts\Activate.ps1; celery -A app.celery_app worker -P solo --loglevel=info"

:: 4. Start Vite Frontend (Clears Vite cache automatically on launch with --force)
echo Starting Frontend...
start "Vite Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --force"

echo ===================================================
echo All services launched. You can close this window.
echo ===================================================
pause