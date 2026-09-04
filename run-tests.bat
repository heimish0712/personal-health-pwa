@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the automated tests.
  exit /b 1
)
node tests\run-all-tests.mjs
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
