@echo off
rem ===========================================================================
rem  enable-auto-deploy.bat  --  double-click once per computer.
rem
rem  Registers a scheduled task that publishes whatever Claude has marked ready,
rem  once a minute, hidden.
rem
rem  The task does NOT point at this drive. It points at a small launcher kept
rem  on this computer, which checks that the project folder is actually present
rem  before doing anything. That way unplugging the drive is a non-event: the
rem  launcher finds nothing, exits without a sound, and picks straight back up
rem  when the drive returns. Nothing to remember, nothing to switch off.
rem
rem  Re-run this after moving the drive to another PC, or if the project folder
rem  itself moves. It always replaces any existing task of the same name.
rem
rem  To remove it entirely: disable-auto-deploy.bat
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "TASK=NicholsLand Auto Deploy"
set "BAT=%~dp0auto-deploy.bat"
set "LAUNCHDIR=%LOCALAPPDATA%\NicholsLandDeploy"
set "LAUNCHER=%LAUNCHDIR%\run.vbs"
set "OUT=%~dp0Claude outputs\auto-deploy-setup.txt"
if not exist "%~dp0Claude outputs" mkdir "%~dp0Claude outputs"

> "%OUT%" echo === enable-auto-deploy %DATE% %TIME% ===
>>"%OUT%" echo Computer: %COMPUTERNAME%   User: %USERNAME%
>>"%OUT%" echo Project:  %CD%
>>"%OUT%" echo Launcher: %LAUNCHER%
>>"%OUT%" echo.

if not exist "%BAT%" (
  >>"%OUT%" echo RESULT: FAILED - auto-deploy.bat is not beside this file.
  goto :done
)

if not exist "%LAUNCHDIR%" mkdir "%LAUNCHDIR%"

rem --- write the launcher, with this machine's project path baked in --------
> "%LAUNCHER%" echo ' Launcher for the Nichols Land auto-deploy task.
>>"%LAUNCHER%" echo ' Kept on this computer rather than on the project drive, so that unplugging
>>"%LAUNCHER%" echo ' the drive is harmless: the path below simply stops existing and this quits
>>"%LAUNCHER%" echo ' quietly instead of failing once a minute.
>>"%LAUNCHER%" echo Dim fso, shell, bat
>>"%LAUNCHER%" echo bat = "%BAT%"
>>"%LAUNCHER%" echo Set fso = CreateObject("Scripting.FileSystemObject")
>>"%LAUNCHER%" echo If Not fso.FileExists(bat) Then WScript.Quit 0
>>"%LAUNCHER%" echo Set shell = CreateObject("WScript.Shell")
>>"%LAUNCHER%" echo shell.Run """" ^& bat ^& """", 0, False

if not exist "%LAUNCHER%" (
  >>"%OUT%" echo RESULT: FAILED - could not write the launcher.
  goto :done
)
>>"%OUT%" echo --- launcher written ---
type "%LAUNCHER%" >>"%OUT%"
>>"%OUT%" echo.

>>"%OUT%" echo --- registering scheduled task ---
schtasks /create /tn "%TASK%" /tr "wscript.exe \"%LAUNCHER%\"" /sc minute /mo 1 /f >>"%OUT%" 2>&1
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

rem The old launcher lived on the drive itself and is what made unplugging
rem messy. Retire it if it is still lying around.
rem  NOTE: parentheses inside a parenthesised block must be escaped as ^( ^),
rem  or the first bare ) closes the block early and everything after it is
rem  parsed as loose commands. That is what happened on the first run of this.
if exist "%~dp0auto-deploy-hidden.vbs" (
  del /f /q "%~dp0auto-deploy-hidden.vbs" >nul 2>nul
  >>"%OUT%" echo Removed the old on-drive launcher ^(auto-deploy-hidden.vbs^).
)

>>"%OUT%" echo RESULT: OK - auto-deploy is on, and safe to unplug at any time.

:done
>>"%OUT%" echo.
>>"%OUT%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
