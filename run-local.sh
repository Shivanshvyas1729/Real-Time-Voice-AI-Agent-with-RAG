#!/bin/bash

echo "================================================================="
echo "🚀 Launching Real-Time Voice AI Agent & RAG System (Local)"
echo "================================================================="
echo

# Start Backend in background
echo "[1/2] Starting Backend FastAPI Server on http://localhost:8000..."
cd /home/dell/voice-agent/backend
/home/dell/.local/bin/uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start Frontend in background
echo "[2/2] Starting Frontend Vite App on http://localhost:5173..."
cd /home/dell/voice-agent/frontend
npm run dev &
FRONTEND_PID=$!

echo
echo "================================================================="
echo "✅ Backend API:  http://localhost:8000"
echo "✅ Swagger Docs: http://localhost:8000/docs"
echo "✅ Frontend UI:  http://localhost:5173"
echo "================================================================="
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM EXIT
wait
