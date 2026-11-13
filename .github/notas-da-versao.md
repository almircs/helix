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

## Novidades da 1.14.0

- **Página inicial** sem o quadro "Próximos 7 dias" (a Agenda já mostra tudo).
- **Agenda:** nova situação **A agendar** para compromissos que ainda não têm data marcada; eles aparecem numa lista própria no alto da Agenda. A data pode ficar em branco (fica a de hoje como prevista).
- **Agenda:** escolha de **mês e ano** para ir direto a qualquer período.

## Novidades da 1.13.2

- **Celular:** os nomes dentro dos quadrados (menu Mais, Acesso rápido, abas e botões) agora sempre cabem. A letra se ajusta ao tamanho da tela e, se um nome longo não couber, ele diminui um pouco em vez de ser cortado no meio.

## Novidades da 1.13.1

- **Primeira vez num aparelho:** o Helyx pergunta se você **já tem conta** (traz a conta e os dados do computador pelo arquivo de backup) ou quer **criar uma conta nova**.
- No celular, a tela de entrar tem também o botão **Entrar com minha conta do computador**.

## Novidades da 1.13.0

- **Entrar ficou simples:** só usuário (ou e-mail) e senha. Embaixo, **Esqueci minha senha** e **Criar conta**. O Helyx lembra o último usuário, então basta digitar a senha.
- **Restaurar backup** fica dentro do programa: Configurações → Backup (ou menu Arquivo → Restaurar backup).
- **Sair** dentro do programa: botão **Sair** no alto da tela, em Configurações → Segurança e, no celular, no menu **Mais**.

## Novidades da 1.12.1

- **Celular:** os botões de cada página (Ler laudo, Novo exame, Editar, Excluir…), as abas de Configurações e de Exames e o Acesso rápido da página inicial agora aparecem em **blocos com ícone**, no mesmo estilo do menu Mais.

## Novidades da 1.12.0

- **Celular mais fácil de usar:** barra fixa embaixo com **Início**, **Agenda**, **Lançar**, **Remédios** e **Mais**. O **Mais** abre todas as seções em botões grandes (Exames, Consultas, Saúde, Vacinas, Documentos, Linha do tempo, Pendências, Relatórios e Configurações), com a busca no topo. O **Lançar** abre as opções de cadastro do mesmo jeito.
- Cabeçalho mais enxuto no celular, botões das páginas menores, listas sem nomes espremidos e a semana inteira cabendo na tela.
- No computador nada muda.

## Novidades da 1.11.0

- **Controle de doses (opcional):** em Configurações → Controle de doses. Ligado, a página Medicamentos mostra as doses de hoje com **Tomei** / **Não tomei** e o Helyx avisa quando uma dose fica 30 minutos sem anotação.
- **Familiar que acompanha:** depois de anotar uma dose, o link **Avisar** abre o WhatsApp com a mensagem pronta. Nada é enviado sozinho. Por padrão, a mensagem diz só o horário, sem o nome do remédio.
- Resumo dos últimos dias, que pode ser enviado ao familiar.

## Novidades da 1.10.0
- **Helyx no celular** (iPhone, iPad e Android): https://almircs.github.io/helyx-celular/ — instale pela Tela de Início. Os dados ficam só no aparelho e funciona sem internet.
- **Já uso o Helyx em outro aparelho** (na tela de entrada): escolha o arquivo de backup e digite a mesma senha; o Helyx cria a mesma conta e traz todos os dados. O backup agora guarda a conta (a senha vai só embaralhada).
- **Restaurar backup:** dá para escolher o arquivo mesmo que o nome tenha mudado (ao passar pelo WhatsApp ou e-mail); o Helyx confere pelo conteúdo.
- **Leitura de PDF** mais compatível (iPhones com iOS anterior ao 17.4).
- **Acesso rápido:** atalho para Configurações.

## Novidades da 1.9.0
- **Página de Pendências** (clique no quadro "Pendências" da página inicial): mostra **quais** são as pendências e deixa editar cada uma:
  - **Ação em andamento** (ex.: "coleta marcada para dia 12"), **status** (pendente, em andamento, concluída, cancelada) e **prazo**, com aviso de prazo vencido.
  - As automáticas vêm dos seus dados: exame pedido e ainda não feito, exame fora da referência, receita perto do fim e vacina com dose vencendo. Elas somem sozinhas quando o problema se resolve, por exemplo quando o exame pedido é lançado.
  - Dá para criar pendências suas (ex.: "marcar retorno com o cardiologista").
  - A página inicial continua discreta: mostra só a quantidade e os tipos.
- **Acesso rápido** ganhou **Laudos de imagem**, **Vacinas** e **Pendências**.
- **Vacinas** (novo item no menu e em *Lançar → Vacina*): registre vacina, dose, data, local, lote e a **próxima dose**. A próxima dose aparece na agenda e vira pendência perto da data. Também entram na linha do tempo e no backup.

## Novidades da 1.8.0
- **Laudos de imagem por categoria** (Coração, Rins, Próstata, Tireoide…): nova aba **Exames → Laudos de imagem**, com os laudos agrupados por categoria e um filtro para ver só uma.
  - **Mover:** escolha a categoria ao lado de cada laudo, ou marque vários e use **Mover selecionados**. Também dá para trocar na página do exame e no formulário de edição.
  - **Gerenciar** (botão **Categorias**): criar, renomear, mudar a ordem e excluir. Excluir uma categoria não apaga os exames, que ficam "sem categoria". Há sugestões prontas (Abdômen, Tórax e pulmões, Coluna, Mamas, Vasos…) para criar com um clique.
  - **Ao ler um laudo**, o Helyx já sugere a categoria pelo nome do exame e pela indicação (ex.: "cálculo renal" → Rins). Se a categoria ainda não existir, oferece criá-la.
  - As categorias entram no backup e na restauração.

## Novidades da 1.7.0
- **Esqueci minha senha** (na tela de entrada), sem internet e sem perder dados:
  - **Com o código de recuperação:** ao criar a conta ou redefinir a senha, o Helyx mostra um código (ex.: K7QF-9MXA-…) para anotar ou salvar em arquivo. Com ele, você cria uma nova senha.
  - **Pelo computador:** o Helyx grava um código temporário (vale 15 minutos) no arquivo **RECUPERAR-SENHA.txt**, dentro da pasta de dados do programa. O botão **Abrir a pasta** leva até ele. Serve para quem ainda não tem código de recuperação.
- **Redefinir senha** e **gerar novo código de recuperação** em *Configurações → Segurança e dados*, com aviso confirmando a data e a hora da troca.
- Aviso de **Caps Lock ligado** nos campos de senha.
- Ao redefinir a senha, os acessos abertos com a senha antiga são encerrados.

## Novidades da 1.6.0
- **Laudos de imagem:** tomografia, ultrassom, ressonância, raio-X, ecocardiograma, mamografia e outros exames descritivos agora são lidos por *Lançar → Ler arquivo* (ou **Ler laudo**, em Exames).
  - O Helyx separa o **nome do exame**, a **data**, a **data do laudo**, o **médico solicitante**, a **indicação**, a **técnica**, os **achados** e a **conclusão**, sem o cabeçalho e o rodapé repetidos de cada página. Você confere tudo antes de salvar, e o PDF fica guardado junto do exame.
  - **Comparação com o anterior:** a conclusão é comparada item por item com a do último laudo do mesmo tipo (por exemplo, outra tomografia do abdômen), separando o que é **novo**, o que **também estava no anterior** (com aviso quando uma medida mudou, como 5,0 mm → 6,2 mm) e o que **não aparece mais**.
  - Os laudos aparecem em *Exames* (quadro "Exames de imagem e outros laudos"), na linha do tempo e na busca. Também dá para lançar um laudo à mão em *Novo exame*, no quadro "Laudo descritivo".
- **Ler arquivo:** a data do exame não é mais confundida com a data de nascimento em laudos com "Data Entrada", e o médico "Solicitante" é reconhecido.

## Correção da 1.5.3
- **Botão Salvar que "não fazia nada"** (por exemplo, ao cadastrar médico): quando falta um campo obrigatório ou um campo está em formato inválido (como um e-mail sem "@"), agora aparece um aviso em vermelho dizendo qual campo corrigir, e o campo fica destacado. Vale para todos os formulários do programa.

## Correção da 1.5.2
- **Ler arquivo — leucograma:** também funciona quando o PDF separa a referência (em letra menor) da linha do valor. Leucócitos, neutrófilos, eosinófilos, basófilos, linfócitos e monócitos vêm sempre pelo **valor absoluto (/µL)** com a **referência da contagem**.
- Exames lidos e salvos antes desta versão **não mudam sozinhos**: corrija em *Exames → abrir o exame → Editar*, ou exclua e leia o laudo de novo.

## Correção da 1.5.1
- **Ler arquivo — leucograma:** em laudos em que a porcentagem e o valor absoluto aparecem lado a lado, sem unidade ao lado dos números (por exemplo "Leucócitos 100 5.340 … 4.000 a 10.000 /µL"), agora vale o **valor absoluto** e a **faixa da contagem** para leucócitos, neutrófilos, eosinófilos, basófilos, linfócitos e monócitos.
- **Comparação:** /µL e /mm³ são tratados como a mesma unidade. Se o resultado anterior for mais de 20 vezes diferente (por exemplo, um leucócito salvo antes como "100"), aparece **"confira"** com o link para o exame anterior, em vez de uma variação falsa.

## Novidades da 1.5.0
- **Contas com usuário e senha:** cada pessoa tem a própria conta e vê só os próprios exames, consultas, remédios e documentos.
  - **Na primeira abertura**, o Helyx pede para você criar seu usuário e sua senha. **Tudo o que já estava cadastrado fica na sua conta.**
  - Para outra pessoa usar (por exemplo, a esposa): *Configurações → Segurança e dados → Criar conta para outra pessoa*, ou **Criar conta** na tela de entrada.
  - Para trocar de pessoa: botão **Sair** no alto da tela, ou *Trocar de usuário* nas Configurações.
  - Guarde bem a senha: por segurança, não há como recuperá-la pelo programa.
- **Ler arquivo:** no leucograma (leucócitos, neutrófilos, linfócitos etc.), agora vale o **número absoluto** (/mm³) e a faixa de referência dele, e não a porcentagem.

## Correção da 1.4.1
- **Ler arquivo:** no programa instalado, ler um PDF dava o erro "getOrInsertComputed is not a function". O leitor de PDF agora usa a versão compatível com o motor do programa.
- Instalador menor (sem uma biblioteca de desenho que não era usada).

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
