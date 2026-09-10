@echo off
REM ===================================================================
REM  DESTRUCTIVE. Read this before running it.
REM
REM  Rewrites every commit in the repository to remove five licensed
REM  source photographs, then FORCE PUSHES the rewritten history to
REM  GitHub.
REM
REM  What that means in practice:
REM    - Every commit hash after the first affected commit changes.
REM    - The old history on GitHub is overwritten and gone.
REM    - Anyone else who has cloned this repo will have a broken copy
REM      and must re-clone. (If you are the only one, this is moot.)
REM    - A backup branch is made first, locally, so you can recover
REM      if something goes wrong before you force push.
REM
REM  Only run this if the photo licences actually require the files
REM  gone from history. If they permit redistribution, the safe
REM  remove-source-photos.bat is enough and this is unnecessary risk.
REM
REM  Requires git-filter-repo:  pip install git-filter-repo
REM ===================================================================
setlocal
cd /d "%~dp0.."

echo.
echo ============================================================
echo   THIS REWRITES GIT HISTORY AND FORCE PUSHES.
echo   Old commit hashes will change permanently.
echo ============================================================
echo.
set /p CONFIRM="Type  REWRITE  to continue, anything else to abort: "
if /i not "%CONFIRM%"=="REWRITE" (
  echo Aborted. Nothing changed.
  pause
  exit /b 0
)

where git-filter-repo >nul 2>&1
if errorlevel 1 (
  python -m pip show git-filter-repo >nul 2>&1
  if errorlevel 1 (
    echo.
    echo git-filter-repo is not installed. Install it with:
    echo     pip install git-filter-repo
    echo then run this again.
    pause
    exit /b 1
  )
)

echo.
echo Making a local backup branch first...
git branch backup-before-purge 2>nul
echo   backup-before-purge

echo.
echo Rewriting history...
python -m git_filter_repo --invert-paths --force ^
  --path assets/img/office-source.png ^
  --path assets/img/sanford-stadium-source.png ^
  --path assets/img/sanford-stadium-sunset.jpg ^
  --path assets/img/downtown-athens-golden.png ^
  --path assets/img/downtown-athens-twilight.png

if errorlevel 1 (
  echo.
  echo Rewrite failed. Nothing was pushed. Your local backup branch
  echo 'backup-before-purge' still holds the original history.
  pause
  exit /b 1
)

echo.
echo git-filter-repo drops the remote as a safety measure. Re-adding...
git remote add origin https://github.com/cohen05heidt/NicholsLandWebsite.git 2>nul

echo.
echo Force pushing the rewritten history...
git push origin --force --all
git push origin --force --tags

echo.
echo Done. Verify on GitHub that the files are gone from history,
echo then you can delete the local backup branch with:
echo     git branch -D backup-before-purge
echo.
pause
