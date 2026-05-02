@echo off
REM tools\save_world.bat
REM
REM Usage:
REM   save_world.bat <base64_string> <output_file>
REM
REM Example (from Node.js / Electron main process):
REM   const { execFile } = require('child_process');
REM   execFile('tools\\save_world.bat', [base64WorldString, 'worlds\\mySave.world'], ...);
REM
REM The script delegates to save_world.vbs which decodes the base64 payload
REM and writes the raw bytes to <output_file>.

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo Usage: save_world.bat ^<base64_string^> ^<output_file^>
    exit /b 1
)
if "%~2"=="" (
    echo Usage: save_world.bat ^<base64_string^> ^<output_file^>
    exit /b 1
)

set "B64_DATA=%~1"
set "OUT_FILE=%~2"

REM Resolve the directory that contains this batch file so that
REM save_world.vbs can be found regardless of the working directory.
set "SCRIPT_DIR=%~dp0"

cscript //nologo "%SCRIPT_DIR%save_world.vbs" "%B64_DATA%" "%OUT_FILE%"

if errorlevel 1 (
    echo [save_world] ERROR: VBScript failed. >&2
    exit /b 1
)

echo [save_world] Saved: %OUT_FILE%
endlocal
