@echo off
rem ===========================================================================
rem  claude-deploy.bat  --  non-interactive commit + push for Nichols Land
rem
rem  Written by Claude. Unlike deploy.bat this asks nothing and pauses never,
rem  so it can be launched with a single double-click and left alone. Every
rem  line of output lands in "Claude outputs\deploy-log.txt", which Claude
rem  reads back to confirm the push actually landed.
rem
rem  Commit message comes from "Claude outputs\commit-message.txt" if present,
rem  otherwise "Site update".
rem ===========================================================================
setlocal enabledelayedexpansion
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

rem --- commit message -------------------------------------------------------
set "MSG=Site update"
if exist "%MSGFILE%" (
  for /f "usebackq delims=" %%L in ("%MSGFILE%") do (
    if not "%%L"=="" (
      set "MSG=%%L"
      goto :gotmsg
    )
  )
)
:gotmsg
>>"%LOG%" echo Commit message: !MSG!
>>"%LOG%" echo.

rem --- what is about to go up ----------------------------------------------
>>"%LOG%" echo --- git status --short ---
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo.

git diff --quiet
set "DIRTY=%errorlevel%"
git diff --cached --quiet
set "STAGED=%errorlevel%"
git ls-files --others --exclude-standard >"%TEMP%\cl_untracked.txt" 2>nul
for %%A in ("%TEMP%\cl_untracked.txt") do set "UNTRACKED=%%~zA"
del "%TEMP%\cl_untracked.txt" >nul 2>nul

if "%DIRTY%"=="0" if "%STAGED%"=="0" if "%UNTRACKED%"=="0" (
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
git commit -m "!MSG!" >>"%LOG%" 2>&1
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
