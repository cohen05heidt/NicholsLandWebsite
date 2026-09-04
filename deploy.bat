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

rem --- Is this actually a repo? -----------------------------
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo   PROBLEM: this folder is not a git repository.
  echo   Make sure deploy.bat is sitting in the project folder, beside
  echo   index.html and the hidden .git folder.
  echo.
  pause
  exit /b 1
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
echo   [1/3] Staging...
git add -A
if errorlevel 1 goto failed

echo   [2/3] Committing...
git commit -m "!MSG!"

echo   [3/3] Pushing...
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
