# Helyx — Arquitetura

Sistema de Gestão Pessoal de Saúde. Este documento cobre os 7 itens pedidos antes da implementação:
arquitetura, estrutura do banco, modelo das tabelas, fluxo de navegação, tecnologias, pastas e plano por etapas.

> **Princípio de segurança clínica:** o sistema organiza, compara números com a referência do laudo e mostra a
> sequência dos fatos no tempo. Ele **não diagnostica** e **não atribui causa** (ex.: “o remédio X alterou o exame Y”).
> Esses avisos aparecem nas telas de exames, medicamentos e relatórios, e são regras fixas do futuro módulo de IA.

---

## 1. Arquitetura do sistema

```
┌──────────────────────────── Navegador (computador, tablet, celular) ───────────────────────────┐
│  SPA em JavaScript puro (módulos ES)                                                          │
│  app.js (rotas #/…) → views/* → lib.js (HTML seguro, API, formatação) → chart.js (SVG)        │
└───────────────────────────────▲─────────────────────────────────────────────────────────────────┘
                                │ JSON via /api  (cookie de sessão HttpOnly, SameSite=Strict)
┌───────────────────────────────┴──────────── Servidor Node.js ──────────────────────────────────┐
│ lib/http.js     roteador, cabeçalhos de segurança (CSP), proteção CSRF, arquivos estáticos     │
│ lib/auth.js     cadastro, login (scrypt), sessões com expiração e inatividade, limite de       │
│                 tentativas                                                                     │
│ lib/resource.js repositório genérico: validação, criptografia de campos, posse dos registros,  │
│                 auditoria                                                                      │
│ services/       regras do domínio                                                              │
│   exams          exames, resultados, catálogo de marcadores, vínculo pedido → exame            │
│   consultations  consultas e exames solicitados                                                │
│   medications    versões imutáveis, exames acompanhados, relação temporal                      │
│   analysis       situação (acima/abaixo/dentro) e tendência (aumento/redução/estável)          │
│   overview       linha do tempo, agenda, dashboard, busca, exportação                          │
│   ai             contexto estruturado + regras para o módulo de IA (etapa 4)                   │
└───────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │ SQLite (data/saude.db)        │  campos sensíveis com AES-256-GCM
                │ chave em data/chave.key       │  (ou variável SAUDE_CHAVE)
                └───────────────────────────────┘
```

**Decisões principais**

- **Roda localmente** (127.0.0.1 por padrão). Os dados de saúde ficam no computador do usuário; nada é enviado a terceiros.
- **Zero dependências externas.** Usa só o que vem no Node.js 22.13+: servidor HTTP, `node:sqlite` e `node:crypto`.
  Instalação = instalar o Node e abrir o programa. Menos superfície de ataque e manutenção mais simples.
- **API REST** separada da interface: a mesma API servirá um app de celular, o módulo de IA e integrações.
- **Interligação no servidor:** o vínculo consulta → pedido → exame realizado é feito automaticamente quando o resultado é lançado.

## 2. Estrutura do banco de dados

```
users ─┬─ profiles (1:1)
       ├─ sessions
       ├─ doctors ◄──────────────┬──────────────┬──────────────┐
       ├─ consultations ─────────┤ doctor_id    │              │
       │    ├─ previous_id (retorno de)         │              │
       │    └─ exam_requests ── marker_id ──► markers          │
       │          └─ fulfilled_exam_id ──► exams               │
       ├─ exams ── consultation_id, requested_by_doctor_id ────┘
       │    └─ exam_results ── marker_id ──► markers
       ├─ medications ── doctor_id, consultation_id
       │    ├─ medication_versions (histórico imutável)
       │    └─ medication_markers ──► markers   (exames a acompanhar)
       ├─ measurements (pressão, FC, peso, glicemia, temperatura, saturação, outro)
       ├─ events (agenda) ── consultation_id / exam_id / medication_id
       ├─ documents (estrutura pronta para a etapa 2)
       └─ audit_log (registro de alterações)
```

- **Marcadores** (`markers`) são o catálogo de exames do usuário (Creatinina, Potássio…). Cada resultado aponta para um
  marcador — é isso que permite histórico, gráficos, comparação e ligação com medicamentos sem duplicar nomes.
- **Referência por resultado:** cada `exam_result` guarda a faixa do laudo daquele dia (laboratórios diferem); o
  catálogo guarda a faixa padrão.
- **Histórico sem apagar:** medicamentos geram `medication_versions` a cada mudança de dose, horário, frequência ou
  situação; todas as gravações vão para `audit_log` com antes/depois criptografados.
- **Diagnósticos, sintomas e vacinas/procedimentos**: no MVP, diagnósticos e sintomas são campos da consulta (texto
  criptografado) e vacinas/procedimentos são tipos de evento da agenda. Tabelas próprias entram quando houver
  necessidade de relatórios por diagnóstico (etapa 3).

## 3. Modelo das principais tabelas

(C) = criptografado. Todas as tabelas de dados têm `user_id` e as consultas sempre filtram por ele.

| Tabela | Campos principais |
|---|---|
| `profiles` | full_name, birth_date, sex, weight_kg, height_cm, blood_type, allergies (C), conditions (C), emergency_contacts (C), notes (C) |
| `doctors` | name, specialty, crm, phone, email, address, is_reference, notes (C) |
| `consultations` | date, time, specialty, doctor_id, location, status (agendada/realizada/cancelada), is_return, previous_id, reason, symptoms, diagnoses, conduct, prescribed, recommendations, notes (todos C) |
| `exam_requests` | consultation_id, marker_id, description, status (pendente/realizado/cancelado), fulfilled_exam_id |
| `exams` | collection_date, result_date, lab, exam_type, requested_by_doctor_id, consultation_id, reason (C), notes (C) |
| `markers` | name (único por usuário), unit, ref_min, ref_max, ref_text, category |
| `exam_results` | exam_id, marker_id, value_num, value_text (ex.: “< 0,5”), unit, ref_min, ref_max, ref_text, notes (C) |
| `medications` | name, active_ingredient, dosage, presentation, schedule, frequency, start_date, end_date, doctor_id, consultation_id, status, reason (C), notes (C) |
| `medication_versions` | medication_id, version, effective_date, dosage, schedule, frequency, status, change_reason (C), consultation_id, snapshot (C) |
| `medication_markers` | medication_id, marker_id |
| `measurements` | type, label, measured_at, value1, value2 (diastólica), unit, notes (C) |
| `events` | type, title, starts_at, location, status, remind_minutes, consultation_id, exam_id, medication_id, notes (C) |
| `audit_log` | at, entity, entity_id, action, data (C: antes/depois) |

Esquema completo: `server/migrations/001_inicial.sql`.

## 4. Fluxo de navegação

```
Entrar / Criar conta
   └─► Dashboard ── próximos eventos · medicamentos · últimos exames · indicadores · alertas
         │
         ├─ Agenda (dia · semana · mês · ano) ─► novo compromisso / abrir consulta
         ├─ Exames ─┬─ por exame ─► Evolução do marcador (gráfico, tabela, marcos de medicamento) ─► Comparar
         │          └─ por data ──► Detalhe do exame ─► Editar
         ├─ Consultas ─► Detalhe (sequência: anterior → esta → pedidos → resultados → medicamentos → retorno)
         │                 ├─ Lançar resultados (formulário já preenchido com os pedidos)
         │                 └─ Agendar retorno
         ├─ Medicamentos ─► Detalhe (histórico de versões, exames acompanhados, antes/depois) ─► Registrar alteração
         ├─ Linha do tempo (filtros por tipo e período; cada item abre o detalhe)
         ├─ Saúde (medições + gráficos)
         ├─ Relatórios (resumo para consulta → imprimir/PDF)
         ├─ Documentos · IA (próximas etapas)
         └─ Configurações (perfil · médicos · segurança e dados · aparência)
Busca global no topo de todas as telas.
```

## 5. Tecnologias escolhidas

| Camada | Escolha | Por quê |
|---|---|---|
| Servidor | Node.js 22.13+ (`node:http`) | Estável, multiplataforma, sem dependências |
| Banco | SQLite (`node:sqlite`), modo WAL, chaves estrangeiras | Relacional, um arquivo, backup simples; migra para PostgreSQL se virar multiusuário em nuvem |
| Criptografia | AES-256-GCM por campo; senhas com scrypt | Padrões modernos da biblioteca nativa |
| Interface | HTML + CSS + JavaScript (módulos ES), sem etapa de build | Fácil de manter e de abrir em qualquer navegador |
| Gráficos | SVG próprio (`chart.js` do projeto) | Funciona offline, acessível, sem biblioteca |
| Testes | `node:test` | Nativo |

## 6. Estrutura de pastas

```
prontuario-pessoal/
├─ server/
│  ├─ index.js            inicialização
│  ├─ config.js           porta, pasta de dados, tempos de sessão, limiares de variação
│  ├─ db.js               conexão e migrações
│  ├─ models.js           definição das entidades
│  ├─ routes.js           todas as rotas /api
│  ├─ lib/                http, auth, crypto, audit, resource
│  ├─ services/           exams, consultations, medications, analysis, overview, ai
│  ├─ migrations/         001_inicial.sql
│  └─ scripts/            backup.js, demo.js
├─ public/
│  ├─ index.html, icon.svg, manifest.webmanifest
│  ├─ css/app.css
│  └─ js/                 app.js, lib.js, chart.js, reminders.js, views/*
├─ test/api.test.js
├─ docs/ARQUITETURA.md
├─ data/                  (criada ao iniciar: banco, chave, backups — fora do git)
├─ iniciar-windows.bat · iniciar-mac.command
└─ README.md
```

## 7. Plano de implementação por etapas

| Etapa | Conteúdo | Situação |
|---|---|---|
| **1 — MVP** | Cadastro do usuário, exames + resultados, evolução e comparação, consultas com exames solicitados, medicamentos com histórico e exames acompanhados, agenda (dia/semana/mês/ano) com lembretes na tela, linha do tempo, dashboard, medições, busca global, resumo para consulta (imprimir/PDF), segurança (login, criptografia, auditoria, exportação, exclusão) | **Entregue** |
| 2 — Documentos | Upload de PDFs/fotos criptografados, vinculados a consulta/exame/médico/medicamento; visualizador | Tabela pronta |
| 3 — Relatórios e notificações | PDF gerado no servidor (completo e para consulta), lembretes em segundo plano (e-mail/push), tabelas de diagnósticos, vacinas e procedimentos | |
| 4 — IA | Assistente que usa `/api/ai/context`, com consentimento explícito, regras de não-diagnóstico e respostas citando os dados | Contexto e regras prontos |
| 5 — Mobilidade | Acesso pela rede de casa/celular com HTTPS, instalador para Windows/Mac, sincronização opcional | |
