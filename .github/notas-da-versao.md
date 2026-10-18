## Como instalar

**Windows** — baixe `Instalar-Helyx-Windows.exe`, dê dois cliques e siga o instalador.
Se aparecer o aviso azul "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

**Mac com chip Apple (M1 a M4)** — baixe `Helyx-Mac-chip-Apple-M1-a-M4.zip`, abra o arquivo e arraste o **Helyx** para a pasta **Aplicativos**.
Na primeira vez, clique no programa com o botão direito → **Abrir** → **Abrir**.

**Mac com processador Intel** — mesmo procedimento com `Helyx-Mac-Intel.zip`.

Não sabe qual é o seu Mac? Menu  → **Sobre este Mac**: se aparecer "Chip Apple M…", use o primeiro; se aparecer "Processador Intel", use o segundo.

## Correção da 1.1.3
- **Windows:** o Helyx fechava sozinho, sem mensagem, em computadores que tinham a versão anterior ("Prontuário Pessoal") instalada. A cópia dos dados antigos foi refeita e agora funciona com a pasta acentuada.

## Correção da 1.1.2
- Em alguns computadores com Windows, o motor gráfico fechava antes de mostrar a janela (driver de vídeo ou antivírus). Agora, se uma abertura não chegar ao fim, a seguinte entra sozinha em **modo de compatibilidade** (sem aceleração gráfica). Se não abrir na primeira vez, **abra de novo**.

## Correção da 1.1.1
- No Windows, o programa podia ficar aberto escondido, sem mostrar a janela. Agora a janela sempre aparece, e erros mostram uma mensagem com o motivo. O registro de funcionamento fica em `%APPDATA%\Helyx\helyx.log`.
- Se o Helyx não abrir: abra o Gerenciador de Tarefas (Ctrl+Shift+Esc), finalize qualquer processo **Helyx** e abra de novo.

## Novidades da 1.1.0
- **Novo nome e ícone: Helyx.** Seus dados da versão anterior ("Prontuário Pessoal") são trazidos automaticamente na primeira abertura.
- **Backup e restauração:** em *Configurações → Backup* (ou menu *Arquivo → Fazer backup…*), salve um arquivo `.helyx` com todos os seus dados e restaure-o neste ou em outro computador. Antes de restaurar, o Helyx guarda uma cópia do que existe hoje.
- **Dashboard reorganizado:** avisos do que pede atenção no topo, exames com mini gráfico e faixa de referência, próximos dias, remédios com horário e medições.

Se você tinha o "Prontuário Pessoal" instalado: no Windows ele continua na lista de programas e pode ser desinstalado depois de abrir o Helyx uma vez; no Mac, apague o app antigo da pasta Aplicativos.

## Seus dados
Ficam somente no seu computador, com os campos sensíveis criptografados:
- Windows: `%APPDATA%\Helyx\dados`
- Mac: `~/Library/Application Support/Helyx/dados`

O programa faz uma cópia automática por dia (últimas 30) na subpasta `backups`. Menu **Arquivo → Abrir pasta dos dados e cópias**.

## O que tem nesta versão
- Dashboard com próximos eventos, medicamentos em uso, últimos exames, indicadores e alertas
- Exames com vários resultados, evolução em gráfico, comparação e situação em relação à referência do laudo
- Consultas com exames solicitados, ligadas automaticamente aos resultados e aos retornos
- Medicamentos com histórico de alterações e exames acompanhados (relação apenas temporal)
- Agenda (dia, semana, mês, ano) com lembretes, linha do tempo, medições de saúde, busca e resumo para consulta

O sistema organiza informações e não faz diagnóstico.
