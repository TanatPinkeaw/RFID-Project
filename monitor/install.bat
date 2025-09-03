@echo off
echo Installing RFID Tag Monitor...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python first
    pause
    exit /b 1
)

echo Python found, installing packages...
pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo Error installing packages. Please check your internet connection.
    pause
    exit /b 1
)

echo.
echo Installation completed successfully!
echo.
echo To run the monitor:
echo python monitor.py
echo.
pause
