@echo off
setlocal
pushd "%~dp0"
chcp 65001 >nul
title CriticAI - LLM Evaluation System

echo ====================================================
echo    CriticAI - Setup aur Run
echo ====================================================
echo.

REM Dependencies check
python -c "import fastapi" 2>nul
if %errorlevel% neq 0 (
    echo [*] Pehli baar - dependencies install ho rahi hain...
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] pip install fail. Try: python -m pip install -r requirements.txt
        pause
        exit /b 1
    )
)
echo [OK] Dependencies OK

REM API key check - Gemini优先, phir OpenAI
if "%GEMINI_API_KEY%"=="" (
    if "%GOOGLE_API_KEY%"=="" (
        if "%OPENAI_API_KEY%"=="" (
            echo [INFO] Koi API key nahi mili. Simulation mode use hoga.
            set CRITICAI_SIMULATION=true
        ) else (
            echo [OK] OpenAI API key mil gayi
        )
    ) else (
        echo [OK] Google API key mil gayi (Gemini)
    )
) else (
    echo [OK] Gemini API key mil gayi
    set GOOGLE_API_KEY=%GEMINI_API_KEY%
)

echo.
echo ====================================================
echo    API Server start ho raha hai...
echo    Docs: http://localhost:8000/docs
echo    CTRL+C to stop
echo.
echo    Example request (Gemini):
echo    curl -X POST "http://localhost:8000/evaluate" ^
echo      -H "Content-Type: application/json" ^
echo      -d "{\"model\":\"gemini/gemini-2.0-flash\",\"num_tests\":3,\"include_redteam\":false}"
echo ====================================================
echo.

python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

popd
pause
