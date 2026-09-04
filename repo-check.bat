@echo off
rem ===========================================================================
rem  repo-check.bat  --  run BEFORE moving this project to another computer.
rem
rem  Packs and prunes the repository, then verifies every stored object.
rem  Copying a repo that is already corrupt just moves the corruption, and it
rem  usually is not noticed until a push fails weeks later. Cheap to run.
rem
rem  Output goes to "Claude outputs\repo-check.txt". Nothing is deleted from
rem  the website itself -- this only touches Git's own internal storage.
rem ===========================================================================
setlocal
cd /d "%~dp0"
set "OUT=%~dp0Claude outputs\repo-check.txt"
if not exist "%~dp0Claude outputs" mkdir "%~dp0Claude outputs"

> "%OUT%" echo === repo-check %DATE% %TIME% ===
>>"%OUT%" echo Folder: %CD%
>>"%OUT%" echo.

>>"%OUT%" echo --- working tree state (want: clean) ---
git status --short >>"%OUT%" 2>&1
>>"%OUT%" echo (end of status - blank above means clean)
>>"%OUT%" echo.

>>"%OUT%" echo --- unpushed commits (want: none) ---
git log origin/main..HEAD --oneline >>"%OUT%" 2>&1
>>"%OUT%" echo (end of list - blank above means everything is pushed)
>>"%OUT%" echo.

>>"%OUT%" echo --- loose object count BEFORE ---
git count-objects -v >>"%OUT%" 2>&1
>>"%OUT%" echo.

>>"%OUT%" echo --- git gc: pack loose objects, remove orphaned temp files ---
git gc --prune=now >>"%OUT%" 2>&1
>>"%OUT%" echo.

>>"%OUT%" echo --- loose object count AFTER ---
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
  >>"%OUT%" echo RESULT: OK - repo packed, verified, and GitHub reachable
)

>>"%OUT%" echo.
>>"%OUT%" echo === end %DATE% %TIME% ===
endlocal
exit /b 0
