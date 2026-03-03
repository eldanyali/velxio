@echo off
echo ========================================
echo Arduino Emulator - Starting Backend
echo ========================================
echo.

cd backend
echo Activating virtual environment...
call venv\Scripts\activate

echo.
echo Starting FastAPI server on http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.

uvicorn app.main:app --reload --port 8000
