@echo off
setlocal
title E-Urbe - Probar rama desarrollo
cd /d "%~dp0\.."

echo ============================================
echo  Probando la rama DESARROLLO en este PC
echo  (contra el Firebase real)
echo ============================================
echo.

git fetch origin --quiet
rem -uno: ignora archivos sueltos sin seguimiento (modelos .ifc/.json,
rem Excel, etc. que viven solo en este PC); solo interesa si hay cambios en
rem archivos que SI estan versionados, que son los que un cambio de rama afecta.
git status --porcelain -uno > "%TEMP%\eurbe_git_status.txt"
for %%A in ("%TEMP%\eurbe_git_status.txt") do set TAMANO=%%~zA
if not "%TAMANO%"=="0" (
  echo [!] Hay cambios sin guardar en tu copia local. Guardalos o descartalos
  echo     antes de cambiar de rama, para no perderlos.
  echo.
  pause
  exit /b 1
)

git checkout desarrollo
git pull origin desarrollo

echo.
echo Iniciando servidor local en el puerto 5174...
echo (?nube=real: usa el Firebase real; sin el parametro se usan los emuladores)
start "E-Urbe (desarrollo)" http://localhost:5174/index.html?nube=real
npx --yes http-server -p 5174 -c-1 .
