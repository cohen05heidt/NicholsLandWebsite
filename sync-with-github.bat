@echo off
rem ===========================================================================
rem  sync-with-github.bat  --  one-time cleanup after the browser deploy.
rem
rem  On 9 Sep the two hero changes were committed through GitHub's web uploader
rem  because git was missing on this computer. That left this folder holding the
rem  same file contents as GitHub but two commits behind it, which makes an
rem  ordinary deploy try to re-commit work that is already pushed.
rem
rem  This script only moves the branch pointer, and only after proving that the
rem  files here are already identical to origin/main. If anything differs it
rem  changes nothing and says so. It cannot lose an edit.
rem
rem  Everything it does lands in "Claude outputs\sync-log.txt".
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "LOGDIR=%~dp0Claude outputs"
set "LOG=%LOGDIR%\sync-log.txt"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

> "%LOG%" echo === sync-with-github %DATE% %TIME% ===
>>"%LOG%" echo Folder: %CD%
>>"%LOG%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git still is not on PATH.
  >>"%LOG%" echo If you just installed it, close this window, open a NEW one and retry:
  >>"%LOG%" echo the PATH is only picked up by programs started after the install.
  goto :done
)
>>"%LOG%" echo --- git version ---
git --version >>"%LOG%" 2>&1
>>"%LOG%" echo.

>>"%LOG%" echo --- git fetch origin ---
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - could not reach GitHub.
  goto :done
)
>>"%LOG%" echo.

>>"%LOG%" echo --- what is here now ---
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo (end of status)
>>"%LOG%" echo.

>>"%LOG%" echo --- how this folder differs from origin/main ---
git diff --stat origin/main >>"%LOG%" 2>&1
>>"%LOG%" echo (end of diff)
>>"%LOG%" echo.

rem The safety gate. --quiet exits 1 if the working tree differs from
rem origin/main in any tracked file. Only when it exits 0 do we touch anything,
rem and at that point the reset is a pointer move: every file on disk already
rem holds exactly what origin/main holds, so nothing on disk can change.
git diff --quiet origin/main
if errorlevel 1 (
  >>"%LOG%" echo RESULT: STOPPED - this folder is NOT identical to origin/main.
  >>"%LOG%" echo Nothing was changed. The diff above shows what is different.
  >>"%LOG%" echo Send that to Claude rather than forcing anything.
  goto :done
)

>>"%LOG%" echo Working tree is identical to origin/main - safe to fast-forward.
>>"%LOG%" echo --- git reset --hard origin/main ---
git reset --hard origin/main >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - reset did not complete.
  goto :done
)
>>"%LOG%" echo.

rem The auto-deploy signal from earlier was never claimed, which is how we know
rem the scheduled task is not firing. Clear it so a revived task does not later
rem replay a commit message for work that is already on GitHub.
if exist "%LOGDIR%\deploy-now.txt" (
  del /f /q "%LOGDIR%\deploy-now.txt" >nul 2>nul
  >>"%LOG%" echo Cleared the stale deploy-now.txt signal.
  >>"%LOG%" echo.
)

>>"%LOG%" echo --- where we ended up ---
git log --oneline -3 >>"%LOG%" 2>&1
>>"%LOG%" echo.
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo (end of status - blank above means clean)
>>"%LOG%" echo.

>>"%LOG%" echo --- is the auto-deploy task actually scheduled? ---
schtasks /query /tn "NicholsLand Auto Deploy" >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo The task is NOT registered. Run enable-auto-deploy.bat to put it back.
)
>>"%LOG%" echo.
>>"%LOG%" echo RESULT: OK - this folder now matches GitHub and is clean.

:done
>>"%LOG%" echo.
>>"%LOG%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
