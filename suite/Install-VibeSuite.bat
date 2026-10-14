@echo off
rem ============================================================================
rem  VibeSuite Setup - one-click project setup with live progress UI (Windows)
rem ----------------------------------------------------------------------------
rem  Copy THIS file into your project folder and double-click it.
rem  No repository checkout needed: on first run it fetches VibeSuite from
rem  GitHub into a shared local cache and builds it automatically.
rem  Extra arguments, e.g. --offline --only prd --dry-run, are passed through
rem  to the installer. Set NO_COLOR=1 for plain output.
rem  A local VibeSuite copy is used first when found, in this order:
rem  UNIVERSAL_PRD_HOME env var, universal-prd-home.txt next to this file,
rem  the shared cache, and finally a fresh GitHub clone.
rem  Pinned source below: VIBESUITE_REPO + VIBESUITE_REF (a release tag once
rem  the project starts tagging releases; main until then).
rem ============================================================================
setlocal EnableDelayedExpansion
title VibeSuite Setup

rem --- color setup (ANSI; Windows 10+ consoles) --------------------------------
for /F "delims=" %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "C_RST=%ESC%[0m"
set "C_BOLD=%ESC%[1m"
set "C_DIM=%ESC%[2m"
set "C_RED=%ESC%[31m"
set "C_GRN=%ESC%[32m"
set "C_YEL=%ESC%[33m"
set "C_BLU=%ESC%[34m"
set "C_MAG=%ESC%[35m"
set "C_CYN=%ESC%[36m"
set "C_GRY=%ESC%[90m"
set "C_HRED=%ESC%[91m"
set "C_HGRN=%ESC%[92m"
set "C_HYEL=%ESC%[93m"
set "C_HBLU=%ESC%[94m"
set "C_HMAG=%ESC%[95m"
set "C_HCYN=%ESC%[96m"
if defined NO_COLOR (
  set "C_RST="
  set "C_BOLD="
  set "C_DIM="
  set "C_RED="
  set "C_GRN="
  set "C_YEL="
  set "C_BLU="
  set "C_MAG="
  set "C_CYN="
  set "C_GRY="
  set "C_HRED="
  set "C_HGRN="
  set "C_HYEL="
  set "C_HBLU="
  set "C_HMAG="
  set "C_HCYN="
)
for /f %%a in ('copy /Z "%~f0" nul') do set "CR=%%a"
set "SPIN0=|"
set "SPIN1=/"
set "SPIN2=-"
set "SPIN3=\"

set "VIBESUITE_REPO=https://github.com/MZarc/VibeSuite.git"
set "VIBESUITE_REF=main"
set "VIBESUITE_CACHE=%LOCALAPPDATA%\VibeSuite"

rem --- locations ----------------------------------------------------------------
set "TARGET=%~dp0"
if "!TARGET:~-1!"=="\" set "TARGET=!TARGET:~0,-1!"
set "RUNLOG=!TARGET!\suite-run.log"
set "RUNFLAG=!TARGET!\suite-run.flag"

if defined UNIVERSAL_PRD_HOME goto have_home_src
if exist "!TARGET!\universal-prd-home.txt" (
  set /p UNIVERSAL_PRD_HOME=<"!TARGET!\universal-prd-home.txt"
  goto have_home_src
)
if exist "!VIBESUITE_CACHE!\suite\install.mjs" (
  set "UNIVERSAL_PRD_HOME=!VIBESUITE_CACHE!"
  goto have_home_src
)
if exist "C:\Users\Vinrox\Desktop\prd\suite\install.mjs" (
  set "UNIVERSAL_PRD_HOME=C:\Users\Vinrox\Desktop\prd"
  goto have_home_src
)
set "UNIVERSAL_PRD_HOME=!VIBESUITE_CACHE!"
set "WANT_CLONE=1"
goto have_home_src

:have_home_src

cls
echo !C_CYN!+======================================================================+!C_RST!
echo !C_CYN!^|!C_RST!  !C_BOLD!!C_MAG!VIBESUITE!C_RST!  graft graph + hallmark design + universal prd   !C_CYN!^|!C_RST!
echo !C_CYN!+======================================================================+!C_RST!
echo   project : !C_BOLD!!TARGET!!C_RST!
echo   suite   : !UNIVERSAL_PRD_HOME!
echo   args    : %*
echo.

rem --- preflight checks -----------------------------------------------------------
set "FAIL="
where node >nul 2>nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! Node.js 20+ not found. Get it from https://nodejs.org/ , then double-click again.
  set "FAIL=1"
)
where git >nul 2>nul
if errorlevel 1 (
  echo !C_RED!  [FAIL]!C_RST! git not found. Get it from https://git-scm.com/ , then double-click again.
  set "FAIL=1"
)
if not exist "!UNIVERSAL_PRD_HOME!\suite\install.mjs" (
  if not defined WANT_CLONE (
    echo !C_RED!  [FAIL]!C_RST! Suite installer not found in !UNIVERSAL_PRD_HOME!\suite
    echo          Fix UNIVERSAL_PRD_HOME or universal-prd-home.txt - explicit paths fail loudly by design.
    set "FAIL=1"
  )
)
if defined FAIL goto endfail
if defined WANT_CLONE (
  echo !C_CYN!  [...]!C_RST! first run: fetching VibeSuite !VIBESUITE_REF! from GitHub into !VIBESUITE_CACHE!
  git clone --depth 1 --branch !VIBESUITE_REF! !VIBESUITE_REPO! "!VIBESUITE_CACHE!"
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! git clone failed. Check your internet connection and try again.
    goto endfail
  )
  if not exist "!UNIVERSAL_PRD_HOME!\suite\install.mjs" (
    echo !C_RED!  [FAIL]!C_RST! clone succeeded but suite/install.mjs is missing. Report this as a bug.
    goto endfail
  )
)
echo !C_GRN!  [ ok ]!C_RST! preflight: node, git, installer present
echo.
if not exist "!UNIVERSAL_PRD_HOME!\dist\cli\cli.js" (
  echo !C_CYN!  [...]!C_RST! first run: installing dependencies and building the suite...
  pushd "!UNIVERSAL_PRD_HOME!"
  call npm install
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! npm install failed. Check your connection and try again.
    popd
    goto endfail
  )
  call npm run build
  if errorlevel 1 (
    echo !C_RED!  [FAIL]!C_RST! npm run build failed in !UNIVERSAL_PRD_HOME!.
    popd
    goto endfail
  )
  popd
)

rem --- launch installer via a generated runner (avoids nested-quote pitfalls) --------
set "RUNNER=!TARGET!\suite-runner.tmp.bat"
set "RUNLOG=!TARGET!\suite-run.log"
set "RUNFLAG=!TARGET!\suite-run.flag"
del "!RUNLOG!" 2>nul
del "!RUNFLAG!" 2>nul
del "!RUNNER!" 2>nul
(
echo @echo off
echo call node "!UNIVERSAL_PRD_HOME!\suite\install.mjs" --target "!TARGET!" %* ^> "!RUNLOG!" 2^>^&1
echo ^>"!RUNFLAG!" echo %%ERRORLEVEL%%
) > "!RUNNER!"
start /b "" cmd /c ""!RUNNER!""
set "TICKS=0"
set "SHOWN=0"
set "SPIN_N=0"
set "PDONE=0"

:waitloop
if exist "!RUNFLAG!" goto finished
call :show_new_log_lines
call :show_spinner
ping -n 2 127.0.0.1 >nul
set /a TICKS+=1
set /a SPIN_N+=1
if !TICKS! gtr 1800 (
  echo.
  echo !C_RED!  [FAIL]!C_RST! timed out after 30 minutes. See !RUNLOG!
  goto endfail
)
goto waitloop

:finished
call :show_new_log_lines
<nul set /p "=!CR!                                                            !CR!"
echo.
set /p EXITCODE=<"!RUNFLAG!"
del "!RUNFLAG!" 2>nul
del "!RUNNER!" 2>nul
if not "!EXITCODE!"=="0" goto endfail

del "!RUNLOG!" 2>nul
echo !C_HGRN!+======================================================================+!C_RST!
echo !C_HGRN!^|!C_RST!  !C_BOLD!DONE.!C_RST! Your project is ready for AI-assisted building.      !C_HGRN!^|!C_RST!
echo !C_HGRN!+======================================================================+!C_RST!
echo   !C_HGRN!  [ok] install phases complete  [ok] verify + lockfile!C_RST!
echo   1. Reload MCP in your host.
echo      OpenCode: reload MCP servers.  Antigravity: refresh or open /mcp.
echo   2. Tell your AI agent:
echo      !C_CYN!"Use Universal PRD to define this application properly!C_RST!
echo      !C_CYN! before implementing it."!C_RST!   Shortcut: !C_BOLD!/uprd ^<brief^>!C_RST!
echo.
pause
exit /b 0

:endfail
echo.
echo !C_HRED!+======================================================================+!C_RST!
echo !C_HRED!^|!C_RST!  !C_BOLD!SETUP FAILED.!C_RST! Nothing was left half-configured without a backup.  !C_HRED!^|!C_RST!
echo !C_HRED!+======================================================================+!C_RST!
if defined EXITCODE echo   installer exit code was: !EXITCODE!
if exist "!RUNLOG!" (
  echo   Last lines of !RUNLOG! :
  call :show_log_tail
  echo   Full log kept at: !RUNLOG!
)
del "!RUNNER!" 2>nul
echo.
pause
exit /b 1

rem --- subroutines (linear, no parenthesized caller blocks) ------------------------
:show_spinner
set /a "F=!SPIN_N! %% 4"
if !F! equ 0 set "CH=!SPIN0!"
if !F! equ 1 set "CH=!SPIN1!"
if !F! equ 2 set "CH=!SPIN2!"
if !F! equ 3 set "CH=!SPIN3!"
set "BAR=[-------]"
if !PDONE! equ 1 set "BAR=[#------]"
if !PDONE! equ 2 set "BAR=[##-----]"
if !PDONE! equ 3 set "BAR=[###----]"
if !PDONE! equ 4 set "BAR=[####---]"
if !PDONE! equ 5 set "BAR=[#####--]"
if !PDONE! equ 6 set "BAR=[######-]"
if !PDONE! gtr 6 set "BAR=[#######]"
<nul set /p "=!CR!  !C_HYEL!!CH!!C_RST! !C_BOLD!!BAR!!C_RST! !C_DIM!!PDONE!/7 !TICKS!s!C_RST!           "
goto :eof

:show_new_log_lines
rem Prints numbered log lines newer than SHOWN (no line counting needed).
rem NOTE: content travels via the LINE variable, never as a call argument,
rem because installer JSON output contains double quotes that would corrupt CALL parsing.
if not exist "!RUNLOG!" goto :eof
for /f "tokens=1* delims=:" %%a in ('findstr /n .* "!RUNLOG!"') do (
  if %%a gtr !SHOWN! (
    set "LINE=%%b"
    call :print_log_line
    set "SHOWN=%%a"
  )
)
goto :eof

:print_log_line
rem Classify without piping content: installer JSON contains double quotes
rem that corrupt findstr parsing ("No search strings" class of bug).
rem Whitespace-only lines would print "ECHO is off" — treat as blank.
if "!LINE: =!"=="" (
  echo.
  goto :eof
)
if "!LINE!"=="" (
  echo.
  goto :eof
)
set "CH1=!LINE:~0,1!"
if "!CH1!"=="[" (
  echo.
  echo   !C_BOLD!!C_HCYN!!LINE!!C_RST!
  set /a PDONE+=1
  goto :eof
)
if not "!LINE!"=="!LINE:[ERROR]=!" (
  echo.
  echo   !C_BOLD!!C_HRED!!LINE!!C_RST!
  goto :eof
)
if not "!LINE!"=="!LINE:DONE=!" (
  echo.
  echo   !C_BOLD!!C_HGRN!!LINE!!C_RST!
  goto :eof
)
echo   !C_GRY!!LINE!!C_RST!
goto :eof

:show_log_tail
set "TOTAL=0"
for /f "tokens=1 delims=:" %%a in ('findstr /n .* "!RUNLOG!"') do set "TOTAL=%%a"
set /a SKIP=!TOTAL! - 12
if !SKIP! lss 0 set "SKIP=0"
for /f "tokens=1* delims=:" %%a in ('findstr /n .* "!RUNLOG!"') do (
  if %%a gtr !SKIP! echo   %%b
)
goto :eof
