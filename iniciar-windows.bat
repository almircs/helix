@echo off
chcp 65001 >nul
title Prontuario Pessoal
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
set SAUDE_ABRIR_NAVEGADOR=1
echo  Iniciando o Prontuario Pessoal... (feche esta janela para encerrar)
node --disable-warning=ExperimentalWarning server\index.js
pause
