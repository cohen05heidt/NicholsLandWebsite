@echo off
rem ===========================================================================
rem  deploy-photos.bat  --  ships the three album photographs.
rem
rem  This folder is two commits behind GitHub because the hero changes went up
rem  through the web uploader while git was missing here. A plain commit would
rem  therefore try to re-send work that is already pushed, and the rebase that
rem  followed would land on hunks GitHub already has.
rem
rem  "git reset --soft origin/main" fixes that in the only way that cannot cost
rem  anything: --soft moves the branch pointer and NOTHING else. It does not
rem  read, write, or delete a single file in this folder. After it, the only
rem  difference between this folder and GitHub is the new photograph work, so
rem  the commit that follows contains exactly that and nothing else.
rem
rem  Everything it does lands in "Claude outputs\deploy-log.txt".
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "LOGDIR=%~dp0Claude outputs"
set "LOG=%LOGDIR%\deploy-log.txt"
set "MSG=%LOGDIR%\photo-commit-message.txt"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

> "%LOG%" echo === deploy-photos %DATE% %TIME% ===
>>"%LOG%" echo Folder: %CD%
>>"%LOG%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git is not on PATH.
  >>"%LOG%" echo If you installed it recently, close this window and open a new one first.
  goto :done
)
git --version >>"%LOG%" 2>&1
>>"%LOG%" echo.

rem This folder records a different Windows account as its owner than the one
rem running git, which git treats as suspicious and refuses to touch. That is
rem the right default on a shared machine; here the folder is simply yours by
rem way of another drive or profile. The exception below is exactly what git
rem prints as the fix, is scoped to this one path, and is only added when the
rem check actually fails, so repeat runs do not stack duplicates in .gitconfig.
set "REPOPATH=%CD:\=/%"
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo --- marking this folder safe for the current Windows user ---
  git config --global --add safe.directory "%REPOPATH%" >>"%LOG%" 2>&1
  git rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    >>"%LOG%" echo RESULT: FAILED - still not a usable git repository here.
    goto :done
  )
  >>"%LOG%" echo Done - git will now work in this folder.
  >>"%LOG%" echo.
)

if not exist "%MSG%" (
  >>"%LOG%" echo RESULT: FAILED - photo-commit-message.txt is missing from "Claude outputs".
  goto :done
)

>>"%LOG%" echo --- git fetch origin ---
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - could not reach GitHub.
  goto :done
)
>>"%LOG%" echo.

git rev-parse --verify origin/main >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - origin/main not found after fetch.
  goto :done
)

>>"%LOG%" echo --- realigning the branch pointer to origin/main (no file is touched) ---
git reset --soft origin/main >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - could not realign onto origin/main.
  goto :done
)
>>"%LOG%" echo.

git add -A >>"%LOG%" 2>&1

>>"%LOG%" echo --- what is about to be committed ---
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo (end of status)
>>"%LOG%" echo.

git diff --cached --quiet
if not errorlevel 1 (
  >>"%LOG%" echo RESULT: nothing to send - GitHub already has everything here.
  goto :cleanup
)

>>"%LOG%" echo --- git commit ---
git commit -F "%MSG%" >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git commit
  goto :done
)
>>"%LOG%" echo.

>>"%LOG%" echo --- git push ---
git push >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git push. Nothing was lost; the commit is here.
  >>"%LOG%" echo If it asked for a password, GitHub wants a personal access token.
  goto :done
)
>>"%LOG%" echo.

>>"%LOG%" echo --- where we ended up ---
git log --oneline -3 >>"%LOG%" 2>&1
>>"%LOG%" echo.
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo (end of status - blank above means clean)
>>"%LOG%" echo.
>>"%LOG%" echo RESULT: OK - pushed. Pages rebuilds in about a minute.

:cleanup
rem The signal left for the auto-deploy task that never fired. Clearing it so a
rem revived task cannot replay a commit message for work already on GitHub.
if exist "%LOGDIR%\deploy-now.txt" (
  del /f /q "%LOGDIR%\deploy-now.txt" >nul 2>nul
  >>"%LOG%" echo Cleared the stale deploy-now.txt signal.
)

>>"%LOG%" echo.
>>"%LOG%" echo --- is the auto-deploy task actually scheduled? ---
schtasks /query /tn "NicholsLand Auto Deploy" >>"%LOG%" 2>&1
if errorlevel 1 >>"%LOG%" echo The task is NOT registered - run enable-auto-deploy.bat to put it back.

:done
>>"%LOG%" echo.
>>"%LOG%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
