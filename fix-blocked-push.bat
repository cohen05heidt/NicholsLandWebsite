@echo off
rem ===========================================================================
rem  fix-blocked-push.bat  --  recover from a push GitHub refused
rem
rem  Double-click it. It asks nothing and writes what it did to
rem  "Claude outputs\fix-blocked-push.txt".
rem
rem  WHY THIS EXISTS
rem
rem  On 13 Sep a push was rejected by GitHub Push Protection: a live Resend API
rem  key had been pasted into the end of worker/contact-form/README.md, and the
rem  commit carried it. That protection did exactly its job -- the key never
rem  reached GitHub.
rem
rem  Deleting the line is not enough on its own. Git keeps the old version
rem  inside the commit, and a push sends commits, not just the current files.
rem  Re-running claude-deploy.bat would build a second commit on top of the
rem  first and hand GitHub both of them, so it would be refused all over again.
rem
rem  So this rewinds the local commits that were never accepted -- keeping
rem  every edit in place, staged and untouched -- and makes one clean commit
rem  from the files as they stand now. Nothing you have written is lost. The
rem  only thing discarded is the commit that carried the key.
rem
rem  It resets to origin/main, the last thing GitHub actually accepted, rather
rem  than counting commits backwards. That is safe whether one commit was
rem  refused or five, and it cannot reach back past work that already pushed.
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "REPOPATH=%CD:\=/%"

set "LOGDIR=%~dp0Claude outputs"
set "LOG=%LOGDIR%\fix-blocked-push.txt"
set "MSGFILE=%LOGDIR%\commit-message.txt"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

> "%LOG%" echo === fix-blocked-push %DATE% %TIME% ===
>>"%LOG%" echo Folder: %CD%
>>"%LOG%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git is not installed, or not on PATH.
  goto :done
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  git config --global --add safe.directory "%REPOPATH%" >>"%LOG%" 2>&1
  git rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    >>"%LOG%" echo RESULT: FAILED - not a usable git repository.
    goto :done
  )
)

rem --- 1. refuse to run while the key is still sitting in a file ------------
rem Belt and braces. GitHub would catch it again anyway, but failing here is
rem faster to read than a rejected push, and it means this script can never be
rem the thing that quietly re-commits a secret.
>>"%LOG%" echo --- checking for a pasted API key ---
findstr /S /I /M /C:"Resend API Key: re_" *.md *.txt *.toml *.js *.yml *.html >"%TEMP%\cl_leak.txt" 2>nul
for %%A in ("%TEMP%\cl_leak.txt") do set "LEAK=%%~zA"
if not "%LEAK%"=="0" (
  >>"%LOG%" echo RESULT: FAILED - an API key is still written into these files:
  type "%TEMP%\cl_leak.txt" >>"%LOG%"
  >>"%LOG%" echo.
  >>"%LOG%" echo Remove the key from them, then run this again. A key belongs
  >>"%LOG%" echo in the Cloudflare dashboard as a Secret, never in the repo:
  >>"%LOG%" echo this one is public, and anything committed to it stays in the
  >>"%LOG%" echo history even after the line is deleted.
  del "%TEMP%\cl_leak.txt" >nul 2>nul
  goto :done
)
del "%TEMP%\cl_leak.txt" >nul 2>nul
>>"%LOG%" echo None found. Good.
>>"%LOG%" echo.

rem --- 2. what does GitHub actually have? -----------------------------------
>>"%LOG%" echo --- git fetch origin ---
git fetch origin >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - could not reach GitHub.
  goto :done
)

>>"%LOG%" echo --- commits that never made it to GitHub ---
git log --oneline origin/main..HEAD >>"%LOG%" 2>&1
>>"%LOG%" echo (these are about to be replaced by one clean commit)
>>"%LOG%" echo.

rem --- 3. rewind those commits, keeping every edit --------------------------
rem --soft moves the branch pointer only. Working files are not touched and
rem everything stays staged, which is why nothing can be lost here.
>>"%LOG%" echo --- git reset --soft origin/main ---
git reset --soft origin/main >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - could not rewind. Nothing was changed.
  goto :done
)

>>"%LOG%" echo --- git status --short ---
git status --short >>"%LOG%" 2>&1
>>"%LOG%" echo.

rem --- 4. one clean commit, then send ---------------------------------------
git status --porcelain >"%TEMP%\cl_status.txt" 2>nul
for %%A in ("%TEMP%\cl_status.txt") do set "PENDING=%%~zA"
del "%TEMP%\cl_status.txt" >nul 2>nul
if "%PENDING%"=="0" (
  >>"%LOG%" echo Nothing left to commit - already in step with GitHub.
  goto :pushcheck
)

>>"%LOG%" echo --- git add -A ---
git add -A >>"%LOG%" 2>&1

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

:pushcheck
>>"%LOG%" echo --- git pull --rebase ---
git pull --rebase >>"%LOG%" 2>&1
if errorlevel 1 (
  git rebase --abort >nul 2>nul
  >>"%LOG%" echo RESULT: FAILED - could not combine your work with GitHub's.
  >>"%LOG%" echo Your commit is safe and still here; nothing was sent.
  goto :done
)
>>"%LOG%" echo.

>>"%LOG%" echo --- git push ---
git push >>"%LOG%" 2>&1
if errorlevel 1 (
  >>"%LOG%" echo RESULT: FAILED - git push. Read the lines above: if GitHub
  >>"%LOG%" echo names a secret again, a key is still in one of the files.
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
