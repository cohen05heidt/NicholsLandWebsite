@echo off
REM ===================================================================
REM  Removes the five licensed source photographs from the repository.
REM
REM  These were staging files for the Higgsfield uploads. Nothing on the
REM  site references them - checked against index.html, properties.html,
REM  app.js and style.css - so removing them changes nothing a visitor
REM  sees.
REM
REM  This is the SAFE half. It deletes them going forward and commits.
REM  It does NOT rewrite history: the files stay reachable in earlier
REM  commits, so anyone who clones the repo can still recover them.
REM  For that, see purge-source-photos-from-history.bat, which is
REM  destructive and needs reading before you run it.
REM ===================================================================
setlocal
cd /d "%~dp0.."

echo.
echo Removing licensed source photos from the working tree...
echo.

set FILES=assets\img\office-source.png assets\img\sanford-stadium-source.png assets\img\sanford-stadium-sunset.jpg assets\img\downtown-athens-golden.png assets\img\downtown-athens-twilight.png

for %%F in (%FILES%) do (
  if exist "%%F" (
    git rm --cached "%%F" >nul 2>&1
    del /f /q "%%F"
    echo   removed  %%F
  ) else (
    echo   skipped  %%F  ^(not present^)
  )
)

echo.
echo --- git status ---
git status --short

echo.
git add -A
git commit -m "Remove licensed source photographs from the repository" -m "These were staging files for the image uploads and are referenced by nothing on the site. Removing them going forward; they remain in earlier commits until history is rewritten."
if errorlevel 1 (
  echo.
  echo Nothing to commit - the files were already gone.
) else (
  git push
  echo.
  echo Pushed. The files no longer ship with the site.
)

echo.
echo NOTE: they are still recoverable from git history. Run
echo       purge-source-photos-from-history.bat if the licences
echo       require them gone entirely.
echo.
pause
