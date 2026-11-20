# Changelog — Máquina de Conteúdo

Entradas agrupadas por data. Versões seguem SemVer. Releases são publicadas por tag (`v*.*.*`) pelo workflow `release.yml`.

## 2026-11-19

### Corrigido — terminal do agente na geração de imagens
- O prompt de geração informa a pasta onde o Codex grava as artes nativas (`codex-home/generated_images/<sessão>/exec-*.png`) e manda copiá-las com `cp` para `generated/runs/<lote>/.input/slide-NN.png`. Antes o agente tentava colar o PNG inteiro no comando (falhava com "Argument list too long") e chamava `python`, que não existe no PATH do shell do agente (erro 127).
- O prompt proíbe base64, here-doc e conteúdo binário no comando. Como o shell não tem Python, a conferência usa só `cp`, `ls` e `file`.

## 2026-11-18

### Corrigido — bloqueio da copy de legenda na revisão de textos
- O rótulo da seção "Copy para publicação/legenda" não tem mais travessão: o filtro que remove travessões do que é entregue ao agente trocava o travessão por vírgula, e o app não reconhecia o cabeçalho que o agente gravava. Prompts salvos com o cabeçalho antigo (com travessão) precisam ser refeitos com Preparar textos.
- A seção de copy também termina em linhas de metadado `POSTNOW_*` (ex.: `POSTNOW_COPY_RENDERING=…`) que o agente às vezes grava logo depois da copy, sem cabeçalho. Antes, essas linhas entravam na copy de legenda e geravam o bloqueio "a copy da legenda não corresponde ao campo de publicação".
- Na etapa de textos de projetos de imagem, o botão de salvar volta a funcionar quando há alterações não salvas e uma pendência de revisão salva. Antes, a pendência só sumia depois de salvar, e o botão ficava em "Complete os itens pendentes" sem caminho para avançar.
- Em projetos de imagem, quando a geração das artes termina com sucesso, o Studio avança sozinho para "Revisar imagem a imagem". Antes, a etapa "Gerar imagens" mostrava "Concluído. Revise o resultado." e exigia um clique em "Revisar as imagens".

### Melhorado — biblioteca de prompts e preferências visuais
- Biblioteca com moldes específicos por objetivo para post único, Story, carrossel e vídeo; versões com e sem imagens de referência da marca, com regras explícitas para nunca consultar nem copiar referências quando desativadas.
- Post único e Story pedem uma única arte: título e subtítulo curtos na imagem; listas, dicas completas, fontes, ressalvas e CTA ficam na copy/legenda de publicação. Carrosséis mantêm conteúdo útil distribuído por slide; Stories reservam espaço para stickers nativos.
- Preferências de fundo, fotos de referência e aplicação da logo são coletadas no início e salvas no projeto. Geração e render usam as escolhas salvas, sem perguntar novamente por rodada; opt-out de fotos também bloqueia retratos do cliente e impede sua sincronização ao PostNow.
- O texto `body` é editável como subtítulo visual no Studio e em mobile, mas é removido ao serializar o contrato externo do PostNow.
- Em projetos de imagem, o "Assistente de criação" (modelo, provedor, Biblioteca de prompts e preparar ou refazer textos) fica na etapa Pauta, recolhido quando as páginas já têm textos. A etapa Textos fica só com revisão e aprovação; aprovar os textos libera a geração de imagens.
- O formato 4:3 agora usa o canvas canônico do PostNow, 1440 × 1080 px (`post-4x3` e `carousel-4x3`), e aparece como proporção de imagem no Studio. Antes ele reutilizava o canvas 4:5 de 1080 × 1350 px. Vídeo 4:3 continua indisponível no VideoGo.
- Nova preferência de projeto "Quem aparece na arte" na etapa Pauta: Automático (o agente decide pela pauta), Ninguém (`none`), Outra pessoa (`other_person`) ou Cliente (`client_portrait`). Com retrato aprovado, "Ninguém" e "Outra pessoa" são recusados ao salvar, porque a capa e o fechamento precisam mostrar a cliente; sem retrato aprovado, "Cliente" é recusado. O agente recebe a regra e o registro salvo sobrevive a reabertura do app. Cada página ainda pode ser ajustada na etapa Textos.

## 2026-11-17

### Corrigido — sincronização da marca no PostNow
- A sincronização do retrato aprovado preserva as configurações existentes do perfil PostNow e repara campos obrigatórios ausentes, inclusive a exigência e o posicionamento da logo oficial.

### Corrigido — foco de janela no segundo lançamento
- A abertura de uma segunda instância não chama `show()`/`focus()` em uma `BrowserWindow` destruída; a referência da janela é limpa ao fechar.

### Adicionado — AI Escape durante geração
- Enquanto texto, imagem ou vídeo estão em processamento no Studio, o painel de andamento oferece “Jogar enquanto aguarda”; o popup pode ser fechado sem cancelar o job.
- O jogo AI Escape 3D roda no diálogo do Studio com Three.js empacotado localmente, sem buscar a biblioteca em CDNs.

### Adicionado — ranking local do AI Escape
- O jogo mostra um placar com as dez melhores pontuações do navegador e mantém o melhor resultado por nome; usa o login GitHub detectado ou permite um apelido.
- O placar é local a este navegador/dispositivo e não sincroniza com outras instalações.


## 2026-11-16

### Não lançado — referências visuais e contraste da logo
- Na geração PostNow, referências de imagem passam a definir o sistema visual recorrente: escala e peso tipográfico, alinhamento, margens, respiro, cores e padrões de cabeçalho/rodapé. O conteúdo pode mudar sem trocar o template da marca.
- Ao aplicar a logo, o Studio mede a luminosidade da área reservada e usa a variante oficial `dark` do perfil PostNow quando o fundo é escuro. Sem variante oficial `dark`, mantém a logo principal; não fabrica uma variante que possa alterar a identidade.
- No formulário “Novo projeto · PostNow”, há uma escolha visível do fundo claro/escuro ao lado da marca vinculada; a opção inicial segue a luminância média da paleta, é salva com o projeto e preselecionada nas gerações. O diálogo de geração ainda permite uma substituição pontual.

### Não lançado — integridade da quantidade e formato no fluxo de imagem
- O número de páginas escolhido ao criar ou adaptar um projeto PostNow fica vinculado ao registro local, e a revisão bloqueia alterações silenciosas feitas durante a preparação dos textos. O agente recebe instrução explícita para preservar contagem e ordem.
- Rodadas prontas com formato diferente do projeto são reprovadas; a jornada só marca imagens como concluídas quando a rodada contém o conjunto completo no formato selecionado.
- Entradas inválidas de formato/quantidade são recusadas antes de criar a pasta do projeto.
- O nome sugerido agora distingue Carrossel, Post e Story conforme o formato selecionado, em vez de rotular toda publicação PostNow como carrossel.
- A regra editorial de retrato aprovado permanece inalterada.

### Não lançado — Motores & Setup e workspace ElevenLabs
- Motores, agentes/CLIs e ferramentas do computador agora têm grupos distintos; o Cloudflare Tunnel aparece como ferramenta de sistema, separado dos motores PostNow e VideoGo. Diagnóstico por dependência, ações e onboarding ficam na hierarquia adequada, sem o painel de métricas repetidas.
- ElevenLabs tem um painel dedicado e opcional para o VideoGo, organizado em chave/cofre, biblioteca de vozes e clonagem. Estados de cofre indisponível, carregamento, erro, catálogo vazio e prévia indisponível têm mensagens próprias.
- Desktop usa a navegação existente da sidebar; em até 920 px, tabs internas acessíveis a substituem. Em mobile, rótulos completos e breadcrumb sem truncamento, sem duplicar subnav/tabs.
- Escopo de verificação sem instalações, logins, chaves reais, áudio/TTS, clonagem ou chamadas pagas.

### Não lançado — filtros combináveis na biblioteca de projetos
- Projetos podem ser filtrados por tipo (Todos, Imagens/PostNow ou Vídeos/VideoGo) e por marca, incluindo projetos sem marca; os critérios podem ser combinados.
- A busca encontra termos no nome, briefing ou marca. A biblioteca informa a quantidade filtrada e permite limpar filtros quando não há resultados.

### Não lançado — navegação e ações acessíveis em telas pequenas
- Em telas de até 920 px, a navegação principal deixa a grade quebrada e passa a uma faixa horizontal rolável, com destinos em uma linha, devolvendo espaço útil ao conteúdo.
- Em telas de até 560 px, as ações principais de diálogos longos ficam fixas na área visível enquanto o formulário rola.
- Verificado no preview Chromium a 390, 768, 920, 921, 1280 e 1440 px: sem overflow horizontal do documento nem erros de console. Projetos, marcas, setup, preferências, criação PostNow, Estúdio e VideoGo exercitados; ações de salvar marca e criar PostNow ficaram visíveis em 390 px. Marcas e Preferências verificadas em desktop.

### Não lançado — validação do MP4 renderizado pelo VideoGo
- O Studio só considera o render concluído quando FFprobe confirma faixa de vídeo, dimensões exatas do formato escolhido, 30 FPS, duração positiva e, em modo narrado, faixa de áudio; FFmpeg também decodifica o arquivo completo antes de liberar a revisão.
- Storyboards com formatos incompatíveis com o VideoGo falham antes de iniciar o render.
- Verificado: 296 testes, typecheck, lint, build e smoke real em workspace temporário; o VideoGo derivado renderizou em 1080×1080 e o Studio confirmou resolução/FPS/duração e decodificação integral. Sem geração paga nem inspeção visual ou sonora do artefato.

### Não lançado — correções de integridade no Studio
- A aprovação de uma rodada PostNow usa a quantidade persistida do projeto e ainda exige formato compatível, todas as fontes/saídas e estado `ready`; rodadas parciais continuam recusadas.
- Notas de revisão de imagem salvam com uma ação independente, para que o blur da nota não bloqueie a aprovação clicada em seguida.

## 2026-11-15

### Não lançado — catálogo local de vozes e troca de provedor
- A narração oferece escolha separada entre voz local e ElevenLabs. O catálogo é organizado por voz, não por modelo, e reúne 54 IDs Kokoro em nove idiomas, com busca, filtros e metadados. Não há catálogo Piper selecionável enquanto a licença dos pesos ONNX individuais não for comprovada.
- A interface diferencia seleção passiva, instalação e audição local sintetizada sob demanda; a amostra não substitui o áudio final da cena. A síntese local permanece desativada em todas as plataformas: faltam termos/notices verificáveis para os componentes e dados eSpeak-NG do wheel fixado, além do teste nativo Kokoro com CPython 3.11.
- É possível trocar o provedor para ElevenLabs e gerar de novo. A geração usa novos arquivos, preserva áudios anteriores no histórico e deixa cada novo áudio pendente de revisão/aprovação.
- Verificado: typecheck, lint, 294 testes, build e Electron com projeto temporário nas larguras 390, 768, 1280 e 1440 px. Não executado: instalação/audição/síntese Kokoro real; nenhuma chamada paga ElevenLabs.

### Não lançado — logo e enquadramento das artes PostNow
- A logo oficial deixa de procurar uma área automaticamente e passa a ficar sempre ancorada no canto inferior direito, com margem de 6% das bordas; o prompt reserva a mesma área, evitando deslocamento para a esquerda ou sobreposição de conteúdo planejado.
- Os prompts de imagem exigem pessoas inteiras dentro do quadro, sem cortes nas bordas ou término artificial de recorte, com espaço de respiro e composição integrada ao cenário.

### Não lançado — Produção de vídeo derivado de post com Claude Opus
- A produção de cenas e composição passa a ser um único job de Claude Opus 5.5: cenas 3D, SVG/Three.js, HTML e motion são autorados em `.videogo/composition/index.html`. O VideoGo rasteriza a prévia e os frames do render a partir do HTML.
- Removida a etapa Codex ImageGen que gerava PNGs de fundo 9:16 para cada cena. Codex permanece somente na ação separada de geração da capa da entrega.
- O Studio apresenta o provedor correto e distingue storyboard com composição HTML de vídeo ainda básico. A aprovação do roteiro e o render final seguem explícitos.

### Não lançado — avanço único e aprovação explícita em imagem e vídeo
- As etapas de imagem e vídeo no desktop usam um único botão de rodapé com a próxima ação explícita; avançar registra aprovação de textos, roteiro e narração. Geração paga e render continuam sob confirmação.
- Revisão de artes, vídeo e arquivos de entrega usa decisões explícitas: **Aprovar/Aprovado** fica verde; **Pedir revisão/Revisão solicitada** fica vermelho. Cada arte ainda exige decisão individual.
- Removidos botões duplicados de salvar, gerar, renderizar e avançar dos painéis. O rodapé fica sticky. Textos e roteiro salvam antes de aprovar quando há alterações.
- A jornada de vídeo só considera roteiro aprovado como concluído; versões antigas não bloqueiam a revisão do render mais recente. Corrigir vídeo desaprova a versão atual antes de enviar a solicitação.
- No mobile, as telas de imagem têm uma ação de avanço derivada do estado do lote; aprovação de roteiro envia `confirm: true`.
- Verificado: typecheck, lint, suíte (284/284), smoke, build e preview Chromium. Sem chamadas reais pagas de geração, narração ou render.

### Não lançado — Estilo visual do vídeo na renderização e na revisão
- Nas etapas "Renderizar no VideoGo" e "Revisar o vídeo" há o painel "Estilo visual do vídeo": 5 estilos prontos (colagem, tribunal 3D, tecnologia 3D, autoridade com foto, documental Vox) e um campo para descrever o estilo em texto ou colar um prompt, sozinho ou combinado a um estilo pronto.
- Aplicar o estilo pede confirmação explícita. Na etapa de revisão, o aviso informa que a IA prepara a nova prévia e, ao terminar, volta para Renderizar no VideoGo; a pessoa confirma lá a geração do novo MP4. O vídeo atual permanece para comparação e a narração não é refeita.
- O estilo escolhido fica gravado no projeto e vai a toda sessão futura do agente de vídeo, para que correções não o desfaçam.
- Não verificado: execução real do agente de vídeo e render com o novo estilo.

### Não lançado — Modo Studio e "Gravar cena" sem tela
- O CSS do Modo Studio (overlay do teleprompter) tinha sumido de `styles.css`; sem ele, o overlay abria embutido no fim do painel, fora da tela, e parecia que o botão não fazia nada. Estilos restaurados (tela cheia, `position: fixed`).
- Na escolha "Usar narração / Seguir sem narração", o texto ficava abaixo do botão de rádio; agora ficam na mesma linha.
- Não verificado em Electron: microfone real e permissão de áudio.

### Não lançado — Windows sem pedido da Microsoft Store e instalação de pré-requisitos
- O diagnóstico procurava o Python no PATH e executava `python.exe`/`python3.exe` da pasta `WindowsApps`. Em um Windows sem Python, esses são atalhos da Microsoft Store: executá-los abre a Store pedindo para instalar. Agora os atalhos sem Python real por trás são ignorados (o Python da Store de verdade continua aceito).
- A instalação por WinGet forçava `--scope user`, mas o Node.js LTS só tem instalador para a máquina toda, então a instalação falhava e derrubava Node, npm, Codex e Claude Code. Agora o WinGet escolhe o escopo (prefere usuário e cai para máquina, com o aviso de administrador do Windows).
- Depois de instalar Python, Git, Node ou GitHub CLI, o app não os achava até reiniciar, porque o PATH do processo é fixado na abertura. Agora procura nos destinos padrão (`%LOCALAPPDATA%\Programs\Python\Python3xx`, `Git\cmd`, `Program Files\nodejs`, `GitHub CLI`) e segue sem reiniciar.
- Sem WinGet, a mensagem agora aponta o site oficial de cada ferramenta em vez de mandar instalar o App Installer pela Store.
- O Studio passava o PATH novo junto com o `Path` original do Windows, e o processo filho podia receber o antigo. Agora a variável é substituída ignorando maiúsculas, para Git, Node e Python recém-instalados valerem nas tarefas.
- Claude Code no Windows exige o `bash.exe` do Git for Windows e não o achava com o Git fora do PATH. O Studio agora define `CLAUDE_CODE_GIT_BASH_PATH` a partir do Git encontrado.
- A leitura da conta do Codex rodava com `shell: true`, que quebra em perfis com espaço no nome (ex.: `C:\Users\Maria Silva`). Agora usa o mesmo lançador seguro das outras tarefas.
- Launchers npm sem `node.exe` ao lado (Codex e Claude em pasta privada) agora procuram o Node no PATH e em `Program Files\nodejs`.
- Instalação de motores no Windows usa `core.longpaths=true`, porque `node_modules` dentro de `%APPDATA%` passa de 260 caracteres.
- Notificações nativas e agrupamento na barra de tarefas: o app define o AppUserModelID do instalador (`com.maquinadeconteudo.studio`).
- Não verificado em Windows nativo: só typecheck, lint e testes no Linux.

### Não lançado — instaladores e atualização entre versões
- Linux: a instalação de pré-requisitos por `pkexec` rodava `apt-get install`, `dnf install` etc. sem confirmação automática. Com o job sem terminal, o gerenciador pedia "Continuar? [S/n]", lia o fim da entrada e abortava. Agora usa `-y` (apt, dnf), `--noconfirm` (pacman) e `--non-interactive` (zypper). Não executado aqui: exige root e distribuição real.
- macOS: apps abertos pelo Finder não têm `/opt/homebrew/bin` no PATH, então Node, Git e FFmpeg do Homebrew em Apple Silicon não eram achados. Agora a pasta entra na busca.
- macOS: `/usr/bin/git` e `/usr/bin/python3` são atalhos que abrem o diálogo da Apple "instalar ferramentas de desenvolvedor" quando elas não existem, o mesmo problema do atalho do Python na Windows Store. O diagnóstico agora os ignora sem as ferramentas.
- macOS: o app não instalava nenhum pré-requisito ("disponível apenas para Linux e Windows"). Agora instala Git, Node, Python, FFmpeg, GitHub CLI e cloudflared pelo Homebrew, se ele existir. O cloudflared ainda baixava o binário de Linux no macOS.
- macOS: o app tentava baixar ~110 MB de atualização a cada 6 h só para falhar, porque o Squirrel.Mac recusa app sem Developer ID. Agora ele confere a assinatura ao abrir e, sem Developer ID, mostra como atualizar manualmente.
- macOS: o electron-builder 26 não assina quando não há certificado (sem fallback ad hoc). O build agora usa `identity: "-"` e `hardenedRuntime: false`, para o Gatekeeper tratar o app como "desenvolvedor não identificado". Não testado em Mac real.
- Release: novo passo `scripts/verify-release-assets.mjs` antes de publicar. Confere os três `latest*.yml` contra os arquivos (versão da tag, nome, tamanho e sha512).
- Conferido na release pública v0.2.2: `latest.yml`, `latest-mac.yml` e `latest-linux.yml` apontam para assets que existem, com tamanhos iguais, e os sha512 do `.exe`, do AppImage e do `.zip` do macOS batem com os arquivos publicados. Existem blockmaps para atualização diferencial no Windows e no macOS. O `app-update.yml` do pacote aponta para o repositório certo.
- Windows NSIS define agora a instalação por usuário como padrão (`perMachine: false`, sem selecioná-la para todos). Atualizações dessa instalação não pedem UAC; a opção para todos continua disponível no assistente.
- No VideoGo Linux, se Node do sistema faltar ou for anterior a 22, o Studio baixa Node 22 oficial para uma pasta privada, confere SHA-256 pelo manifesto publicado no nodejs.org e valida a versão antes de ativar. Não altera o Node do sistema; suporta Linux x64/arm64 e requer `tar`.
- O CI macOS agora valida a assinatura do ZIP com `codesign --verify --deep --strict` e exige `Signature=adhoc`; uma assinatura quebrada não chega à release.

### Não lançado — volume de áudio e vídeo muito baixo no Linux
- No Linux, o Studio agora se identifica ao PipeWire/PulseAudio como "Máquina de Conteúdo". Antes o áudio saía como "Chromium", e o gerenciador de sessão restaurava para ele o volume salvo de qualquer outro app Chromium (aqui −36 dB), deixando todo vídeo e áudio do Studio quase inaudível. Os arquivos gerados não estavam baixos (renders em cerca de −14 LUFS).

### Não lançado — revisão do vídeo e produção com IA a partir de posts
- Ao terminar o render, o Studio abre sozinho a etapa **Revisar o vídeo**, com o player maior para vídeos verticais. Antes a tela ficava no card do job e o player parecia não existir.
- A revisão tem **Aprovar vídeo**, **Pedir revisão** e **Editar cenas**. Pedir revisão manda o pedido ao Claude Opus 5.5 (com a folha de contato do render atual), que altera roteiro e animação e confere uma prévia; o Studio leva você à etapa de render para renderizar de novo. O vídeo anterior continua disponível para comparação.
- A narração derivada de um post não gera mais "?." quando o título já termina em pontuação.
- A versão inicial desta produção derivada de post usava Codex ImageGen para gerar um PNG por cena e Claude para o motion. Esse pipeline foi substituído em 2026-11-15; a versão atual usa uma única sessão Claude Opus para cenas e composição, sem PNGs de cena do Codex.

## 2026-11-14

### Não lançado — sem travessão e sem estilo de IA nos textos
- Todo agente (texto, imagens, vídeo, capa e copy) recebe uma regra de escrita: nada de travessão, texto natural e sem os vícios de IA ("não é X, é Y", "mergulhe", "jornada", listas em trio e similares).
- O Studio remove travessões de tudo o que entrega ao agente (título, briefing, notas, prompt livre ou modelo), independente do prompt. A legenda de entrega escrita pelo Claude também sai sem travessão.
- Headline, copy e texto na tela com travessão não podem ser salvos, e a revisão bloqueia a aprovação até você reescrever. No vídeo, roteiro com travessão na narração, no texto falado ou no texto na tela não pode ser aprovado nem renderizado.
- Modelos de prompt, título sugerido ("Carrossel: assunto"), título derivado e regras do Studio foram reescritos sem travessão.
- Carrossel "Guarda": a copy da página 2 foi reescrita sem travessão.

### Não lançado — cancelar geração
- O card de andamento (texto, imagens, vídeo, capa e copy, narração) tem o botão **Cancelar geração**. Ele pede confirmação, interrompe o processo e mantém o card mostrando "Cancelado.", com as ações de gerar liberadas para você revisar e gerar de novo.
- Render de vídeo cancelado ou que falha apaga o MP4 incompleto (e os arquivos gravados junto dele); antes ele podia aparecer na revisão como se fosse um vídeo válido.
- Rodada de imagens cancelada fica marcada como "cancelada por você", sem tocar nas imagens já existentes.

### Não lançado — biblioteca de prompts de imagem em post e Story
- Ao criar um post único ou Story no PostNow, a lista de modelos de prompt aparece (antes só havia "Escrever meu próprio prompt"). Cada modelo tem versão para uma única arte.
- A direção visual do modelo escolhido é enviada direto à geração das imagens e ao prompt do projeto nativo no PostNow, sem depender de o agente repeti-la. Ela continua valendo se você editar o texto do prompt.
- Os modelos deixam de pedir "canto inferior limpo com fundo uniforme" e passam a pedir arte até as quatro bordas.

### Não lançado — artes sem faixa e poses variadas
- A geração e o "Refazer" pedem a composição preenchendo todo o quadro, sem faixa branca no rodapé, e essa regra vale sobre prompts antigos.
- A foto de referência da marca fixa só o rosto; pose, roupa e cenário são criados por prompt, e cada projeto começa de uma cena diferente (capa e fechamento nunca iguais).

### Não lançado — revisão de vídeo e render
- A revisão de vídeo mostra só renders de `renders/review` e `renders/final`; no modo narrado, só os que têm faixa de áudio (conferida com FFprobe).
- O Studio não passa mais `--no-hud` ao VideoGo, que removeu a opção (o HUD já vem desligado).

## 2026-11-13

### Não lançado — visualização ampliada em carrossel
- "Ampliar" na revisão de imagens não corta mais a imagem: cada slide aparece inteiro, na proporção original, ajustado à altura da janela.
- A visualização funciona como carrossel: slides vizinhos aparecem esmaecidos nas laterais, com setas sobre a imagem, pontos de navegação e rolagem horizontal por trackpad ou arrasto. Clicar num vizinho leva até ele.

## 2026-11-10

### Não lançado — login do Codex em Motores & Setup
- "Entrar na conta" do Codex não fazia nada: o diretório `codex-home` do app não era criado, e o Codex CLI saía com erro antes de pedir o código. O diretório agora é criado antes de qualquer execução do CLI.

### Não lançado — onboarding de Motores & Setup
- Os cards "Carrossel ou post" e "Vídeo de curiosidades" têm layout próprio: título e subtítulo em linhas separadas, ícone sem sobreposição.
- O rótulo "Agente" do passo B fica na mesma linha do select.

### 0.2.2 — README e screenshots no repositório
- README compactado, com os três screenshots versionados em `docs/screenshots/`.
- Sem mudança de código do app em relação à 0.2.1; a release só traz a documentação atualizada.

### 0.2.1 — correção do submenu de Motores & Setup
- As abas "Motores & CLIs" e "ElevenLabs & Voz" não são mais cortadas em janelas estreitas; quebram para outra linha.
- Publicada pela tag `v0.2.1` (o runbook proíbe mover tag publicada).

### 0.2.0 — atualização automática do app
- O app baixa novas versões em segundo plano, instala ao fechar e mostra **Reiniciar e atualizar** quando estiver pronto.
- Verificação de atualização 15 s após abrir e depois a cada 6 h.
- Release por tag gera `.exe` (Windows), `.dmg` e `.zip` (macOS arm64), AppImage e `.deb` (Linux).
- Limites: macOS só atualiza com build assinado; `.deb` é atualizado manualmente.

## 2026-11-09

### Vídeo
- Modelo de vídeo fixo em Claude Opus 5.5, com acesso real ao VideoGo (leitura do motor, `project validate|sound|render|sheet`).
- Storyboard com título, foto da marca (`assetPath`) e composição 3D (`compositionId`).
- Composição autoral escrita pelo agente (Opus 5.5 medium), sincronizada às palavras da narração; render em 1080×1920 com `h264_nvenc`.

### Entrega e capas
- Capa salva antes da copy: se o Claude falhar, a capa paga do Codex não é descartada.
- Nova ação **Gerar só a copy (Claude)** e **Gerar só a capa (Codex)**.
- Capa com título exato, pessoa fiel às fotos reais, logo oficial aplicada por cima e conferência de até 3 tentativas.

### Fluxo do Studio
- "Avançar" aprova a etapa e abre a próxima; sumiram os "Aprovar" por cena.
- "Gerar áudio" aprova texto/voz junto e já confirma o envio ao ElevenLabs.
- Runs de Claude e Codex usam `CLAUDE_CONFIG_DIR` e `CODEX_HOME` isolados em `<dataDir>`; não leem `~/.claude` nem `~/.codex`.

### Setup e contas
- Submenu ElevenLabs no menu Motores & Setup, com banner de status e layout redesenhado.
- Contas logadas visíveis: GitHub, Codex e Claude (e-mail e plano), lidas pelas CLIs oficiais.

### Biblioteca de projetos
- Criação separada da biblioteca; quantidade filtrada; ausência de capa explícita.

## 2026-11-08

### Revisão geral
- Aprovações editoriais fail-closed, com reconciliação e `claims.json` validado.
- Referência de narração órfã é removível e não fica invisível.
- Contrato do VideoGo v1 aparece como aviso no Studio e recusa o render.
- Falha de comando mostra código e comando.
- Recorte da capa 1448×1086 sem corte.

## 2026-11-07

### Formatos
- Formato 4:5 removido. Projeto com formato removido abre com aviso, sem migração.
- Formato escolhido por rodada; regerar refaz a rodada com o formato escolhido.
- Rodada entregue não é sobrescrita por status ilegível.

### ElevenLabs
- Chave validada pelo status HTTP: 401 sem permissão recusa e não salva; 401/403 com `missing_permissions` salva com aviso; 429 e erro de rede têm mensagens próprias.

### Narração
- Narração por cena, com áudio próprio (upload de mp3 ou gravação) e remoção por cena.
- Modo Studio: teleprompter com gravação de áudio. Câmera continua negada.
- Render recusa cena sem áudio.

## 2026-11-05

### 0.1.0
- Inicialização do repositório e do pipeline de release.

### 0.1.1
- Upload de artefatos de release pode ser refeito sem erro.
- Manifests de atualização (`latest*.yml`) alinhados aos nomes dos artefatos.

### Depois da 0.1.1 (mesmo dia)
- Diagnóstico de motores e narração com ElevenLabs.
- Comparação de custo entre modelos de CLI.
- Configurações do ElevenLabs movidas para o setup de motores.
- Guia completo de setup e plataforma.
