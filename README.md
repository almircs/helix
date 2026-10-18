# Prontuário Pessoal

Sistema de Gestão Pessoal de Saúde: exames, consultas, medicamentos, agenda, medições e linha do tempo —
tudo interligado, guardado no seu computador e protegido por senha e criptografia.

> O sistema organiza e acompanha informações. **Não faz diagnóstico** e não substitui o médico.

## Como instalar

Baixe o instalador na página **Releases** do repositório:

- **Windows:** `Instalar-Prontuario-Pessoal-Windows.exe` → dois cliques e siga o instalador.
- **Mac com chip Apple (M1 a M4):** `Prontuario-Pessoal-Mac-chip-Apple-M1-a-M4.zip` → abra e arraste para *Aplicativos*.
- **Mac com processador Intel:** `Prontuario-Pessoal-Mac-Intel.zip`.

Na primeira abertura no Mac: botão direito no app → *Abrir*. No Windows, se aparecer o aviso azul: *Mais informações → Executar assim mesmo*.

### Sem instalar (versão no navegador)
Com o Node.js 22.13+ instalado, dê dois cliques em `iniciar-windows.bat` ou `iniciar-mac.command`, ou rode `npm start`.
O programa abre direto, **sem login** (versão de testes). Para exigir e-mail e senha, defina `SAUDE_EXIGIR_LOGIN=1`.
Para dados fictícios de demonstração, rode `npm run demo` numa pasta de dados vazia.

## Seus dados

- No programa instalado: Windows `%APPDATA%\Prontuário Pessoal\dados`, Mac `~/Library/Application Support/Prontuário Pessoal/dados` (menu *Arquivo → Abrir pasta dos dados*). Na versão de navegador, na pasta `data/`: `saude.db` (banco) e `chave.key` (chave de criptografia).
- **Backup:** cópia automática diária (últimas 30) na subpasta `backups`; também em *Configurações → Segurança e dados → Fazer cópia agora*. Guarde o banco **e** a chave juntos, em local seguro.
  Sem a chave, alergias, diagnósticos, observações e demais campos sensíveis não podem ser lidos.
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
