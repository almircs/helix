@echo off
chcp 65001 >nul
title Helyx
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado.
  echo  Baixe e instale a versao LTS em https://nodejs.org e depois abra este arquivo de novo.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
rem Leitores de PDF e de fotos (so na primeira vez)
if not exist node_modules\pdfjs-dist (
  echo  Preparando a leitura de arquivos, so na primeira vez...
  call npm install --omit=dev --no-audit --no-fund
)
set SAUDE_ABRIR_NAVEGADOR=1
echo  Iniciando o Helyx... (feche esta janela para encerrar)
node --disable-warning=ExperimentalWarning server\index.js
pause
