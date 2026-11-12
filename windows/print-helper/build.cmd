@echo off
rem Builds EasyDinePrintHelper.exe with the C# compiler that ships with Windows
rem (.NET Framework 4). Nothing is downloaded or installed.
setlocal
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo Could not find the .NET Framework 4 C# compiler on this PC.
  exit /b 1
)
"%CSC%" /nologo /optimize+ /target:exe /platform:anycpu /out:"%~dp0EasyDinePrintHelper.exe" ^
  /r:System.Drawing.dll /r:System.Web.Extensions.dll "%~dp0EasyDinePrintHelper.cs"
if errorlevel 1 exit /b 1
echo Built %~dp0EasyDinePrintHelper.exe
