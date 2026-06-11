@echo off
title Zameen Khata - Build Setup
color 0B
echo.
echo  ================================================
echo   ZAMEEN KHATA - Real Estate ERP System
echo   Automated Build Setup Script
echo  ================================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [!] Node.js not found. Downloading and installing Node.js v20 LTS...
    echo.
    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs_installer.msi'; Start-Process msiexec.exe -ArgumentList '/i %TEMP%\nodejs_installer.msi /passive /norestart' -Wait }"
    echo [+] Node.js installed. Refreshing PATH...
    SET "PATH=%ProgramFiles%\nodejs;%PATH%"
    SET "PATH=%APPDATA%\npm;%PATH%"
    call refreshenv 2>nul
    :: Try to reload path from registry
    for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do SET SYSPATH=%%B
    SET PATH=%SYSPATH%;%PATH%
) ELSE (
    echo [+] Node.js found: 
    node --version
)

echo.
echo [*] Installing project dependencies (this may take 2-5 minutes)...
echo.
call npm install
IF %ERRORLEVEL% NEQ 0 (
    echo [!] npm install failed. Please make sure you have internet connection and try again.
    pause
    exit /b 1
)

echo.
echo [+] Dependencies installed successfully!
echo.
echo [*] Building Zameen Khata installer...
echo [*] This will create setup.exe in the dist_electron folder.
echo.
call npm run build
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Build failed. Check the error above.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo   BUILD COMPLETE!
echo   Installer is in: dist_electron\
echo   Look for: ZameenKhata Setup 1.0.0.exe
echo  ================================================
echo.
pause
