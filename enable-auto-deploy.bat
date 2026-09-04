@echo off
rem ===========================================================================
rem  enable-auto-deploy.bat  --  double-click once per computer.
rem
rem  Registers a scheduled task that runs auto-deploy.bat every minute, hidden.
rem  Re-run it after moving the drive to another PC: the task stores an absolute
rem  path, so a new drive letter needs the task re-pointed. Running it again is
rem  always safe -- it replaces any existing task of the same name.
rem
rem  To remove it later: disable-auto-deploy.bat, or Task Scheduler ->
rem  "NicholsLand Auto Deploy" -> Delete.
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "TASK=NicholsLand Auto Deploy"
set "VBS=%~dp0auto-deploy-hidden.vbs"
set "OUT=%~dp0Claude outputs\auto-deploy-setup.txt"
if not exist "%~dp0Claude outputs" mkdir "%~dp0Claude outputs"

> "%OUT%" echo === enable-auto-deploy %DATE% %TIME% ===
>>"%OUT%" echo Computer: %COMPUTERNAME%   User: %USERNAME%
>>"%OUT%" echo Folder:   %CD%
>>"%OUT%" echo Runs:     %VBS%
>>"%OUT%" echo.

if not exist "%VBS%" (
  >>"%OUT%" echo RESULT: FAILED - auto-deploy-hidden.vbs is missing.
  goto :done
)

>>"%OUT%" echo --- registering scheduled task ---
schtasks /create /tn "%TASK%" /tr "wscript.exe \"%VBS%\"" /sc minute /mo 1 /f >>"%OUT%" 2>&1
if errorlevel 1 (
  >>"%OUT%" echo RESULT: FAILED - could not register the task. See above.
  goto :done
)
>>"%OUT%" echo.

>>"%OUT%" echo --- confirming it exists ---
schtasks /query /tn "%TASK%" >>"%OUT%" 2>&1
if errorlevel 1 (
  >>"%OUT%" echo RESULT: FAILED - task did not register.
  goto :done
)
>>"%OUT%" echo.
>>"%OUT%" echo RESULT: OK - auto-deploy is on. Nothing else to do on this PC.

:done
>>"%OUT%" echo.
>>"%OUT%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
