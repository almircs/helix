# Helyx

Sistema de Gestão Pessoal de Saúde: exames, consultas, medicamentos, agenda, medições e linha do tempo —
tudo interligado, guardado no seu computador e protegido por senha e criptografia.

> O sistema organiza e acompanha informações. **Não faz diagnóstico** e não substitui o médico.

## Como instalar

Baixe o instalador na página **Releases** do repositório:

- **Windows:** `Instalar-Helyx-Windows.exe` → dois cliques e siga o instalador.
- **Mac com chip Apple (M1 a M4):** `Helyx-Mac-chip-Apple-M1-a-M4.zip` → abra e arraste para *Aplicativos*.
- **Mac com processador Intel:** `Helyx-Mac-Intel.zip`.

Na primeira abertura no Mac: botão direito no app → *Abrir*. No Windows, se aparecer o aviso azul: *Mais informações → Executar assim mesmo*.

### Sem instalar (versão no navegador)
Com o Node.js 22.13+ instalado, dê dois cliques em `iniciar-windows.bat` ou `iniciar-mac.command`, ou rode `npm start`.
O programa abre direto, **sem login** (versão de testes). Para exigir e-mail e senha, defina `SAUDE_EXIGIR_LOGIN=1`.
Para dados fictícios de demonstração, rode `npm run demo` numa pasta de dados vazia.

## Seus dados

- No programa instalado: Windows `%APPDATA%\Helyx\dados`, Mac `~/Library/Application Support/Helyx/dados` (menu *Arquivo → Abrir pasta dos dados*). Na versão de navegador, na pasta `data/`: `saude.db` (banco) e `chave.key` (chave de criptografia).
- **Backup:** *Configurações → Backup* (ou menu *Arquivo → Fazer backup…*) salva um arquivo `.helyx` com todos os dados, que pode ser restaurado neste ou em outro computador. O programa também guarda uma cópia automática por dia (últimas 30), que pode ser restaurada pela mesma tela.
  O arquivo `.helyx` contém os dados legíveis: guarde-o em local seguro.
- **Documentos:** PDFs e fotos ficam na subpasta `documentos`, criptografados; entram no arquivo de backup `.helyx`.
- **Exportar:** Configurações → Segurança e dados → Exportar meus dados (arquivo JSON legível).
- **Excluir tudo:** Configurações → Segurança e dados.

## Configuração (opcional, por variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | 4321 | Porta |
| `HOST` | 127.0.0.1 | Use `0.0.0.0` para acessar de outros aparelhos da rede (recomendado só com HTTPS) |
| `SAUDE_DATA_DIR` | `./data` | Onde ficam banco e chave |
| `SAUDE_CHAVE` | — | Chave (64 caracteres hex) em vez do arquivo |
| `SAUDE_SESSAO_HORAS` / `SAUDE_INATIVIDADE_MIN` | 12 / 60 | Validade da sessão |
| `SAUDE_EXIGIR_LOGIN` | 0 | `1` liga a tela de login (e-mail e senha) |
| `SAUDE_PERMITIR_CADASTRO` | 1 | `0` bloqueia novas contas |
| `SAUDE_VARIACAO_RELEVANTE` / `SAUDE_VARIACAO_ESTAVEL` | 10 / 3 | % para “alteração relevante” e “estável” |

## Desenvolvimento

- `npm run dev` — reinicia ao salvar
- `npm test` — testes de ponta a ponta da API
- `npm install && npm run app` — abre como programa (Electron)
- `npm run dist:win` / `npm run dist:mac` — gera instaladores localmente
- A cada envio para a branch `main`, o GitHub Actions testa, gera os instaladores e publica em *Releases* (`.github/workflows/instaladores.yml`). A versão publicada vem do campo `version` do `package.json`.
- Arquitetura, banco, fluxo e plano de etapas: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
