# Decisões Técnicas — Máquina de Conteúdo

## ADR-001: Autenticação via GitHub OAuth Device Flow
- **Contexto**: O app precisa rodar no desktop (Electron/Linux App) e verificar se o usuário tem acesso aos repositórios/containers de VideoGo e PostNow.
- **Decisão**: Utilizar o OAuth Device Flow (`https://github.com/login/device/code`), igual ao GitHub CLI (`gh`).
- **Motivo**: Não requer armazenamento de client secret no binário do app nem inicialização de servidor web local de callback sujeito a bloqueios de firewall.

## ADR-002: Arquitetura de Interface Híbrida (Terminal + Visual Studio)
- **Contexto**: O usuário quer ver as imagens, gerenciar pastas e aprovar carrosséis visualmente, mas também precisa de uma pegada terminal/hacker para rodar e inspecionar tarefas pesadas de IA, FFmpeg e CLI.
- **Decisão**: Adotar layout split com Visual Workspace central (carrossel swipe, QA contact sheet, player MP4) e Console Terminal integrado com `xterm.js` no drawer inferior.
- **Motivo**: Combina velocidade e visibilidade de engenharia com fluidez de revisão de mídia.

## ADR-003: Ponte de Conteúdo Interoperável (Image <-> Video Bridge)
- **Contexto**: O usuário precisa reaproveitar projetos de imagem para gerar vídeos e vice-versa.
- **Decisão**: O app atua como compilador de dados entre os esquemas do PostNow (`project.json`, `claims.json`, `storyboard.md`) e do VideoGo (`storyboard.json`, assets, timing de cenas).
- **Motivo**: Elimina trabalho duplicado de redação de claims e copy, potencializando a produtividade de criação multiformato.

## ADR-004: Doctor Engine & Zero-Setup Provisioning para Leigos
- **Contexto**: Usuários não-técnicos não sabem compilar código, configurar variáveis de ambiente PATH, instalar FFmpeg ou resolver dependências do Python e Node.
- **Decisão**: O aplicativo embarca um subsistema de autoprovisionamento (Doctor Engine) que detecta, instala (via npm/winget/MinGit ou binários standalone em `~/.maquinadeconteudo/bin`) e valida todas as ferramentas no primeiro boot.
- **Motivo**: Remove 100% da barreira de entrada técnica, permitindo que qualquer leigo use a ferramenta em minutos.

## ADR-005: Agentes de IA (Claude Code & Codex) como Motores de Execução
- **Contexto**: O usuário leigo não conhece comandos de CLI como `postnow project check` ou `videogo project render`.
- **Decisão**: O aplicativo traduz pedidos em linguagem natural em chamadas direcionadas aos agentes de IA (Claude Code CLI e Codex CLI), guiados pelas regras e otimizações de token do Orquestrador Maestro.
- **Motivo**: O leigo ganha uma agência inteira de produção de conteúdo operando via chat/prompt, enquanto devs continuam com acesso livre ao terminal integrado.

## ADR-006: Arquitetura Avançada de Terminal Baseada no OMP
- **Contexto**: Terminais comuns travam ao receber fluxos volumosos de vídeo/IA (FFmpeg, Whisper), poluem o scrollback com milhares de linhas de progresso e deixam processos zumbis ao cancelar tarefas.
- **Decisão**: Adotar os padrões arquiteturais do OMP: separação entre histórico imutável e viewport volátil diferencial, fila com backpressure de 64 chunks no PTY, cancelamento atômico children-first (`killTree`), cards semânticos colapsáveis e canal JSONL RPC estruturado.
- **Motivo**: Garante performance fluida de 60fps na UI do Electron, scrollback legível para leigos e zero consumo indevido de CPU por processos órfãos.

## ADR-007: Política de logo por rodada e identidade declarada por página (PostNow)
- **Status**: parcialmente superseded pelo ADR-019. `client_portrait` deixa de ficar fora: com retrato aprovado no perfil PostNow, o Studio oferece a escolha. As demais decisões seguem valendo.
- **Contexto**: o motor PostNow exige `generation_policy` no `project.json`, `depicted_person` em cada página e marcadores no prompt. O Studio não gravava esses campos, e o smoke falhou por isso. A política de logo precisava variar por rodada sem reescrever o projeto.
- **Decisão**: o Studio pergunta a política de logo ao gerar (`cover-closing`, `all-pages`, `none`) e a passa a `finalizePostNowBatch`, sem gravá-la no `project.json`. `depicted_person` é obrigatório por página (`none` ou `other_person`), sem valor padrão silencioso. O contrato do motor (`generation_policy`, marcadores e instrução de identidade) é composto na sincronização; os arquivos de prompt do Studio não são reescritos. `client_portrait` fica fora: o motor exige retrato do dono via `postnow client set-portrait`, que o Studio não gerencia.
- **Motivo**: logo por rodada permite comparar políticas sem alterar o projeto; exigir a identidade declarada evita prompt ambíguo sobre pessoas na arte.

## ADR-008: Permissões do Electron por allowlist e cópia do terminal
- **Contexto**: `src/main/electron.ts` negava todas as permissões de sessão, inclusive `clipboard-sanitized-write`. `navigator.clipboard.writeText` falhava com "Write permission denied", e o console não copiava trechos nem o log.
- **Decisão**: `src/main/permissions.ts` concede somente `clipboard-sanitized-write` e nega o restante. O console oferece "Copiar seleção" (desabilitado sem seleção) e "Copiar tudo" (log completo do job, sem sequências ANSI); Ctrl+C copia a seleção quando há uma.
- **Motivo**: menor concessão que resolve o bug. O log completo é o insumo de debug; a seleção permite enviar só o trecho relevante.

## ADR-009: Revisão imagem a imagem com rodada incompleta bloqueada
- **Contexto**: refazer uma rodada inteira regenerava páginas já aprovadas. Rodadas interrompidas ou com contagem divergente permitiam decisões sobre arquivos incompletos.
- **Decisão**: decisões por página (`Manter`/`Refazer`, mutuamente exclusivas) só na rodada mais recente e `ready` (`readRevisionSnapshot`, `reviewPlan`). `agents.reviseImages` gera apenas as páginas refeitas; páginas mantidas são copiadas para `.input` e conferidas por sha256. `detail()` marca lote interrompido ou divergente como `failed`.
- **Motivo**: evita custo e variação de regenerar páginas aprovadas e impede decisões sobre rodada incompleta. Aprovação só passa à nova versão com bytes idênticos.
- **Alternativas**: regenerar a rodada inteira (custo e variação); revisar sem regerar (sem efeito); tratar rodada incompleta só na UI (sem persistência do estado).
- **Consequências**: a rodada anterior perde aprovações e marcas; para recuperar uma rodada `failed` é preciso criar nova rodada.

## ADR-010: Exclusão de imagem com journal recuperável
- **Contexto**: apagar imagem do disco e do projeto em etapas podia deixar o projeto inconsistente se a operação fosse interrompida.
- **Decisão**: `deleteProjectAsset` grava journal em `appData/.studio/workspaces/<sha256>/asset-deletions/` (0700/0600); `recoverPendingAssetDeletions` o retoma antes de ações de agente; `requireNoPendingAssetDeletion` bloqueia geração enquanto houver journal. Só arquivos em `generated/` são aceitos; `.input` é recusado. `finishAssetDeletion` invalida a rodada (`failed`).
- **Motivo**: a exclusão é permanente e precisa ser recuperável sem deixar referências órfãs.
- **Alternativas**: apagar sem journal (falha deixa estado parcial); lixeira (mantém o arquivo, contrário ao pedido de remoção do disco).
- **Consequências**: a rodada afetada deixa de ser utilizável e exige nova geração; journal fora do workspace, não confiável como entrada.

## ADR-011: Encadeamento manual entre imagem, vídeo e render
- **Contexto**: derivar imagem em vídeo ou renderizar vídeo custa tempo e pode envolver voz paga.
- **Decisão**: `projects.bridge` e `projects.render` são acionados apenas por ações da UI em `Studio.tsx`. `finalizePostNowBatch` em `agents.ts` não chama bridge nem render. Derivação imagem para vídeo gera storyboard sem render.
- **Motivo**: a pessoa decide cada etapa cara; o consentimento de render permanece explícito.
- **Alternativas**: encadeamento automático após finalizar imagens (menos controle sobre custo e voz).
- **Consequências**: o usuário dispara render e conversão manualmente.

## ADR-012: Abrir pasta com xdg-open no Linux e registro de pastas escolhidas
- **Contexto**: `shell.openPath` bloqueava o processo principal no Linux. `app.open` aceitava apenas caminhos internos, impedindo abrir pastas escolhidas pelo usuário.
- **Decisão**: `openFolder` (`src/main/open-folder.ts`) usa `spawn('xdg-open')` detached com `unref()` no Linux e `shell.openPath` nas demais plataformas (não verificado nesta rodada). `app.pick` com diretório registra a pasta (máx. 20, realpath, em memória); `app.open` aceita workspace, dataDir ou pasta registrada.
- **Motivo**: evita travar a interface e mantém `app.open` restrito a pastas autorizadas pelo usuário.
- **Alternativas**: `shell.openPath` em todas as plataformas (bloqueio no Linux); allowlist fixa sem registro (impede abrir pastas escolhidas).
- **Consequências**: o registro some ao reiniciar o app; pastas além de 20 registros deixam de ser abertas até nova escolha.

## ADR-013: Exportação ZIP sem dependências e sem Zip64
- **Contexto**: o export de pasta exigia copiar o conteúdo manualmente; era preciso entregar um arquivo único.
- **Decisão**: `writeZipFile` (`src/main/zip.ts`) grava ZIP com método STORE, CRC32 de `node:zlib`, `open(…,'wx')` e limpeza em erro. `projects.exportZip` exige ao menos um asset aprovado e usa o mesmo conteúdo do export de pasta.
- **Motivo**: uma entrega única sem nova dependência e sem sobrescrever destino existente.
- **Alternativas**: biblioteca de compressão (nova dependência); Zip64 (complexidade não necessária ao escopo atual).
- **Consequências**: sem compressão; arquivos acima de 4 GB são recusados com erro explícito; máximo de 65535 entradas.

## ADR-014: Perguntas dos agentes respondidas em nova sessão
- **Contexto**: jobs de agente rodam com `interactive:false` e `respond` exige PTY (`src/main/supervisor.ts`), então não é possível responder à pergunta na mesma sessão.
- **Decisão**: `composeAgentFollowUp` (`src/shared/agent-followup.ts`) monta novo prompt com pedido original, última mensagem e resposta; `answerAgent` (`Studio.tsx`) envia após confirmação. `withAgentRules` ao ramo de texto orienta o agente a listar perguntas em "Perguntas para o usuário" (`agentAskedQuestions`).
- **Motivo**: evita abrir PTY para jobs de texto e mantém o envio sob confirmação.
- **Alternativas**: PTY para agentes de texto (mais superfície e estado); reenvio automático sem confirmação (contraria a aprovação explícita).
- **Consequências**: após reinício, `rootPromptRef` some e o pedido original cai no fallback "Continue o pedido anterior deste projeto.".

## ADR-015: Imagem final sem recorte; só escala com tolerância de 1%
- **Status**: parcialmente superseded pelo ADR-018 e pelo ADR-022. A tolerância de 1% foi revogada; o 4:5 aceitou recorte centralizado de até 3% por lado até ser removido do app (ADR-022). Mantida a proibição de preenchimento, colagem e composição.
- **Contexto**: o PostNow encaixava a arte do Codex ImageGen no formato final por recorte, e o recorte removia conteúdo. Pedido do usuário: a imagem sai inteira do ImageGen, sem recorte, colagem ou composição depois.
- **Decisão**: `CONFORM_SCRIPT` (`src/main/content/postnow.ts`) só redimensiona ao quadro final quando o desvio de proporção é de até `MAX_RATIO_DRIFT = 0.01`. Acima disso sai com código 3 e a rodada falha com "A página N tem proporção incompatível com WxH; cortar mudaria o conteúdo. Gere uma nova rodada." O prompt GERE pede a largura e a altura do formato (`POSTNOW_FORMATS`).
- **Motivo**: a escala é a única transformação aceita; qualquer outra altera a arte gerada.
- **Alternativas**: recortar (contraria o pedido); preencher com barras ou esticar (compõe ou distorce a arte).
- **Consequências**: o Codex ImageGen entrega 1024x1024, 1024x1536 ou 1536x1024. Só 1:1 fecha em 1080x1080; 4:3, 4:5 e 9:16 falham até decisão do usuário (ver "Decisões pendentes", item 1).

## ADR-016: Referências de marca como entrada de imagem do ImageGen
- **Contexto**: referências de marca eram só texto no contexto. O pedido exige que elas participem da geração e da correção.
- **Decisão**: `imageGenerationReferences` (`src/shared/brand-references.ts`) escolhe até `IMAGEGEN_REFERENCE_LIMIT = 10` referências `kind === 'image'` com extensão `.png`, `.jpg`, `.jpeg` ou `.webp`. Cada uma vira um `--image <arquivo>` do Codex em GERE e em REFAÇA (`src/main/agents.ts`). O prompt vem antes das flags e o comando não usa `--`, porque `--image` é variádico.
- **Motivo**: texto não transmite identidade visual; entrada de imagem transmite.
- **Alternativas**: rasterizar PDF (não feito: exige escolher página e resolução); enviar todas as referências (limite do CLI não verificado).
- **Consequências**: PDF, SVG, GIF, AVIF, excedentes e caminhos com vírgula ficam só no `.studio-context`. A regra da vírgula é defensiva, porque o `--image` do Codex pode separar valores por vírgula; não verificado no binário instalado. Limite e formatos seguem em "Decisões pendentes", item 4.

## ADR-017: Etapa Textos sem prompts e sincronização com o arquivo de arte
- **Contexto**: a etapa Textos mostrava função visual e prompt de cada página, e editar a headline não mudava o arquivo de arte que o Codex usa. O usuário revisa o texto da arte, não o prompt.
- **Decisão**: a etapa mostra por página headline, copy e "Quem aparece na arte". `VisualTextEditPage` e `GenerationPageReview` (`src/shared/contracts.ts`) carregam só `page`, `headline`, `copy` e `depictedPerson`. `saveVisualText` (`src/main/projects.ts`) grava headline e copy no arquivo de arte com `applyArtText` (`src/shared/visual-text.ts`): troca a copy primeiro (`replaceAll`) e depois a headline fora da copy nova (`replaceOutside`). Se o texto anterior não está no arquivo, nada é gravado e o save falha com "Use Preparar textos para o agente refazer esta página." Salvar texto alterado remove a aprovação. A instrução do agente (`src/main/agents.ts`) pede headline e copy literais em cada prompt. A geração de imagem usa um `imageRequest` interno, sem textarea nem biblioteca de prompts na tela.
- **Motivo**: o usuário precisa revisar o texto sem ler prompt; sem sincronização, a arte podia sair com texto antigo.
- **Alternativas**: editar o prompt inteiro (rejeitado: expõe o prompt e permite divergência com a headline); regenerar o prompt por agente a cada save (rejeitado: custo e demora; "Preparar textos" continua disponível).
- **Consequências**: página sem headline ou copy correspondente no arquivo não sincroniza; `replaceOutside` troca a headline em todo o arquivo fora da copy; o gate `buildVisualReview` valida copy e função visual, não a headline; `contentHash` não usa `pages` da revisão, então mudança de forma não invalida aprovações existentes; prompts de sessões antigas sem headline literal exigem "Preparar textos"; criação de projeto e roteiro de vídeo ainda mostram prompts (pendência 6).
- **Verificação**: E2E 4:5 com stand-in: sincronização positiva e teste negativo sem escrita parcial (`DEV/VERIFY.md`, "Rodada 2026-11-07").

## ADR-018: Formato 4:5 fechado por recorte centralizado de até 3% por lado
- **Status**: parcialmente superseded pelo ADR-022: o formato 4:5 foi removido do app; a regra de recorte centralizado de até 3% por lado permanece para 1:1, 4:3 e 9:16.
- **Contexto**: o Codex ImageGen nativo não recebe tamanho e entrega dimensões variadas. Em `~/.codex/generated_images` há 230 PNGs: 1122×1402 (87), 1672×941 (78), 1092×1440 (23), 1254×1254 (16) e outras. A rodada `1794090447511-af60e76f` falhou: 6 páginas 1092×1440 (razão 0,758 contra 0,8; desvio de 5,2%) passam da tolerância de 1% do ADR-015. Pedido: o formato 4:5 (1080×1350) deve fechar.
- **Decisão**: `planCenterCrop` (`src/main/content/conform.ts`) calcula o recorte centralizado que leva a imagem à proporção do formato e aceita se cada lado cortado for de até `MAX_CROP_PERCENT_PER_SIDE = 3`%. Exemplo: 1092×1440 corta 37 px em cima e 38 px embaixo (2,57% e 2,64%) e é redimensionado a 1080×1350 (LANCZOS). Acima do limite, a página é recusada com "…exigiria recortar mais de 3% por lado. Gere uma nova rodada." Páginas ajustadas entram na rodada `ready` com aviso para revisar antes de aprovar. Os prompts GERE, REFAÇA e REQUEST mencionam o recorte de até 3%.
- **Motivo**: a usuária escolheu a opção B (recorte 4:5 centralizado) entre as alternativas apresentadas. Não muda o gerador nem usa API paga.
- **Alternativas**: manter 1% (aceita 87 de 230 saídas, todas 1122×1402); limite de 10% por lado (medido com cópia temporária de `conform.ts`: 4:5 passa a 119 de 230, +9, com cortes de até 8,3% por lado; 1:1 passaria a 103, com cortes de até 10%; não adotado, porque o ganho é pequeno frente ao corte); API gpt-image-2 em 1088×1360 (paga; exige `OPENAI_API_KEY`, ausente); pedir 1088×1360 no prompt (o binário nativo não tem parâmetro de tamanho, então não garante); preencher ou esticar (ADR-015).
- **Consequências**:
  - Aceite por página, nas 230 PNGs em `~/.codex/generated_images` (todas as gerações Codex desta máquina, não só deste formato): 4:5 110 (47,8%); 1:1 16 (7,0%); 9:16 7 (3,0%); 4:3 2 (0,9%). Pela data de modificação, nas 20 mais recentes 4:5 aceita 19 e nas 50, 42. Dos 120 recusados em 4:5, 78 são 1672×941 (paisagem; exigiria cortar ~27% por lado). O recorte não resolve esse caso.
  - Rodada de 6 páginas sem recusa, assumindo páginas independentes: ≈74% com a taxa das 20 mais recentes e ≈35% com a das 50 [INFERÊNCIA; não medido em rodada nova].
  - O recorte remove até 3% de cada borda; elementos perto da borda podem sair. Na inspeção visual dos 6 PNGs, texto e títulos ficaram fora das faixas; só folhagem decorativa e borda de fundo caem.
  - O limite de 3% é proposta do agente, não aprovação explícita da usuária; ajustável em `MAX_CROP_PERCENT_PER_SIDE`.
  - 4:3 e 9:16 usam a mesma regra e fecham só quando a saída já está na proporção, ou quase.
- **Supersede parcial do ADR-015**: revoga a tolerância de 1% e a proibição de recorte em 4:5. Mantém a proibição de preenchimento, colagem e composição.
- **Verificação**: `tests/postnow-crop-plan.test.ts` (7 casos); validação offline com os 6 PNGs reais da rodada `1794090447511-af60e76f`; smoke temporário com entrada 1092×1440 (`"ok": true`). Detalhes em `DEV/VERIFY.md`, "2026-11-07 — Recorte 4:5 centralizado (ADR-018)". Sem geração Codex nova.

## ADR-019: Retrato da cliente em capa, última página e post único (PostNow)
- **Contexto**: a cliente (Patricia Ramos) não aparecia nas artes. O ADR-007 deixou `client_portrait` de fora porque o motor exige retrato aprovado no perfil PostNow, que o Studio não cadastra. O retrato já está no motor (`brand.owner_portrait`), mas o Studio não oferecia a escolha "Cliente (retrato aprovado)".
- **Decisão**: `portraitRequiredPages` (`src/shared/depicted-person.ts`, L20-23) torna obrigatória a cliente na página 1 e na última página de carrossel com mais de uma página; em post ou Story de página única, na página 1. Com retrato aprovado, essas páginas precisam de `depicted_person: client_portrait`; sem retrato, a escolha é recusada antes do motor (`buildVisualReview` em `src/main/projects.ts`; `synchronizeNativeProject` em `src/main/content/postnow.ts`, L149). A composição do prompt de motor (`composeEnginePrompt`, em `src/main/content/postnow.ts`) acrescenta o bloco `## Política de geração PostNow` com os quatro marcadores de política, `POSTNOW_DEPICTED_PERSON=<valor da página>` (`client_portrait`, `none` ou `other_person`) e a instrução de identidade correspondente; é idempotente. A regra da sessão de texto (`src/main/agents.ts`, L70-75) depende de `portraitApproved`: com retrato, pede `client_portrait` nas páginas de cliente; sem, proíbe. O Studio só lê `brand.owner_portrait` (`approvedPortraitAt`); o cadastro segue em `postnow client set-portrait <client_id> (--image references/<arquivo> | --clear)`.
- **Motivo**: com retrato aprovado, capa sem a cliente não atende a entrega. Cadastrar o retrato no Studio gravaria no perfil do motor, fora do escopo do app.
- **Alternativas**: (a) Studio cadastrar o retrato: rejeitado, grava no perfil do motor; (b) manter `client_portrait` fora (ADR-007): rejeitado, a cliente fica de fora mesmo com retrato aprovado.
- **Supersede parcial do ADR-007**: `client_portrait` deixa de ficar fora. Com retrato aprovado no perfil PostNow, o Studio oferece a escolha; sem retrato, ela é recusada.
- **Consequências**: o projeto da Patricia segue sem a cliente nas páginas 1 e 6 até decisão (itens 3 e 8 em "Decisões pendentes"). Prompts já gerados com "sem pessoas" não mudam sozinhos.
- **Verificação**: `tests/depicted-person.test.ts`. E2E com script descartável, sem Electron e sem geração: sem retrato, recusa antes do motor (0 chamadas de geração); com retrato, composição com `client_portrait` nas páginas 1 e 6, idempotente. Detalhes em `DEV/VERIFY.md`, "2026-11-07 — Retrato da cliente, textos automáticos e pedido com páginas".

## ADR-020: Textos gerados ao salvar a pauta de imagem, sem diálogo
- **Contexto**: a etapa Textos de imagem começava vazia, e "Preparar textos" pedia confirmação. Pedido da usuária: textos prontos para revisão ao salvar a pauta, sem passo extra.
- **Decisão**: `shouldAutoStartTextGeneration` (`src/shared/text-generation.ts`, L16-29) inicia a sessão de texto ao salvar uma pauta nova em projeto de imagem, quando a pauta não está vazia, é diferente da anterior, não há sessão ativa e nenhum texto está gravado (`hasTextContent`). `src/renderer/Studio.tsx` (L336-341) chama `startAgent({ request: imageRequestFor(brief), confirmed: true })` sem diálogo. Texto existente nunca é sobrescrito pelo disparo automático. "Preparar textos" (imagem) e "Preparar roteiro com IA" (vídeo) continuam com confirmação. `src/renderer/VisualTextEditor.tsx` mostra os cards preenchidos e editáveis.
- **Motivo**: o disparo automático elimina o passo manual entre salvar a pauta e revisar os textos.
- **Alternativas**: (a) manter só o botão: não atende a entrega; (b) regenerar a cada salvamento: sobrescreve texto revisado e gasta cota a cada save.
- **Consequências**: salvar pauta nova consome uma sessão do CLI de texto (não é ImageGen). Salvar pauta com texto já gravado não dispara nada.
- **Verificação**: `tests/text-generation.test.ts`; typecheck, lint e `npm test` 127/127. O disparo pela UI com sessão real não foi verificado (sem Codex real).

## ADR-021: Pedido de texto com o número de páginas do projeto
- **Contexto**: as receitas de carrossel da biblioteca de prompts (`src/renderer/prompt-library.ts`) diziam "5 slides" fixo, mesmo em projeto com outro número de páginas.
- **Decisão**: `promptRecipesFor` substitui `{{pageCount}}` pelo número de páginas do projeto; `src/renderer/Projects.tsx` passa o valor. Imagem única não tem seletor de páginas.
- **Motivo**: o pedido precisa bater com o projeto; "5 slides" em projeto de 3 ou 10 páginas pede texto para o número errado.
- **Alternativas**: manter "5 slides" fixo: rejeitado.
- **Consequências**: os prompts da criação de projeto e do roteiro de vídeo continuam visíveis fora da etapa Textos (item 6 em "Decisões pendentes").
- **Verificação**: `tests/prompt-library.test.ts`; matriz descartável com 3 receitas × 3, 10 e 5 páginas: 9/9 com "N slides" correto. Sem chamada ao agente.

## ADR-022: Remoção do 4:5, formato por rodada e status ilegível fechado
- **Contexto**: o ADR-018 fechava o 4:5 por recorte centralizado de até 3% por lado. Pedido da usuária: remover o formato 4:5 de código, UI e docs e permitir regerar imagens com o formato escolhido. Na mesma frente, o `.status.json` de uma rodada sem `updatedAt` (fixture inválida gravada por ferramenta externa) era lido como rodada crua e reprocessado, podendo sobrescrever rodada já entregue (fail-open).
- **Decisão**: `src/shared/formats.ts` mantém `story-9x16` (1080×1920), `post-1x1` e `carousel-1x1` (1080×1080), `post-4x3` e `carousel-4x3` (1440×1080); `DEFAULT_POSTNOW_FORMAT = 'carousel-1x1'` e `postNowFormatOrDefault` recusa id desconhecido ou removido ("Formato PostNow desconhecido ou removido; escolha outro formato."). Projeto com formato removido abre com `unsupportedFormat`, sem migração e sem reescrever `project.json`; geração e render ficam bloqueados com "O formato escolhido foi removido do app; escolha outro formato no Studio." até a escolha de outro formato. O seletor "Formato das imagens" na etapa de imagens grava a escolha na rodada (`BatchStatus.format`) e regerar com outro formato refaz a rodada inteira. `roundFormat` (`src/main/content/postnow.ts`) decide por rodada: status com `format` mantém o formato dela; rodada sem arquivo de status recebe o formato atual do projeto (entrada crua); status sem `format` é legado e recusado ("Esta rodada não tem formato registrado; gere uma nova rodada com o formato escolhido."); status presente mas ilegível é recusado ("O estado desta rodada está ilegível; gere uma nova rodada com o formato escolhido."), sem reinterpretação. `isRoundDelivered` trata rodada com `.mapping.json` e estado `ready`, ausente ou ilegível como entregue (falha fechada). Em `render()`, pré-checagens não gravam `failed`: o job falha com a mensagem no log e o `.status.json` fica inalterado.
- **Motivo**: a usuária pediu a remoção do 4:5 e a regeração com o formato escolhido; status ilegível não pode significar "processe de novo", porque a rodada pode já estar entregue.
- **Alternativas**: migrar projetos 4:5 automaticamente (rejeitado: a escolha de formato é da usuária); manter 4:5 só em leitura (rejeitado: o pedido é remover de código, UI e docs); aceitar `.status.json` sem `updatedAt` como cru (rejeitado: mudaria o contrato de `readBatchStatus`, usado por UI, export e derivação).
- **Consequências**: projetos existentes em 4:5 (incluindo o da Patricia, `carousel-4x5`) ficam bloqueados até a escolha de outro formato (pendência 13); imagens 4:5 já geradas permanecem nos projetos; as medições de aceite do ADR-018 sobre 4:5 são históricas (pré-ADR-022). Rodada legada sem formato registrado e rodada com status ilegível são recusadas sem reescrever o status.
- **Supersede parcial do ADR-018**: remove o formato 4:5; mantém o recorte centralizado de até 3% por lado para 1:1, 4:3 e 9:16.
- **Verificação**: `tests/formats.test.ts`, `tests/postnow-round-format.test.ts`, `tests/postnow-round-delivery.test.ts` e `tests/postnow-render-round.test.ts` (14/14 nos três arquivos de rodada); mutações descartáveis em cópia fora do repo derrubaram os testes correspondentes (predicado de entrega: 3 falhas; guarda de status ilegível: 2 falhas); FormatoVerify, item 5, PASS nos dois casos com `.status.json` byte a byte inalterado (`DEV/VERIFY.md`).

## ADR-023: Validação da chave ElevenLabs por status HTTP
- **Contexto**: a chave ElevenLabs não validava nem salvava: 401 e 403 eram tratados como chave inválida, e uma chave restrita (com permissão limitada) era recusada mesmo sendo válida.
- **Decisão**: `validateElevenLabsKey` (`src/main/elevenlabs.ts`) valida tamanho (16 a 512) e ausência de espaços antes de qualquer chamada e lista vozes para validar a chave. 401 sem `missing_permissions` recusa ("A API key ElevenLabs é inválida ou foi revogada.") e não salva; 401 ou 403 com `missing_permissions` salva com ressalva (`ElevenLabsStatus.warning`, "… Para narrar, a chave também precisa de text_to_speech."); 429 vira "Limite da ElevenLabs atingido. Aguarde antes de tentar novamente."; falha de rede tem mensagem própria; demais recusas "A ElevenLabs recusou a operação (HTTP n).".
- **Motivo**: 403 com detalhe de permissão reconhece a chave; exigir permissão completa recusaria chave válida. Testar TTS para comprovar permissão seria chamada paga.
- **Alternativas**: exigir listagem completa sem ressalva (rejeitada); validar com TTS (rejeitada: paga).
- **Consequências**: chave restrita é salva com aviso visível em `VideoGoVoiceSetup`; a validação não gera áudio nem confirma permissões de TTS/clonagem; a chave real não foi testada (não autorizado).
- **Verificação**: `tests/elevenlabs-key.test.ts` (5 testes com `fetch` stubado); NarracaoVerify confirmou a recusa de aprovação sem chave antes de qualquer rede.

## ADR-024: Narração por cena com áudio próprio e Modo Studio
- **Contexto**: pedidos da usuária: gerar o vídeo sem voz e adicionar a voz depois; aceitar áudio próprio; "Modo Studio" (teleprompter) com gravação. A importação de narração do VideoGo exige faster-whisper, ausente nesta máquina.
- **Decisão**: a narração fica por cena (`NarrationScene.audioAttached`/`audioSource`): upload de `.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg` ou `.flac` (`stageNarrationAudio`, com ffprobe) ou gravação do Modo Studio convertida por ffmpeg para `narration.m4a` (AAC 192k). `narrationGate` (`src/shared/narration.ts`) ativa a narração com voz ou áudio de cena e bloqueia o render de cena com texto sem áudio anexado e aprovado. O Modo Studio (`src/renderer/NarrationTeleprompter.tsx`) é um overlay com o texto da narração, `getUserMedia({audio:true})` e `MediaRecorder`, um take por cena e limite de 64 MB; a permissão Electron `media` (`src/main/permissions.ts`) é concedida só para áudio puro do próprio app, com câmera negada e `NSMicrophoneUsageDescription` no macOS. O registro legado `narrationAudio` é migrado só com hash atual igual e nome = id da cena; referência órfã é tolerada na leitura (`allowMissingNarration`) e estrita em importação e render. `removeNarrationAudio` exige `confirm === true`; texto alterado ou voz trocada remove o áudio da cena.
- **Motivo**: sem voz, o vídeo renderiza e a voz entra depois, sem chamada paga; narração em arquivo único depende de faster-whisper ausente.
- **Alternativas**: narração em arquivo único (rejeitada); narração por IA local SAPI ou Piper (pendente, pendência 12).
- **Consequências**: geração ElevenLabs substitui uploads com aviso; áudio de upload não exige aprovação de TTS; a UI de referência órfã mostra só "Enviar áudio" (o estado não expõe `stray`); microfone real, indicador e UI do Modo Studio não foram verificados em Electron.
- **Verificação**: `tests/narration-gating.test.ts`, `tests/narration-attach.test.ts` e `tests/permissions.test.ts`; NarracaoVerify (`DEV/VERIFY.md`) cobriu upload, gravação webm→m4a, remoção com confirmação e invalidação por texto alterado, sem rede e sem pago.

## ADR-025: Referência órfã de narração visível e removível; gate informa a chave ElevenLabs
- **Contexto**: divergências 1 e 2 de `DEV/VERIFY.md` (2026-11-07). A cena cuja referência de áudio aponta para arquivo ausente ou desatualizado mostrava só "Enviar áudio" (ADR-024), sem indicar que o render estava bloqueado por ela. O gate de narração não dizia que a cena sem áudio não podia ser gerada por falta da chave ElevenLabs.
- **Decisão**: `NarrationScene.stray` (`src/shared/contracts.ts`) é `ref !== undefined && file === undefined` (`src/main/projects.ts`). O Studio (`src/renderer/Studio.tsx`) mostra "Referência órfã: o áudio anterior está ausente ou desatualizado. Envie, grave ou remova." e habilita "Remover áudio" quando `audioAttached || stray`. O teleprompter (`src/renderer/NarrationTeleprompter.tsx`) mostra o status "referência órfã". `narrationGate` (`src/shared/narration.ts`) recebe `elevenLabsReady` (`Boolean(services.getElevenLabsKey())`) e acrescenta "Sem a chave ElevenLabs, só envio ou gravação." à cena sem áudio quando a geração é impossível. A aprovação parcial de cenas (divergência 3) não muda: só as cenas pendentes bloqueiam o render.
- **Motivo**: sem `stray`, a perda do arquivo bloqueava o render sem explicação nem ação clara. A remoção é a ação necessária, e a API existente já aceita referência órfã.
- **Alternativas**: apagar a referência ao carregar o projeto (rejeitada: altera o projeto sem ação da pessoa); tratar a órfã como áudio anexado (rejeitada: esconde a perda do arquivo).
- **Consequências**: `removeNarrationAudio` aceita a referência órfã sem mudança de backend. ADR-024 fica como histórico; a consequência dele "o estado não expõe `stray`" está superada por este ADR. A opção "gere" só aparece com chave ElevenLabs configurada (`src/shared/narration.ts` L112); o status do Studio (`src/renderer/Studio.tsx` L697) segue a mesma regra, via `snapshot.integrations.elevenLabs.configured`. Studio e teleprompter não foram verificados em Electron nesta rodada.
- **Verificação**: `tests/narration-stray.test.ts` ("narration audio whose file disappeared is reported as stray and can be removed"); `tests/narration-gating.test.ts` (11 testes, incluindo "stray audio blocks render even when the scene does not narrate" (L40), "stray audio without an ElevenLabs key does not promise generation" (L46), "a narrated scene without audio names the missing ElevenLabs key when generation is impossible" (L66) e "partially approved scene audio blocks render only for the scenes still pending" (L74)); smoke SSR descartável do teleprompter (removido) e tipagem.

## ADR-026: Resíduo root-owned em `~/.codex/tmp/arg0-linux` documentado, sem remoção
- **Contexto**: o CLI Codex emitiu `WARNING: failed to clean up stale arg0 temp dirs: Permission denied (os error 13)` (plano `.omx/plans/revisao-geral-20261108T050544Z.md`, §2.1, E1). Leitura de metadados, sem alteração: `~/.codex/tmp` é `bolzan:bolzan` (775); `~/.codex/tmp/arg0-linux` é `drwx------ bolzan` com 1458 entradas; dentro dele há itens `root:root` criados em 2026-10-31 (`codex-arg0SHASCv/`, `.lock`, `applypatch`, `apply_patch`, `codex-linux-sandbox`).
- **Decisão**: documentar o resíduo e não removê-lo (a remoção exige root). Nenhum `TMPDIR` nem código do app muda. O aviso não é reproduzido sem `codex exec` (pausa).
- **Motivo**: a origem dos itens root não está confirmada ([INFERENCE]: criados por execução do CLI com privilégio elevado em 2026-10-31). Alterar o ambiente sem prova pode afetar o estado de outra ferramenta.
- **Alternativas**: remover com privilégio elevado (rejeitada: sem autorização); apontar `TMPDIR` para outro diretório (rejeitada: sem reprodução, causa não comprovada); ignorar o aviso (rejeitada: sem registro).
- **Consequências**: o aviso é emitido pelo CLI Codex, não pelo app. O impacto no fluxo não foi medido; a classificação final depende de reprodução autorizada (AC13 i).
- **Verificação**: leitura de metadados (`ls -ld`, `stat`) em 2026-11-08, sem alteração de arquivos.

## ADR-027: Falha de comando do agente mostra código de saída e comando
- **Contexto**: a atividade do agente mostrava "Comando falhou" sem código nem comando. O plano (E3) registra `Comando falhou (código 128)` após "Consultando o repositório" e códigos 1 repetidos. A causa não foi confirmada; a hipótese (git ou shell em pasta sem `.git`) não foi testada.
- **Decisão**: em `src/shared/agent-events.ts` (`codexItem`, item `command_execution`), item com `exit_code` numérico diferente de zero vira "Comando falhou (código N): <comando>", com o comando desembrulhado e truncado no limite de atividade; sem texto, "Comando falhou (código N)". Prompts e regras do agente não mudam.
- **Motivo**: sem código e comando, a pessoa não consegue diagnosticar a falha. A mudança é de apresentação e não altera a decisão do agente.
- **Alternativas**: mudar prompts ou regras agora (rejeitada: causa não confirmada); ocultar falhas de comando (rejeitada: esconde informação).
- **Consequências**: o comando aparece na atividade e comandos longos são truncados. Se o comando contiver credencial, a exposição depende da redação de `src/main/supervisor.ts` L14–16 (aplicada em L81, L109 e L253), trecho pré-existente sem teste dedicado. A causa dos códigos 128 e 1 segue aberta até reprodução autorizada (`codex exec`).
- **Verificação**: `tests/agent-events.test.ts` (10/10), incluindo "names the failed command after its exit code, cut to the activity limit" e "reports a failed command with no text by its exit code alone".

## ADR-028: Texto de escala sem recorte para páginas ajustadas
- **Contexto**: logs do PostNow mostraram geração inicial de 1440×1080 (p1) e 1448×1086 (demais) para o formato 4:3. A mensagem de ajuste falava em "recorte centralizado", sugerindo corte. Medição sintética: `planCenterCrop` (`src/main/content/conform.ts`) com entrada 1448×1086 e alvo 1440×1080 retornou `cropped:false`; a conversão por LANCZOS produziu RGBA 1440×1080 igual ao quadro inteiro redimensionado, sem perda de bordas.
- **Decisão**: os textos informativos passam a dizer que as páginas foram redimensionadas e que o recorte centralizado só ocorre quando necessário: `src/main/agents.ts` L177, `src/main/projects.ts` L1574 e `src/main/content/postnow.ts` L406 (este último com "de até 3% por lado"). A lógica de `conform.ts` e o limite de 3% (ADR-018) não mudam.
- **Motivo**: a mensagem anterior afirmava um recorte que não ocorre na diferença observada. A lógica já estava correta.
- **Alternativas**: alterar o limite de recorte (rejeitada: ADR-018 e pendência 5); mudar o conform (rejeitada: sem falha comprovada).
- **Consequências**: evidência incompleta: as cinco artes reais do projeto não foram inspecionadas, porque a leitura de conteúdo do storage está fora do escopo autorizado. A medição usou imagem sintética de mesmas dimensões e script descartável (removido). Nenhum teste fixa esses textos.
- **Verificação**: medição descartável sobre `planCenterCrop` e a conversão de conform (removida); leitura dos três textos; tipagem.

## ADR-029: Pendências 9 a 13 mantidas no comportamento atual (default "manter")
- **Contexto**: `DEV/DECISIONS.md` (pendências 9 a 13) aguarda decisão da usuária. O plano de revisão geral previa ações para algumas delas (ordem de `resolveTool`, retrato obrigatório, motor local), e a pendência 13 depende da escolha de formato. Os critérios AC1 (chave ElevenLabs) e AC11 (retrato) têm dois ramos.
- **Decisão**: aplicar o default "manter":
  - 9: sem mudança em `resolveTool` (`src/main/setup/tools.ts`); `~/.local/bin` e `/usr/local/bin` seguem antes do PATH.
  - 10: `saveVisualText` segue recusando a gravação quando a headline ou a copy atual não está no arquivo de arte (`src/main/projects.ts` L459–460); a revisão visual (`buildVisualReview`, L950) bloqueia copy vazia.
  - 11: `portraitRequiredPages` mantido (`src/shared/depicted-person.ts`): post ou Story de página única com retrato aprovado exige `client_portrait`.
  - 12: narração segue com ElevenLabs; nenhum motor local é baixado, instalado ou implementado.
  - 13: o projeto da Patricia (`carousel-4x5`) segue bloqueado por `unsupportedFormat`; nenhuma escrita.
  - AC1: chave com `voices_read` sem `text_to_speech` é salva com aviso (ramo a, ADR-023).
- **Motivo**: mudar a ordem de ferramentas, a obrigatoriedade do retrato ou o motor de narração altera comportamento sem decisão da usuária. O default é o estado documentado e reversível.
- **Alternativas**: priorizar o PATH em `resolveTool` (rejeitada: decisão da usuária); tornar o retrato opcional (rejeitada: decisão da usuária); exigir permissão completa sem ressalva na chave (rejeitada no ADR-023).
- **Consequências**: o teste de `resolveTool` previsto no plano não se aplica. O projeto da Patricia só avança após a escolha de formato (1:1, 4:3 ou 9:16) no Studio. As pendências seguem abertas na seção "Decisões pendentes".
- **Verificação**: nenhuma mudança de código nessas áreas nesta rodada; o comportamento atual é coberto pelos testes da suíte (resultados em `DEV/VERIFY.md`).

## ADR-030: Aprovações editoriais fail-closed e `claims.json` validado (E4 e E2)
- **Contexto**: o agente pré-marcava flags editoriais (`copy_approved`, `claims_reviewed`, `reviewed`) antes da revisão humana; o agente precisou reverter (E4, plano §2.1, prioridade alta). `claims.json` malformado (apply_patch falhando em `research/claims.json`) podia passar sem bloquear a revisão (E2).
- **Decisão**: `approved` exige `copy_approved === true`, `claims_reviewed === true` e `claimsDocument.reviewed === true` (`src/main/projects.ts` L1032–1035). Só `approveVisualContent` seta as três (L1061–1062), na aprovação humana no Studio. `reconcileEditorialApprovals` (L1071–1085), chamada na leitura de projetos de imagem (L1199), compara o hash do conteúdo com a aprovação gravada: se não bate e alguma flag está `true`, zera `copy_approved`, `claims_reviewed` e `claims.reviewed` e grava `project.json` e `research/claims.json`. `saveVisualText` zera as flags quando algum texto salvo muda (L466–472). Os defaults são `false` (`src/main/content/native.ts` L63 e L66). O prompt do agente proíbe alterar essas flags (`src/main/agents.ts` L142). `claims.json` é validado em `buildVisualReview` (`src/main/projects.ts` L924; checagens em L957–958): precisa ter `reviewed` booleano e `claims` lista; se inválido, bloqueia revisão e aprovação. A comparação por hash do conteúdo aprovado não muda.
- **Motivo**: uma flag pré-marcada fora da revisão humana permite aprovar conteúdo não revisado. A checagem por conteúdo garante que a aprovação só vale para o texto revisado.
- **Alternativas**: manter as flags como estavam (rejeitada: E4); impedir o agente de escrever `claims.json` (rejeitada: o agente grava os arquivos diretamente, e o app não tem barreira para isso); validar `storyboard.json` pós-job agora (adiada: falta decidir o comportamento pós-job, AC13 iii).
- **Consequências**: projetos com flags pré-marcadas perdem a aprovação até nova revisão humana (intencional). A reconciliação grava o projeto no disco durante a leitura (aceito). A releitura do arquivo antes de `apply_patch` (AC13 ii) não foi implementada. O storyboard é sinal não bloqueante (ADR-032; `src/renderer/Studio.tsx` L954), e a validação pós-job (AC13 iii) não foi implementada nesta rodada. A validação existente no render (`project validate`, `src/main/projects.ts` L1594–1595) continua.
- **Verificação**: `tests/visual-approval.test.ts` (L73, L92 e L128): "PostNow image generation requires a hash-matching human review of copy, claims, prompts, and brand"; "editorial flags set outside the Studio are cleared unless they match the approved content"; "a malformed claims.json blocks the visual review and the approval".

## ADR-031: Briefing lista só os pontos pendentes (E5)
- **Contexto**: o briefing de projeto de vídeo marcava público e formato como pendentes mesmo quando já estavam definidos (E5, plano v6).
- **Decisão**: `pendingBriefPoints` (`src/main/content/native.ts` L24–34, função não exportada) inclui "público" só se o brief não tem `Público:` e "formato" só se o projeto não tem formato; os demais pontos seguem fixos. `initializeNative` (`src/main/content/native.ts` L37–70) grava a lista em `planning/brief.md` (L42), no ramo de vídeo. Chamador: `src/main/projects.ts` L1287.
- **Motivo**: o briefing deve listar só o que ainda falta definir.
- **Alternativas**: manter a lista fixa (rejeitada: marca como pendente o que já está definido).
- **Consequências**: só afeta projetos de vídeo criados depois da mudança; projetos existentes mantêm o brief já gravado.
- **Verificação**: `tests/brief-pending.test.ts` (3 testes: L22, L29 e L35); cada teste chama `initializeNative` em diretório temporário e lê `planning/brief.md`.

## ADR-032: Contrato VideoGo v1 como sinal no Studio, sem bloqueio
- **Contexto**: `apply_patch` falhou ao editar `storyboard.json` (E2, plano v6), e o AC13 iii pede validar o storyboard contra o contrato VideoGo v1.
- **Decisão**: `src/shared/storyboard-contract.ts` (`STORYBOARD_SCHEMA` L12; `storyboardContractIssues` L121) reproduz o contrato VideoGo v1. `storyboardStatus` (`src/main/projects.ts` L222–233) não lança: arquivo ausente ou ilegível vira "storyboard.json ausente ou ilegível."; `ready` (L231) segue a regra anterior e `issues` (L232) vem do contrato. O Studio mostra os problemas com o prefixo "Storyboard inválido:" (`src/renderer/Studio.tsx` L236) e um aviso informativo que não bloqueia (L954). `secureStoryboard` (`src/main/content/native.ts` L72–74) checa só schema e `scenes`. O render continua recusado quando o status não está pronto (`src/main/projects.ts` L1592) e pelo `project validate` do VideoGo (L1594–1595).
- **Motivo**: o storage não pode ser lido nesta rodada (só `stat`/`find`), então os storyboards existentes não podem ser conferidos; bloquear a edição afetaria projetos sem verificação. O aviso mostra o problema, e a recusa do render mantém a garantia.
- **Alternativas**: bloquear status e edição pelo contrato (rejeitada: afeta projetos existentes sem verificação); validação pós-job via `project validate` (adiada: AC13 iii exige decidir o comportamento pós-job); validação com zod (rejeitada: nova dependência).
- **Consequências**: o contrato não confere se os arquivos citados existem: `asset-inexistente` é aceito pelo app e recusado pelo VideoGo (por design). Avisos do VideoGo não estão portados (`../VideoGo/src/services/production/storyboard.ts` L227, L257, L268, L287–289, L308, L312–340); `spokentext-digitos-diferentes` não é comparado (dígitos fora de tags).
- **Verificação**: `tests/storyboard-contract.test.ts` (18 testes). Cruzamento com `validateStoryboardFile` do VideoGo (`../VideoGo/src/services/production/storyboard.ts` L206) em 26 casos: 24 concordam; as 2 divergências são app-aceita e VideoGo-recusa (`asset-inexistente`, `spokentext-digitos-diferentes`); nenhum caso recusado pelo app foi aceito pelo VideoGo.

## ADR-033: Submenu desacoplado para ElevenLabs & Redesign da Área de Motores & Setup
- **Contexto**: A configuração e catálogo da ElevenLabs estavam embutidos no meio da grade de motores de conteúdo em `Setup.tsx`, causando poluição visual, rolagem excessiva e dificultando o acesso direto a testes de voz, catálogo e clonagem.
- **Decisão**:
  1. Desacoplar a interface em dois submenus formais: `Motores & CLIs` (`engines`) e `ElevenLabs & Voz` (`elevenlabs`), navegáveis via submenu aninhado na barra lateral e através de segmented tabs acessíveis (`role="tablist"` / `role="tabpanel"`) no topo da tela de Setup.
  2. Manter a visão `engines` focada no provisionamento dos 3 motores (PostNow, VideoGo, Maestro) e assistentes (Codex, Claude, GitHub), adicionando um Executive Overview Banner com métricas operacionais em tempo real.
  3. Transformar a visão `elevenlabs` em um Studio de Voz completo, contendo ribbon com 4 garantias de segurança (`safeStorage`, zero vazamento, aprovação hash-bound, áudio offline), campo de chave com toggle show/hide, catálogo pesquisável com player de áudio sob demanda e fluxo guiado de Instant Voice Cloning com consentimento legal e validação via FFprobe.
  4. Deep links automáticos a partir do onboarding e do Studio ("Configurar voz do VideoGo") roteiam diretamente para a aba `elevenlabs`.
- **Motivo**: Atender à solicitação do maestro, melhorando a organização, ergonomia, acessibilidade (W3C WAI-ARIA) e governança de segredos da aplicação desktop.
- **Alternativas**: Manter tela única com scroll longo (rejeitada: confusa e sem hierarquia); criar tela de topo separada (rejeitada: ElevenLabs é uma integração opcional do motor VideoGo dentro de Motores & Setup).
- **Consequências**: Elimina duplicidade de visualização; o usuário pode gerenciar vozes e testar previews de forma dedicada sem interferir no status dos demais motores.
- **Verificação**: `npm run typecheck`, `npm run lint` (exit 0), `npm test` (230/230 testes passando), `npm run smoke` (`ok: true`), build de produção concluído e testes interativos em Chromium em 4 viewports (390, 768, 1280, 1440 px) com zero overflow horizontal.

## Decisões pendentes

Itens sem decisão tomada. Até a resposta, vale o comportamento descrito nas seções acima.

1. Formato não entregue pelo ImageGen (parcialmente resolvido): o 4:5 foi removido do app (ADR-022); 4:3 (1440x1080) e 9:16 (1080x1920) só fecham quando a saída já está na proporção, ou quase (aceite nas 230 saídas observadas: 2 e 7). A paisagem 1672x941 continua falhando (recorte de ~27% por lado). Opções: aceitar recorte maior, pedir nova arte em outro formato ou outra solução. Bloqueado até o usuário responder.
2. Política de logo: hoje o PostNow aplica a logo como camada após a geração (GERE em todas as páginas; REFAÇA só nas refeitas). Isso conflita com "sem colagem ou composição depois". Manter ou remover.
3. Foto de especialista: `client_portrait` implementado (ADR-019): exige retrato aprovado no perfil PostNow, e o Studio só lê esse retrato. Pendente: como as páginas 1 e 6 da Patricia recebem a cliente. Marcar `client_portrait` na UI (sem custo; os prompts seguem com "sem pessoas", item 8) ou reescrever os prompts (sessão paga). Fotos de referência da marca seguem como alternativa (anexadas ao ImageGen, ADR-016).
4. Limite de 10 referências e formatos aceitos (PNG, JPG, JPEG, WebP) no ImageGen: implementados como padrão (ADR-016). Confirmar o limite ou rasterizar PDF; hoje PDF é só texto no `.studio-context`.
5. Corte na derivação de vídeo (FFmpeg, `src/main/projects.ts`): manter ou alterar.
6. Prompts fora da etapa Textos: a criação de projeto (`src/renderer/Projects.tsx`, receitas e "Escolha de prompt") e o roteiro de vídeo (`src/renderer/Studio.tsx`, `textarea#agent-prompt` e "Biblioteca de prompts") ainda mostram prompts. ADR-021 só trocou `{{pageCount}}` nas receitas. Manter ou aplicar a mesma regra da etapa Textos.
7. Afirmações e fontes recolhidas por padrão: na etapa Textos, o bloco "Afirmações e fontes" fica fechado, mas o checkbox de aprovação diz "revisei as fontes". Abrir por padrão quando houver afirmações, ou manter.
8. Prompts 01 e 06 da Patricia com "sem pessoas": as páginas 1 e 6 seguem com `depicted_person: none` (`portrait_pages: []`), e os textos dizem "Não incluir pessoas" (01.md L11) e "Sem pessoas, mãos, rostos" (06.md L20). A composição de rodada já traz `POSTNOW_DEPICTED_PERSON=client_portrait`. Causa provável, não confirmada por diff: a sessão de texto `905ad004-4bd6-4b84-b27d-45a35ec7eb5f` (21:05:43) rodou antes de `owner_portrait` existir (profile alterado às 21:41:56), sob a regra "nunca use client_portrait" (`src/main/agents.ts` L74). Opções: (a) validador que bloqueia `client_portrait` enquanto o texto disser "sem pessoas" (código novo; regra frágil); (b) nova sessão de texto que reescreva p1, p6 e `storyboard.md` (Codex real, paga; exige autorização); a regra atual (`agents.ts` L70-75) já pede `client_portrait`; (c) edição manual dos prompts pela usuária (o agente não edita o storage). Bloqueado até resposta.
9. Ordem de `resolveTool`: `src/main/setup/tools.ts` (`searchDirectories` L103, `resolveTool` L119, `toolEnvironment` L142) põe `~/.local/bin` e `/usr/local/bin` antes do PATH do sistema. Um preview de verificação disparou `codex exec` real (PID 616267, ~40 s; custo não medido). Opções: manter; priorizar o PATH; não usar preview que chame o CLI. Bloqueado até resposta.
10. Página sem headline ou copy no arquivo de arte: `saveVisualText` recusa a gravação ("não encontrei a headline atual / a copy atual no arquivo de arte… Use Preparar textos…", `src/main/projects.ts` L459-460), e a etapa Textos não grava texto nessa página. Opções: campo que grava com a mesma checagem; manter. Bloqueado até resposta.
11. Post ou Story de página única com retrato aprovado exige `client_portrait` (`portraitRequiredPages`, `src/shared/depicted-person.ts`). Manter, ou tornar opcional? Decisão da usuária.
12. Motor de narração local (pedido d): sem voz ElevenLabs, qual motor? SAPI (só Windows, não confirmado); Piper (exige download de modelo, sem autorização); ou manter ElevenLabs. Nada é baixado nem implementado antes da decisão.
13. Projeto da Patricia com formato removido: `project.json` tem `format: carousel-4x5` e abre com `unsupportedFormat`, sem geração até a escolha de outro formato no Studio (1:1, 4:3 ou 9:16). Decisão da usuária.
