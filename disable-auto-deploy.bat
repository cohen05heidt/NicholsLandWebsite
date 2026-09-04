@echo off
rem  Turns the background deploy task off and removes its launcher. The website
rem  and its history are untouched; only the automation stops.
rem
rem  You do NOT need this before unplugging the drive -- the launcher checks
rem  whether the project folder is there and stays quiet when it is not. This is
rem  for when you want the automation gone for good.
rem
rem  Re-enable any time with enable-auto-deploy.bat
setlocal
set "TASK=NicholsLand Auto Deploy"
set "LAUNCHDIR=%LOCALAPPDATA%\NicholsLandDeploy"
set "OUT=%~dp0Claude outputs\auto-deploy-setup.txt"
if not exist "%~dp0Claude outputs" mkdir "%~dp0Claude outputs"
> "%OUT%" echo === disable-auto-deploy %DATE% %TIME% ===
>>"%OUT%" echo Computer: %COMPUTERNAME%   User: %USERNAME%
schtasks /delete /tn "%TASK%" /f >>"%OUT%" 2>&1
if errorlevel 1 (
  >>"%OUT%" echo RESULT: task was not registered on this computer ^(nothing to do^).
) else (
  if exist "%LAUNCHDIR%" rd /s /q "%LAUNCHDIR%" >nul 2>nul
  >>"%OUT%" echo RESULT: OK - auto-deploy is off and its launcher is removed.
)
>>"%OUT%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
