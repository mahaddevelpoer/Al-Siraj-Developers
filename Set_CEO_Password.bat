@echo off
color 0A
title Set CEO Password
echo ===================================
echo       ZAMEEN KHATA - CEO ACCESS
echo ===================================
echo.
set /p newpass="Enter new CEO Password: "
echo {"password": "%newpass%"} > "%APPDATA%\zameen-khata\ceo_config.json"
echo.
echo CEO Password has been successfully updated!
echo.
pause
