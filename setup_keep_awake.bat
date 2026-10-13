@echo off
chcp 65001 >nul
title Cau hinh may tinh khong Sleep khi cam sac
color 0a

echo ======================================================================
echo       BAT CHE DO TREO MAY 24/24 (KHONG SLEEP KHI CAM SAC)
echo ======================================================================
echo.

:: Dat che do khong bao gio ngu (standby timeout = 0) khi cam sac
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 10

echo [OK] Da cau hinh thanh cong:
echo  - May tinh se KHONG bao gio tu Sleep khi dang cam sac (bot chay 24/24).
echo  - Man hinh se tu dong tat sau 10 phut de tiet kiem pin/dien.
echo.
echo [*] Neu dung Laptop, ban hay vao Control Panel -> Power Options
echo     -> 'Choose what closing the lid does' -> Chon 'Do nothing' de gap may van chay.
echo ======================================================================
pause
