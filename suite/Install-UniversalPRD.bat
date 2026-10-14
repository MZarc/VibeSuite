@echo off
rem ============================================================================
rem  Universal PRD - one-click project setup (Windows)
rem ----------------------------------------------------------------------------
rem  HOW TO USE:
rem    1. Copy THIS file into your project folder (any empty or existing project).
rem    2. Double-click it. No repository checkout needed: on first run it
rem       fetches VibeSuite from GitHub into a shared local cache.
rem  It will: check Node.js, build Universal PRD if needed, create .prd/spec.json,
rem  register the MCP server for OpenCode AND Antigravity, and copy the Agent
rem  Skill into your project. Nothing outside your project folder is modified
rem  (except building Universal PRD itself on first run).
rem
rem  Finding the suite sources (explicit entries fail loudly if broken):
rem    a) drag-and-drop a folder onto this file, or run: Install-UniversalPRD.bat D:\path\to\repo
rem    b) set env var  UNIVERSAL_PRD_HOME=D:\path\to\repo
rem    c) put the path on the first line of universal-prd-home.txt next to this file
rem    d) shared cache %LOCALAPPDATA%\VibeSuite, else a fresh GitHub clone
rem  Pinned source: VIBESUITE_REPO + VIBESUITE_REF below.
rem ============================================================================
setlocal EnableDelayedExpansion
title Universal PRD one-click setup

rem --- color setup (ANSI; Windows 10+ consoles; NO_COLOR=1 for plain) -----------------
for /F "delims=" %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "C_RST=%ESC%[0m"
set "C_BOLD=%ESC%[1m"
set "C_RED=%ESC%[31m"
set "C_GRN=%ESC%[32m"
set "C_YEL=%ESC%[33m"
set "C_MAG=%ESC%[35m"
set "C_CYN=%ESC%[36m"
if defined NO_COLOR (
  set "C_RST="
  set "C_BOLD="
  set "C_RED="
  set "C_GRN="
  set "C_YEL="
  set "C_MAG="
  set "C_CYN="
)

rem --- target project = folder this file lives in --------------------------------
set "TARGET=%~dp0"
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"
for %%I in ("%TARGET%") do set "PROJ=%%~nxI"

set "VIBESUITE_REPO=https://github.com/MZarc/VibeSuite.git"
set "VIBESUITE_REF=v1.0.0"
set "VIBESUITE_CACHE=%LOCALAPPDATA%\VibeSuite"

rem --- locate the suite sources (explicit entries fail loudly if broken) -------------
set "EXPLICIT="
if not "%~1"=="" (
  set "UNIVERSAL_PRD_HOME=%~1"
  set "EXPLICIT=1"
)
if not defined UNIVERSAL_PRD_HOME (
  if exist "%TARGET%\universal-prd-home.txt" (
    set /p UNIVERSAL_PRD_HOME=<"%TARGET%\universal-prd-home.txt"
    set "EXPLICIT=1"
  )
)
if not defined UNIVERSAL_PRD_HOME (
  if exist "%TARGET%\.agents\skills\universal-prd\SKILL.md" set "UNIVERSAL_PRD_HOME=%TARGET%"
)
if not defined UNIVERSAL_PRD_HOME (
  if exist "%VIBESUITE_CACHE%\suite\install.mjs" set "UNIVERSAL_PRD_HOME=%VIBESUITE_CACHE%"
)
if not defined UNIVERSAL_PRD_HOME (
  if exist "C:\Users\Vinrox\Desktop\prd\suite\install.mjs" set "UNIVERSAL_PRD_HOME=C:\Users\Vinrox\Desktop\prd"
)
set "WANT_CLONE="
if not defined UNIVERSAL_PRD_HOME (
  set "UNIVERSAL_PRD_HOME=%VIBESUITE_CACHE%"
  set "WANT_CLONE=1"
)

cls
echo !C_CYN!+======================================================================+!C_RST!
echo !C_CYN!^|!C_RST!  !C_BOLD!!C_MAG!UNIVERSAL PRD!C_RST!  one-click requirements setup              !C_CYN!^|!C_RST!
echo !C_CYN!+======================================================================+!C_RST!
echo   project : !C_BOLD!%TARGET%!C_RST!
echo   suite   : %UNIVERSAL_PRD_HOME%
echo.

rem --- 1. Node.js + git ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! Node.js 20+ not found. Install it from https://nodejs.org/ , then double-click again.
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! git not found. Get it from https://git-scm.com/ , then double-click again.
  pause
  exit /b 1
)
if defined EXPLICIT (
  if not exist "%UNIVERSAL_PRD_HOME%\package.json" (
    echo !C_RED!  [FAIL]!C_RST! Not a VibeSuite checkout: %UNIVERSAL_PRD_HOME%
    echo          Explicit paths fail loudly by design. Fix the path and re-run.
    pause
    exit /b 1
  )
)
if defined WANT_CLONE (
  echo !C_CYN! [....]!C_RST! first run: fetching VibeSuite !VIBESUITE_REF! from GitHub...
  git clone --depth 1 --branch !VIBESUITE_REF! !VIBESUITE_REPO! "!VIBESUITE_CACHE!"
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! git clone failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

rem --- 2. Build Universal PRD once (skipped when already built) ---------------------
if not exist "%UNIVERSAL_PRD_HOME%\dist\cli\cli.js" (
  echo !C_CYN! [1/4]!C_RST! First run: installing dependencies and building Universal PRD...
  pushd "%UNIVERSAL_PRD_HOME%"
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! Universal PRD folder not found: %UNIVERSAL_PRD_HOME%
    echo         See methods a to d at the top of this file to point to the right folder.
    pause
    exit /b 1
  )
  call npm install
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! npm install failed.
    popd & pause & exit /b 1
  )
  call npm run build
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! npm run build failed.
    popd & pause & exit /b 1
  )
  popd
) else (
  echo !C_CYN! [1/4]!C_RST! Universal PRD already built, skipping build.
)
set "CLI=%UNIVERSAL_PRD_HOME%\dist\cli\cli.js"

rem --- 3. Init spec + register hosts (runs inside the target folder) ----------------
pushd "%TARGET%"
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! Cannot enter %TARGET%
  pause
  exit /b 1
)
echo !C_CYN! [2/4]!C_RST! Initializing PRD workspace...
call node "%CLI%" init --name "%PROJ%"
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! 'universal-prd init' failed. See message above.
  popd & pause & exit /b 1
)
echo !C_CYN! [3/4]!C_RST! Registering OpenCode + Antigravity (workspace scope, with backup)...
call node "%CLI%" install --target both --scope workspace --apply
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! 'universal-prd install' failed. Your files were NOT modified without a backup.
  popd & pause & exit /b 1
)
popd

rem --- 4. Copy the Agent Skill into the project --------------------------------------
echo !C_CYN! [4/4]!C_RST! Installing Agent Skill...
if not exist "%UNIVERSAL_PRD_HOME%\.agents\skills\universal-prd\SKILL.md" (
  echo !C_RED!  [FAIL]!C_RST! Skill not found in %UNIVERSAL_PRD_HOME%\.agents\skills\universal-prd
  pause
  exit /b 1
)
xcopy "%UNIVERSAL_PRD_HOME%\.agents\skills\universal-prd" "%TARGET%\.agents\skills\universal-prd\" /E /I /Y >nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! Could not copy the Skill.
  pause
  exit /b 1
)
rem --- 4b. /uprd trigger alias: portable skill plus OpenCode native command ----------
echo !C_CYN! [4/4]!C_RST! Installing /uprd shortcut...
if not exist "%UNIVERSAL_PRD_HOME%\templates\skills\uprd\SKILL.md" (
  echo !C_RED!  [FAIL]!C_RST! uprd template not found in %UNIVERSAL_PRD_HOME%\templates
  pause
  exit /b 1
)
xcopy "%UNIVERSAL_PRD_HOME%\templates\skills\uprd" "%TARGET%\.agents\skills\uprd\" /E /I /Y >nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! Could not copy the uprd Skill.
  pause
  exit /b 1
)
if not exist "%TARGET%\.opencode\commands\" mkdir "%TARGET%\.opencode\commands" >nul
copy /Y "%UNIVERSAL_PRD_HOME%\templates\opencode\commands\uprd.md" "%TARGET%\.opencode\commands\uprd.md" >nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! Could not install the OpenCode /uprd command.
  pause
  exit /b 1
)

rem --- done --------------------------------------------------------------------------
echo.
echo !C_GRN!+======================================================================+!C_RST!
echo !C_GRN!^|!C_RST!  !C_BOLD!DONE.!C_RST! Your project is ready for AI-assisted requirements work.  !C_GRN!^|!C_RST!
echo !C_GRN!+======================================================================+!C_RST!
echo.
echo  Created in %TARGET% :
echo    .prd\spec.json                     (canonical requirements file)
echo    opencode.json                      (OpenCode MCP registration)
echo    .agents\mcp_config.json            (Antigravity MCP registration)
echo    .agents\skills\universal-prd\      (Agent Skill)
echo    .agents\skills\uprd\              (/uprd trigger skill, both hosts)
echo    .opencode\commands\uprd.md         (/uprd native command, OpenCode)
echo.
echo  NEXT STEPS:
echo    1. OpenCode: reload MCP servers. Antigravity: Settings -^> Installed
echo       MCP Servers -^> refresh, or open the /mcp panel and reload.
echo    2. Tell your AI agent:
echo       !C_CYN!"Use Universal PRD to define this application properly!C_RST!
echo       !C_CYN! before implementing it."!C_RST!
echo       Shortcut: type !C_BOLD!/uprd!C_RST! followed by your brief.
echo.
pause
