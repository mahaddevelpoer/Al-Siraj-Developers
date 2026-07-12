@echo off
title AL SIRAJ DEVELOPERS - Clean Handover & Test Data
color 0E
echo.
echo ==================================================
echo   AL SIRAJ DEVELOPERS - TEST DATA RESET
echo ==================================================
echo.
echo This will delete all business transactions, properties, sales, 
echo and town records from both the online Supabase database and 
echo local Excel files on this PC.
echo.
echo Note: This will NOT delete login accounts or database schema.
echo.
set /p CONFIRM="Type RESET to confirm deletion: "
if "%CONFIRM%"=="RESET" (
  echo.
  echo Cleaning up data, please wait...
  node "%~dp0scripts\cleanup-data.js"
) else (
  echo Reset cancelled.
)
echo.
pause
