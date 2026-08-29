@echo off
title Launch Voice AI Agent & RAG System (Local Development)
color 0A

echo =================================================================
echo 🚀 Launching Real-Time Voice AI Agent & RAG System (Local)
echo =================================================================
echo.

echo [1/2] Starting Backend FastAPI Server on http://localhost:8000...
start "Voice Agent - Backend API" cmd /k "wsl -d Ubuntu --cd /home/dell/voice-agent /home/dell/.local/bin/uv run --project backend uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Starting Frontend Vite App on http://localhost:5173...
start "Voice Agent - Frontend UI" cmd /k "wsl -d Ubuntu --cd /home/dell/voice-agent/frontend npm run dev"

echo.
echo =================================================================
echo ✅ Backend API:  http://localhost:8000
echo ✅ Swagger Docs: http://localhost:8000/docs
echo ✅ Frontend UI:  http://localhost:5173
echo =================================================================
echo.
echo Press any key to close this launcher window (servers remain running)...
pause > nul
