@echo off
color 0C
title Forget CEO Password
echo ===================================
echo     ZAMEEN KHATA - FORGET PASSWORD
echo ===================================
echo.
set /p secret="Enter recovery key: "
if /i "%secret%"=="MAHAD DEVELOPERS" (
    echo {"password": "ceo123"} > "%APPDATA%\zameen-khata\ceo_config.json"
    echo.
    echo Password has been reset to default: ceo123
) else (
    echo.
    echo Invalid recovery key!
)
echo.
pause
