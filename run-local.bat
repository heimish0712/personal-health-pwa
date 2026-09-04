@echo off
setlocal
cd /d "%~dp0"
echo Open http://localhost:8080/ in Chrome.
py -3 -m http.server 8080
endlocal
