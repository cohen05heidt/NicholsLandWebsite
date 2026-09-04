@echo off
rem ===========================================================================
rem  claude-deploy.bat  --  non-interactive commit + push for Nichols Land
rem
rem  Unlike deploy.bat this asks nothing and pauses never, so it can be
rem  launched with a single double-click and left alone. Every line of output
rem  lands in "Claude outputs\deploy-log.txt", which Claude reads back to
rem  confirm the push actually landed.
rem
rem  The commit message is read from "Claude outputs\commit-message.txt" and
rem  handed to git with -F rather than -m. That matters: cmd.exe splits an
rem  argument on any embedded double quote, so a message containing one used
rem  to reach git as several broken pathspecs and the commit failed. Passing
rem  a file means the message never travels through the command line at all,
rem  and any character is safe.
rem ===========================================================================
setlocal
cd /d "%~dp0"

set "LOGDIR=%~dp0Claude outputs"
set "LOG=%LOGDIR%\deploy-log.txt"
set "MSGFILE=%LOGDIR%\commit-message.txt"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

rem Fresh log every run so Claude never reads a stale one as if it were new.
> "%LOG%" echo === claude-deploy run %DATE% %TIME% ===
>>"%LOG%" echo Folder: %CD%
>>"%LOG%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git is not on PATH
  goto :done
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - not a git repository
  goto :done
)

>>"%LOG%" echo --- commit message ---
if exist "%MSGFILE%" (
  type "%MSGFILE%" >>"%LOG%"
) else (
  >>"%LOG%" echo Site update ^(no commit-message.txt found^)
)
>>"%LOG%" echo.

>>"%LOG%" echo --- git status --short ---
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo.

rem --- is there anything at all to send? ------------------------------------
git status --porcelain >"%TEMP%\cl_status.txt" 2>nul
for %%A in ("%TEMP%\cl_status.txt") do set "PENDING=%%~zA"
del "%TEMP%\cl_status.txt" >nul 2>nul

if "%PENDING%"=="0" (
  >>"%LOG%" echo Nothing to commit. Checking whether the branch is ahead of origin...
  git push >>"%LOG%" 2>&1
  if errorlevel 1 (
    >>"%LOG%" echo RESULT: FAILED - push returned an error
  ) else (
    >>"%LOG%" echo RESULT: OK - nothing to commit, remote already up to date
  )
  goto :done
)

rem --- stage / commit / push ------------------------------------------------
>>"%LOG%" echo --- git add -A ---
git add -A >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git add
  goto :done
)

>>"%LOG%" echo --- git commit ---
if exist "%MSGFILE%" (
  git commit -F "%MSGFILE%" >>"%LOG%" 2>&1
) else (
  git commit -m "Site update" >>"%LOG%" 2>&1
)
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git commit
  goto :done
)

>>"%LOG%" echo --- git push ---
git push >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git push
  goto :done
)

>>"%LOG%" echo.
>>"%LOG%" echo --- pushed commit ---
git log -1 --pretty=format:"%%H %%s" >>"%LOG%" 2>&1
>>"%LOG%" echo.
>>"%LOG%" echo RESULT: OK - committed and pushed

:done
>>"%LOG%" echo.
>>"%LOG%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
