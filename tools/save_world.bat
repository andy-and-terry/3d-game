@echo off
REM =============================================================
REM  save_world.bat
REM  Example script: export a world payload to a .world file
REM  using save_world.vbs for Base64 / file writing.
REM
REM  Usage:
REM    save_world.bat <worldId> <outputPath>
REM
REM  Example:
REM    save_world.bat "my-world-uuid" "C:\Worlds\my_world.world"
REM =============================================================

setlocal EnableDelayedExpansion

if "%~1"=="" (
    echo [ERROR] No worldId supplied.
    echo Usage: save_world.bat ^<worldId^> ^<outputPath^>
    exit /b 1
)

if "%~2"=="" (
    echo [ERROR] No output path supplied.
    echo Usage: save_world.bat ^<worldId^> ^<outputPath^>
    exit /b 1
)

set "WORLD_ID=%~1"
set "OUT_PATH=%~2"

REM Locate the worlds registry in %APPDATA%\3d-game\worlds_registry.json
set "REGISTRY=%APPDATA%\3d-game\worlds_registry.json"
if not exist "%REGISTRY%" (
    echo [ERROR] World registry not found: %REGISTRY%
    echo Make sure the game has been run at least once.
    exit /b 1
)

REM Locate the world directory
set "WORLDS_DIR=%APPDATA%\3d-game\worlds"
set "WORLD_DIR=%WORLDS_DIR%\%WORLD_ID%"

if not exist "%WORLD_DIR%" (
    echo [ERROR] World directory not found: %WORLD_DIR%
    exit /b 1
)

echo [INFO] Exporting world "%WORLD_ID%" ...
echo [INFO] Source : %WORLD_DIR%
echo [INFO] Output : %OUT_PATH%

REM Call the VBS helper to read meta.json, base64-encode, and write the payload
cscript //nologo "%~dp0save_world.vbs" "%WORLD_DIR%" "%OUT_PATH%"

if %errorlevel% neq 0 (
    echo [ERROR] Export failed ^(VBS script returned error %errorlevel%^).
    exit /b %errorlevel%
)

echo [OK] World exported successfully to: %OUT_PATH%
endlocal
