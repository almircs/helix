#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  O Node.js não está instalado."
  echo "  Baixe e instale a versão LTS em https://nodejs.org e depois abra este arquivo de novo."
  open "https://nodejs.org"
  read -n 1 -s -r -p "  Pressione qualquer tecla para fechar..."
  exit 1
fi
# Leitores de PDF e de fotos (só na primeira vez)
if [ ! -d node_modules/pdfjs-dist ]; then
  echo "  Preparando a leitura de arquivos (só na primeira vez)..."
  npm install --omit=dev --no-audit --no-fund
fi
export SAUDE_ABRIR_NAVEGADOR=1
echo "  Iniciando o Helyx... (feche esta janela para encerrar)"
node --disable-warning=ExperimentalWarning server/index.js
