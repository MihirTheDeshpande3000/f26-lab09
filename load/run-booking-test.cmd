@echo off
setlocal EnableExtensions

for /f "usebackq delims=" %%I in (`docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" f26-lab09-api-1`) do set "API_ONE=%%I"
for /f "usebackq delims=" %%I in (`docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" f26-lab09-api-2`) do set "API_TWO=%%I"

for /f "tokens=3" %%T in ('docker logs f26-lab09-api-1 2^>^&1 ^| findstr /c:"u-1 (member)"') do set "TOKEN_ONE=%%T"
for /f "tokens=3" %%T in ('docker logs f26-lab09-api-2 2^>^&1 ^| findstr /c:"u-1 (member)"') do set "TOKEN_TWO=%%T"

if not defined API_ONE (
  echo Could not find the live IP for f26-lab09-api-1.
  exit /b 1
)
if not defined API_TWO (
  echo Could not find the live IP for f26-lab09-api-2.
  exit /b 1
)
if not defined TOKEN_ONE (
  echo Could not find the current member token for f26-lab09-api-1.
  exit /b 1
)
if not defined TOKEN_TWO (
  echo Could not find the current member token for f26-lab09-api-2.
  exit /b 1
)

echo API 1: %API_ONE%
echo API 2: %API_TWO%

docker compose run --rm --no-deps -e API_ONE=%API_ONE% -e API_TWO=%API_TWO% -e TOKEN_ONE=%TOKEN_ONE% -e TOKEN_TWO=%TOKEN_TWO% k6 run /load/room-slot-at-most-once.js
exit /b %ERRORLEVEL%
