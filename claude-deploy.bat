@echo off
rem ===========================================================================
rem  claude-deploy.bat  --  non-interactive commit + push for Nichols Land
rem
rem  Double-click it. It asks nothing, pauses never, and writes everything it
rem  did to "Claude outputs\deploy-log.txt".
rem
rem  Three things here exist because of specific ways this has broken before:
rem
rem  1. safe.directory. Git refuses to touch a repository whose folder is owned
rem     by a different Windows account than the one running it. Move this drive
rem     to another computer and that is exactly what happens -- git stops with
rem     "detected dubious ownership" and nothing works. The block below detects
rem     that and trusts this one folder on this one machine.
rem
rem  2. Pull before push. GitHub can move ahead on its own: the Actions
rem     workflow rebuilds data/properties.json whenever a listing changes, and
rem     the /admin CMS commits straight to the remote. Pushing without pulling
rem     first fails with "non-fast-forward". So this commits, then rebases onto
rem     whatever GitHub has, then pushes.
rem
rem  3. -F, not -m. cmd.exe splits an argument on an embedded double quote, so
rem     a commit message containing one used to reach git as several broken
rem     pathspecs. The message is handed over as a file instead.
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "REPOPATH=%CD:\=/%"

set "LOGDIR=%~dp0Claude outputs"
set "LOG=%LOGDIR%\deploy-log.txt"
set "MSGFILE=%LOGDIR%\commit-message.txt"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

rem Fresh log every run so a stale one is never mistaken for a new one.
> "%LOG%" echo === claude-deploy run %DATE% %TIME% ===
>>"%LOG%" echo Folder: %CD%
>>"%LOG%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git is not installed, or not on PATH.
  >>"%LOG%" echo Install Git for Windows from https://git-scm.com/download/win
  goto :done
)

rem --- 1. will git work with this folder on this machine? -------------------
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo Git refused this folder - most likely "dubious ownership",
  >>"%LOG%" echo which is normal the first time this drive is used on a new PC.
  >>"%LOG%" echo Trusting this folder for the current Windows user...
  git config --global --add safe.directory "%REPOPATH%" >>"%LOG%" 2>&1
  git rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    >>"%LOG%" echo RESULT: FAILED - still not a usable git repository.
    >>"%LOG%" echo Check that the hidden .git folder came across with the files.
    goto :done
  )
  >>"%LOG%" echo ...fixed. This folder is now trusted on this computer.
  >>"%LOG%" echo.
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
>>"%LOG%" echo (end of status - blank above means nothing changed locally)
>>"%LOG%" echo.

rem --- is there anything of ours to commit? ---------------------------------
git status --porcelain >"%TEMP%\cl_status.txt" 2>nul
for %%A in ("%TEMP%\cl_status.txt") do set "PENDING=%%~zA"
del "%TEMP%\cl_status.txt" >nul 2>nul

if "%PENDING%"=="0" goto :sync

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
>>"%LOG%" echo.

:sync
rem --- 2. take GitHub's changes first, then send ours ------------------------
>>"%LOG%" echo --- git pull --rebase (take anything GitHub changed) ---
git pull --rebase >>"%LOG%" 2>&1
if errorlevel 1 (
  git rebase --abort >nul 2>nul
  >>"%LOG%" echo.
  >>"%LOG%" echo RESULT: FAILED - could not combine your work with GitHub's.
  >>"%LOG%" echo Your commit is safe and still here; nothing was lost or sent.
  >>"%LOG%" echo This means the same lines were edited in both places. Send this
  >>"%LOG%" echo log to Claude rather than trying to force it.
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
>>"%LOG%" echo --- current commit ---
git log -1 --pretty=format:"%%H %%s" >>"%LOG%" 2>&1
>>"%LOG%" echo.
>>"%LOG%" echo RESULT: OK - up to date with GitHub

:done
>>"%LOG%" echo.
>>"%LOG%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
