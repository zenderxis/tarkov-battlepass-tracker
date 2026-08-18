@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this only happens once...
  call npm install
)
:: Launch electron.exe directly (no npm/cmd wrapper, no console of its own),
:: then let this window close immediately.
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
