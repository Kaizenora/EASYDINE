@echo off
rem One start command for the EasyDine Print Helper on a cashier PC.
rem Builds the exe the first time (with the C# compiler that ships with
rem Windows - nothing is downloaded or installed), then runs it.
rem Optional: put your EasyDine web address after the command to allow only
rem that site to pair, e.g.  start-print-helper.cmd https://your-easydine-site
setlocal
if not exist "%~dp0EasyDinePrintHelper.exe" call "%~dp0build.cmd" || (pause & exit /b 1)
if "%~1"=="" (
  "%~dp0EasyDinePrintHelper.exe"
) else (
  "%~dp0EasyDinePrintHelper.exe" --allow-origin %1
)
pause
