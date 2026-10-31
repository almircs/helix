## Como instalar

**Windows** — baixe `Instalar-Helyx-Windows.exe`, dê dois cliques e siga o instalador.
Se aparecer o aviso azul "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

**Mac com chip Apple (M1 a M4)** — baixe `Helyx-Mac-chip-Apple-M1-a-M4.zip`, abra o arquivo e arraste o **Helyx** para a pasta **Aplicativos**.
Na primeira vez, o Mac avisa que não consegue verificar o Helyx, porque ele não tem assinatura paga da Apple. Para liberar:
- **macOS 15 Sequoia ou mais novo:** tente abrir o Helyx uma vez e feche o aviso. Depois vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o fim e clique em **Abrir Mesmo Assim** ao lado do aviso do Helyx. Confirme com a senha do Mac.
- **macOS 14 Sonoma ou mais antigo:** clique no Helyx com o botão direito → **Abrir** → **Abrir**.
- **Se nada disso aparecer** (ou o Mac disser que o app está danificado): abra o **Terminal** e rode `xattr -dr com.apple.quarantine /Applications/Helyx.app`, depois abra o Helyx de novo.

Isso só é preciso na primeira vez.

**Mac com processador Intel** — mesmo procedimento com `Helyx-Mac-Intel.zip`.

Não sabe qual é o seu Mac? Menu  → **Sobre este Mac**: se aparecer "Chip Apple M…", use o primeiro; se aparecer "Processador Intel", use o segundo.

## Novidades da 1.4.0
- **Ler arquivo:** o Helyx lê **PDF, foto, Word (.doc e .docx), Excel (.xls e .xlsx), CSV e TXT** e mostra os dados encontrados para você conferir antes de salvar. Fica em *Lançar → Ler arquivo*, e também nos botões **Ler laudo** (Exames), **Ler receita** (Medicamentos), **Ler pedido ou relatório** (Consultas) e **Extrair dados** (em cada documento guardado).
  - **Laudos de exame:** reconhece cada exame, o resultado, a unidade e a faixa de referência, a data da coleta, o laboratório e o médico solicitante. Planilhas com várias datas viram vários exames de uma vez.
  - **Receitas:** cadastra os remédios com dose, forma, frequência e horários.
  - **Pedidos de exame e relatórios:** ligam os exames pedidos e as anotações a uma consulta nova ou existente.
  - **Comparação com os anteriores:** cada resultado aparece ao lado do anterior do mesmo exame, com a variação. As **alterações ficam em um quadro separado**: o que passou a ficar fora da referência, o que continua fora, o que voltou ao normal, o que aumentou ou diminuiu de forma relevante e o que é registrado pela primeira vez. O mesmo quadro aparece na página de cada exame.
  - **Tudo neste computador, sem internet.** Fotos e PDFs escaneados são lidos por reconhecimento de texto, que pode trocar letras e números: confira com o documento, que aparece ao lado durante a revisão.
- **Documentos** agora aceita também arquivos do Word, do Excel, CSV e TXT.

## Novidades da 1.3.0
- **Visual escuro em todo o programa**, em verde-petróleo, com o menu no alto da tela e o botão **Lançar** para cadastrar exame, consulta, medicamento, medição, documento ou compromisso. O tema claro continua disponível em *Configurações → Aparência*.
- **Página inicial discreta:** mostra só datas, horários e contagens (próximo compromisso, remédios do dia, pendências, exames, medições, a semana e o resumo). Nomes de exames, remédios, médicos, especialidades e valores aparecem só dentro de cada seção — dá para abrir o Helyx em público.
- Lembretes da agenda também ficaram discretos ("Compromisso de saúde às 09:00").

## Novidades da 1.2.0
- **Documentos:** guarde PDFs e fotos de laudos, receitas, pedidos de exame e relatórios. Arraste o arquivo para a tela ou clique para escolher. Cada documento pode ser ligado a uma consulta, exame, médico ou medicamento, e aparece na página deles e na linha do tempo. Os arquivos ficam **criptografados** neste computador e entram no backup.
- **Novo visual do menu:** verde-petróleo, mais sóbrio e confortável para a vista.

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
- Página inicial discreta com próximos compromissos, remédios do dia, pendências e atalhos
- Exames com vários resultados, evolução em gráfico, comparação e situação em relação à referência do laudo
- Consultas com exames solicitados, ligadas automaticamente aos resultados e aos retornos
- Medicamentos com histórico de alterações e exames acompanhados (relação apenas temporal)
- Agenda (dia, semana, mês, ano) com lembretes, linha do tempo, medições de saúde, busca e resumo para consulta

O sistema organiza informações e não faz diagnóstico.
