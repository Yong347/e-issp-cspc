@echo off
title E-ISSP System Starter

echo ===========================================
echo Starting E-ISSP System Services...
echo ===========================================

:: 1. Start Redis (Remove the 'REM' below if your Redis does not start automatically)
REM start "Redis Server" cmd /k "redis-server"

:: 2. Start FastAPI Backend
echo Starting FastAPI Backend...
start "FastAPI Backend" cmd /k "cd /d C:\xampp\htdocs\e-issp-cspc && powershell -NoExit -Command Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"

:: 3. Start Celery Worker
echo Starting Celery Worker...
start "Celery Worker" cmd /k "cd /d C:\xampp\htdocs\e-issp-cspc && powershell -NoExit -Command Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; .\venv\Scripts\Activate.ps1; celery -A app.celery_app worker -P solo --loglevel=info"

:: 4. Start Vite Frontend
echo Starting Frontend...
start "Vite Frontend" cmd /k "cd /d C:\xampp\htdocs\e-issp-cspc\frontend && npm run dev"

echo All services launched. You can close this window.
pause