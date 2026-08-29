@echo off
title Launch Voice AI Agent via Docker Compose
color 0B

echo =================================================================
echo 🐳 Launching Voice AI Agent Containers with Docker Compose
echo =================================================================
echo.

wsl -d Ubuntu --cd /home/dell/voice-agent docker compose up --build

pause
