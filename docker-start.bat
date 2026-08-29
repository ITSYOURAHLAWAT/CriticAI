@echo off
title CriticAI — Docker Launcher
color 0A

echo.
echo  ============================================================
echo   CriticAI — One-Click Docker Start
echo  ============================================================
echo.

REM Check Docker is running (try both V1 and V2 CLI)
docker info >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Docker Desktop is not running or not in PATH!
    echo  Please start Docker Desktop and try again.
    echo  Tip: Close and reopen this terminal after starting Docker Desktop.
    pause
    exit /b 1
)

echo  Docker Engine: RUNNING
echo.

echo  [1/3] Stopping any existing containers...
docker compose down --remove-orphans 2>nul

echo.
echo  [2/3] Building and starting all services...
echo  (This may take 2-5 minutes on first run - downloading images)
echo.
docker compose up --build -d

if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] Docker Compose failed. View detailed logs with:
    echo  docker compose logs
    pause
    exit /b 1
)

echo.
echo  [3/3] Waiting for services to be ready...
timeout /t 15 /nobreak >nul

echo.
echo  ============================================================
echo   SUCCESS! All services are running!
echo  ============================================================
echo.
echo   Frontend (React UI)  -->  http://localhost:3000
echo   Backend  (FastAPI)   -->  http://localhost:8000
echo   ChromaDB (Vector DB) -->  http://localhost:8001
echo   API Docs (Swagger)   -->  http://localhost:8000/docs
echo.
echo   View logs:    docker compose logs -f
echo   Stop all:     docker compose down
echo   Restart:      docker compose restart
echo  ============================================================
echo.

REM Open browser automatically
start http://localhost:3000

pause
