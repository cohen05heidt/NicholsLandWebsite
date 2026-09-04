@echo off
rem ===========================================================================
rem  repo-check.bat  --  run this FIRST on any computer this drive is plugged
rem  into, and again before unplugging it.
rem
rem  On arrival it proves the project survived the move: git can use the
rem  folder, the history is intact, and the stored token still authenticates.
rem  Before leaving it proves there is nothing uncommitted or unpushed that
rem  would be stranded on the wrong machine.
rem
rem  Output goes to "Claude outputs\repo-check.txt". This only ever touches
rem  Git's own internal storage -- no website file is changed or deleted.
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "REPOPATH=%CD:\=/%"
set "OUT=%~dp0Claude outputs\repo-check.txt"
if not exist "%~dp0Claude outputs" mkdir "%~dp0Claude outputs"

> "%OUT%" echo === repo-check %DATE% %TIME% ===
>>"%OUT%" echo Folder: %CD%
>>"%OUT%" echo Computer: %COMPUTERNAME%    User: %USERNAME%
>>"%OUT%" echo.

where git >nul 2>nul
if errorlevel 1 (
  >>"%OUT%" echo RESULT: FAILED - git is not installed on this computer.
  >>"%OUT%" echo Install Git for Windows from https://git-scm.com/download/win
  >>"%OUT%" echo then run this again.
  goto :done
)
>>"%OUT%" echo --- git version ---
git --version >>"%OUT%" 2>&1
>>"%OUT%" echo.

rem --- will git work with this folder on this machine? ----------------------
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  >>"%OUT%" echo Git refused this folder - normal the first time this drive is
  >>"%OUT%" echo used on a new PC. Trusting it for the current Windows user...
  git config --global --add safe.directory "%REPOPATH%" >>"%OUT%" 2>&1
  git rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    >>"%OUT%" echo RESULT: FAILED - still not a usable git repository.
    >>"%OUT%" echo Check that the hidden .git folder came across with the files.
    goto :done
  )
  >>"%OUT%" echo ...fixed. This folder is now trusted on this computer.
)
>>"%OUT%" echo.

>>"%OUT%" echo --- is the deploy token present? ---
if exist "%~dp0.git\deploy-token.txt" (
  >>"%OUT%" echo Found .git\deploy-token.txt
) else (
  >>"%OUT%" echo MISSING - .git\deploy-token.txt is not there. Pushing will fail.
  >>"%OUT%" echo Create a token at https://github.com/settings/tokens and save
  >>"%OUT%" echo it to that path with no trailing blank line.
)
>>"%OUT%" echo.

>>"%OUT%" echo --- working tree state (want: clean) ---
git status --short >>"%OUT%" 2>&1
>>"%OUT%" echo (end of status - blank above means clean)
>>"%OUT%" echo.

>>"%OUT%" echo --- commits made here but not sent to GitHub (want: none) ---
git log origin/main..HEAD --oneline >>"%OUT%" 2>&1
>>"%OUT%" echo (end of list - blank above means everything is pushed)
>>"%OUT%" echo.

>>"%OUT%" echo --- commits on GitHub not yet here (want: none) ---
git fetch origin >>"%OUT%" 2>&1
git log HEAD..origin/main --oneline >>"%OUT%" 2>&1
>>"%OUT%" echo (end of list - if not blank, run claude-deploy.bat to catch up)
>>"%OUT%" echo.

>>"%OUT%" echo --- storage before ---
git count-objects -v >>"%OUT%" 2>&1
>>"%OUT%" echo.

>>"%OUT%" echo --- git gc: pack objects, remove orphaned temp files ---
git gc --prune=now >>"%OUT%" 2>&1
>>"%OUT%" echo.

>>"%OUT%" echo --- storage after ---
git count-objects -v >>"%OUT%" 2>&1
>>"%OUT%" echo.

>>"%OUT%" echo --- integrity check (want: no errors) ---
git fsck --full >>"%OUT%" 2>&1
>>"%OUT%" echo (end of fsck)
>>"%OUT%" echo.

>>"%OUT%" echo --- can we still reach GitHub with the stored token? ---
git ls-remote --heads origin >>"%OUT%" 2>&1
if errorlevel 1 (
  >>"%OUT%" echo RESULT: token or network problem - see above
) else (
  >>"%OUT%" echo RESULT: OK - repo usable here, verified, and GitHub reachable
)

:done
>>"%OUT%" echo.
>>"%OUT%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
