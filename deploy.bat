@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Nichols Land - Deploy

echo.
echo  ==========================================================
echo   NICHOLS LAND  -  deploy to GitHub Pages
echo  ==========================================================
echo.
echo   Folder: %CD%
echo.

rem --- Is git available? ------------------------------------
where git >nul 2>nul
if errorlevel 1 (
  echo   PROBLEM: Windows cannot find "git".
  echo.
  echo   Fix: right-click empty space in this folder, choose
  echo   "Open Git Bash here", and run the commands manually.
  echo.
  pause
  exit /b 1
)

rem --- Is this actually a repo, and will git touch it here? --
rem  Git refuses a repository owned by a different Windows account than the
rem  one running it, which is exactly what happens the first time this drive
rem  is plugged into another PC. Trust this one folder and carry on.
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo   First run on this computer - trusting this folder...
  git config --global --add safe.directory "%CD:\=/%"
  git rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    echo.
    echo   PROBLEM: this folder is not a usable git repository.
    echo   Make sure deploy.bat is sitting in the project folder, beside
    echo   index.html and the hidden .git folder. If .git did not come
    echo   across when you copied the drive, that is the cause.
    echo.
    pause
    exit /b 1
  )
  echo   Done.
  echo.
)

rem --- Show what is about to go up --------------------------
echo  ----------------------------------------------------------
echo   These files have changed since the last deploy:
echo  ----------------------------------------------------------
git status --short
echo  ----------------------------------------------------------
echo.

git diff --quiet
set NOCHANGES=%errorlevel%
git diff --cached --quiet
if %errorlevel% equ 0 if %NOCHANGES% equ 0 (
  echo   Nothing has changed. There is nothing to deploy.
  echo.
  pause
  exit /b 0
)

rem --- Commit message ---------------------------------------
set "MSG="
set /p "MSG=  Commit message (or just press Enter for the default): "
if "!MSG!"=="" set "MSG=Site update"

echo.
echo   Message: "!MSG!"
echo.
set "GO="
set /p "GO=  Commit and push everything listed above? (y/n): "
if /i not "!GO!"=="y" (
  echo.
  echo   Cancelled. Nothing was committed and nothing was pushed.
  echo.
  pause
  exit /b 0
)

rem --- Do it ------------------------------------------------
echo.
echo   [1/4] Staging...
git add -A
if errorlevel 1 goto failed

echo   [2/4] Committing...
git commit -m "!MSG!"

rem  GitHub can be ahead of this folder without anyone touching it here: the
rem  Actions workflow rebuilds data/properties.json when a listing changes,
rem  and the /admin CMS commits straight to the remote. Take those first or
rem  the push is rejected as "non-fast-forward".
echo   [3/4] Getting any changes from GitHub...
git pull --rebase
if errorlevel 1 (
  git rebase --abort >nul 2>nul
  echo.
  echo  ==========================================================
  echo   STOPPED - your work and GitHub's changed the same lines.
  echo.
  echo   Your commit is safe and still here. Nothing was sent and
  echo   nothing was lost. Do not force it - send this window to
  echo   Claude and it will sort the two versions out.
  echo  ==========================================================
  echo.
  pause
  exit /b 1
)

echo   [4/4] Pushing...
git push
if errorlevel 1 goto failed

echo.
echo  ==========================================================
echo   PUSHED.
echo.
echo   GitHub Pages rebuilds in about a minute. Then open the
echo   site and press Ctrl+F5 to force a fresh copy - a normal
echo   refresh will show you the old cached stylesheet.
echo  ==========================================================
echo.
pause
exit /b 0

:failed
echo.
echo  ==========================================================
echo   SOMETHING FAILED above this line.
echo.
echo   Select the error text with your mouse, press Enter to
echo   copy it, and paste it to Claude. Nothing was broken -
echo   the push just did not complete.
echo  ==========================================================
echo.
pause
exit /b 1
