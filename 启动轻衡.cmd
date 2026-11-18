@echo off
setlocal
pushd "%~dp0"
if exist ".tools\node.exe" (
  start "" http://localhost:4188
  ".tools\node.exe" scripts\serve.mjs
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Please install Node.js 22 or newer, then run this launcher again.
    pause
  ) else (
    start "" http://localhost:4188
    node scripts\serve.mjs
  )
)
popd
