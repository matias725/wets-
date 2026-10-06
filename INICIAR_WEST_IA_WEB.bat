@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul || (echo No se encontro Node.js. Instalelo desde https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install || (pause & exit /b 1)
)
echo Iniciando WEST IA Web en http://localhost:5173 ...
call npm run dev -- --open
