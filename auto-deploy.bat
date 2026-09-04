@echo off
rem ===========================================================================
rem  auto-deploy.bat  --  the background worker.
rem
rem  A scheduled task runs this every minute. It does nothing at all unless
rem  Claude has left a signal file at "Claude outputs\deploy-now.txt". That
rem  gating is deliberate: it means the task can never commit a half-finished
rem  edit that happens to be sitting in the folder, only work Claude has
rem  explicitly declared ready. The signal file's contents are the commit
rem  message, and it is deleted as soon as it is claimed, so one signal
rem  produces exactly one deploy.
rem
rem  Everything it does lands in "Claude outputs\auto-deploy-log.txt".
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "REPOPATH=%CD:\=/%"
set "LOGDIR=%~dp0Claude outputs"
set "SIGNAL=%LOGDIR%\deploy-now.txt"
set "MSGFILE=%LOGDIR%\commit-message.txt"
set "LOG=%LOGDIR%\auto-deploy-log.txt"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if not exist "%SIGNAL%" exit /b 0

rem Claim the signal immediately so a slow run cannot be started twice.
copy /y "%SIGNAL%" "%MSGFILE%" >nul 2>nul
del /f /q "%SIGNAL%" >nul 2>nul

> "%LOG%" echo === auto-deploy %DATE% %TIME% ===
>>"%LOG%" echo Folder: %CD%
>>"%LOG%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git is not installed on this computer.
  goto :done
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo Trusting this folder for the current Windows user...
  git config --global --add safe.directory "%REPOPATH%" >>"%LOG%" 2>&1
  git rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    >>"%LOG%" echo RESULT: FAILED - not a usable git repository here.
    goto :done
  )
)

>>"%LOG%" echo --- commit message ---
type "%MSGFILE%" >>"%LOG%"
>>"%LOG%" echo.

>>"%LOG%" echo --- git status --short ---
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo (end of status)
>>"%LOG%" echo.

git status --porcelain >"%TEMP%\ad_status.txt" 2>nul
for %%A in ("%TEMP%\ad_status.txt") do set "PENDING=%%~zA"
del "%TEMP%\ad_status.txt" >nul 2>nul
if "%PENDING%"=="0" goto :sync

>>"%LOG%" echo --- git add -A ---
git add -A >>"%LOG%" 2>&1
>>"%LOG%" echo --- git commit ---
git commit -F "%MSGFILE%" >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git commit
  goto :done
)
>>"%LOG%" echo.

:sync
>>"%LOG%" echo --- git pull --rebase ---
git pull --rebase >>"%LOG%" 2>&1
if errorlevel 1 (
  git rebase --abort >nul 2>nul
  >>"%LOG%" echo RESULT: FAILED - your work and GitHub's touched the same lines.
  >>"%LOG%" echo Nothing was sent and nothing was lost.
  goto :done
)
>>"%LOG%" echo.

>>"%LOG%" echo --- git push ---
git push >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git push
  goto :done
)

>>"%LOG%" echo.
git log -1 --pretty=format:"%%H %%s" >>"%LOG%" 2>&1
>>"%LOG%" echo.
>>"%LOG%" echo RESULT: OK - committed, pushed, Pages will rebuild in about a minute

:done
>>"%LOG%" echo.
>>"%LOG%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
