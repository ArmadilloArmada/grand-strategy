@echo off
setlocal

REM ============================================================
REM Grand Strategy — Steam Upload Script
REM ============================================================
REM Prerequisites:
REM   1. Download steamcmd from https://developer.valvesoftware.com/wiki/SteamCMD
REM   2. Set STEAMCMD_PATH below to the folder containing steamcmd.exe
REM   3. Set your real App/Depot IDs in steam\app_build.vdf and steam\depot_build_win.vdf
REM   4. Run preflight check (called automatically): npm run steam:preflight
REM   5. Run:  npm run pack:steam   to build release\win-unpacked\
REM ============================================================

set STEAMCMD_PATH=C:\steamcmd
set STEAM_USER=your_steamworks_username

REM Path to app_build.vdf (relative to this script)
set VDF_PATH=%~dp0..\steam\app_build.vdf

if not exist "%STEAMCMD_PATH%\steamcmd.exe" (
    echo ERROR: steamcmd.exe not found at %STEAMCMD_PATH%
    echo Download it from: https://developer.valvesoftware.com/wiki/SteamCMD
    pause
    exit /b 1
)

if not exist "%~dp0..\release\win-unpacked\" (
    echo ERROR: release\win-unpacked\ not found.
    echo Run:  npm run pack:steam  first.
    pause
    exit /b 1
)

echo Running Steam preflight checks...
call npm run steam:preflight
if errorlevel 1 (
    echo Steam preflight failed. Aborting upload.
    pause
    exit /b 1
)

echo Building unpacked release...
call npm run pack:steam
if errorlevel 1 (
    echo Build failed. Aborting upload.
    pause
    exit /b 1
)

echo.
echo Uploading to Steam (you will be prompted for your password / Steam Guard code)...
"%STEAMCMD_PATH%\steamcmd.exe" +login %STEAM_USER% +run_app_build "%VDF_PATH%" +quit

echo.
echo Upload complete. Check the Steamworks Partner Portal to review and publish the build:
echo   https://partner.steamgames.com/apps/builds/YOUR_APP_ID
pause
endlocal
