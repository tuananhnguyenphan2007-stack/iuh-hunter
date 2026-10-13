@echo off
chcp 65001 >nul
title IUH Activity Hunter - Bot San Slot va Auto-Register
color 0b

echo ======================================================================
echo           IUH ACTIVITY HUNTER - BOT SAN HOAT DONG DOAN - HOI
echo ======================================================================
echo.

set PY_CMD=""

:: 1. Uu tien tim Python thuc su trong MSYS2 tren may ban
if exist "C:\msys64\ucrt64\bin\python.exe" (
    set PY_CMD="C:\msys64\ucrt64\bin\python.exe"
    goto :FOUND_PY
)

:: 2. Kiem tra py launcher
py -0 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PY_CMD=py
    goto :FOUND_PY
)

:: 3. Kiem tra xem python command co chay duoc khong (tranh fake Microsoft Store alias)
python -c "import sys" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PY_CMD=python
    goto :FOUND_PY
)

:: 4. Kiem tra cac duong dan cai dat Python pho bien tren Windows
if exist "C:\Python314\python.exe" set PY_CMD="C:\Python314\python.exe" & goto :FOUND_PY
if exist "C:\Python313\python.exe" set PY_CMD="C:\Python313\python.exe" & goto :FOUND_PY
if exist "C:\Python312\python.exe" set PY_CMD="C:\Python312\python.exe" & goto :FOUND_PY
if exist "C:\Python311\python.exe" set PY_CMD="C:\Python311\python.exe" & goto :FOUND_PY
if exist "C:\Python310\python.exe" set PY_CMD="C:\Python310\python.exe" & goto :FOUND_PY
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set PY_CMD="%LOCALAPPDATA%\Programs\Python\Python314\python.exe" & goto :FOUND_PY
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PY_CMD="%LOCALAPPDATA%\Programs\Python\Python313\python.exe" & goto :FOUND_PY
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY_CMD="%LOCALAPPDATA%\Programs\Python\Python312\python.exe" & goto :FOUND_PY
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY_CMD="%LOCALAPPDATA%\Programs\Python\Python311\python.exe" & goto :FOUND_PY
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set PY_CMD="%LOCALAPPDATA%\Programs\Python\Python310\python.exe" & goto :FOUND_PY

:FOUND_PY
if %PY_CMD%=="" (
    echo [LOI] Khong tim thay Python tren he thong!
    echo Vui long cai dat Python tai https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] Phat hien Python: %PY_CMD%
echo.
echo [*] Dang khoi dong Web Server tren http://127.0.0.1:5000 ...
echo [*] Trinh duyet se tu dong mo ngay khi server san sang...
echo (Nhan Ctrl + C de tat bot bat ky luc nao)
echo ======================================================================
echo.

:: Di chuyen vao dung thu muc chua file start.bat
cd /d "%~dp0"

:: Khoi chay server (server se tu dong mo trinh duyet)
%PY_CMD% server.py

echo.
echo [*] Bot da dung.
pause
