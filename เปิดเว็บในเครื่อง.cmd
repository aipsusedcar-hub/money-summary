@echo off
set "chrome=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%chrome%" set "chrome=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%chrome%" (
  echo ไม่พบ Google Chrome กรุณาติดตั้ง Chrome แล้วลองใหม่
  pause
  exit /b 1
)
start "" "%chrome%" --allow-file-access-from-files "%~dp0dist\index.html"
