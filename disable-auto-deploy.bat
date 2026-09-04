@echo off
rem  Turns the background deploy task off. The website and its history are
rem  untouched; only the automation stops. Re-enable with enable-auto-deploy.bat
setlocal
set "TASK=NicholsLand Auto Deploy"
set "OUT=%~dp0Claude outputs\auto-deploy-setup.txt"
if not exist "%~dp0Claude outputs" mkdir "%~dp0Claude outputs"
> "%OUT%" echo === disable-auto-deploy %DATE% %TIME% ===
schtasks /delete /tn "%TASK%" /f >>"%OUT%" 2>&1
if errorlevel 1 (
  >>"%OUT%" echo RESULT: task was not registered on this computer ^(nothing to do^).
) else (
  >>"%OUT%" echo RESULT: OK - auto-deploy is off.
)
>>"%OUT%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
