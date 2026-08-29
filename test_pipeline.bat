@echo off
setlocal
pushd "%~dp0"
chcp 65001 >nul
title CriticAI - Pipeline Test

echo ====================================================
echo    CriticAI - Pipeline Test
echo ====================================================
echo.

REM Simulation mode by default
set CRITICAI_SIMULATION=true

echo [*] Dependencies check...
python -c "import fastapi" 2>nul
if %errorlevel% neq 0 (
    echo [*] Installing dependencies...
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] pip install fail
        pause
        exit /b 1
    )
)

echo.
echo [*] Pipeline chal rahi hai (3 test cases, factual)...
echo.

python -c "
import sys, json
sys.path.insert(0, '.')
from orchestrator.graph import CriticAIOrchestrator
o = CriticAIOrchestrator(model_name='gpt-4o-mini')
r = o.run(prompt_category='factual', num_tests=3, include_redteam=False)
report = r['report']
print('=== RESULTS ===')
print(f'Model: {r[\"model\"]}')
print(f'Total Tests: {report[\"total_tests\"]}')
print(f'Passed: {report[\"passed_tests\"]}')
print(f'Health Score: {report[\"health_score\"][\"overall\"]:.1f}/100')
print(f'Summary:')
print(report['summary'])
"

if %errorlevel% equ 0 (
    echo.
    echo [OK] Pipeline successful!
    echo.
    echo Next steps:
    echo   1. Gemini API se real test: set GEMINI_API_KEY=your_key ^&^& python -m uvicorn api.main:app --reload
    echo   2. API docs: http://localhost:8000/docs
    echo.
) else (
    echo [ERROR] Kuch gadbad hui. python check_setup.py chalao.
)

popd
pause
