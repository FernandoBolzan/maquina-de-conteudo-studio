# Active Spec — Máquina de Conteúdo

## Goal

Entregar o aplicativo desktop **Máquina de Conteúdo (Studio)** (Electron + React + TypeScript + xterm.js), integrando PostNow, VideoGo, Orquestrador Maestro, execução interativa de Codex e Claude Code, diagnóstico e provisionamento local, marcas, aprovação humana e ponte bidirecional entre projetos de imagem e vídeo.

## In Scope

- Shell desktop Electron isolado (`contextIsolation`, sandbox, CSP) com protocolo seguro `media://asset/<token>`.
- Supervisor de processos e PTY (`node-pty` + `@xterm/xterm`), redaction de credenciais, histórico limitado em memória e encerramento de grupos.
- Gestão local de marcas e projetos PostNow/VideoGo.
- Novos projetos e importações usam diretórios legíveis derivados do título, com sufixos determinísticos para colisões; UUIDs internos e referências permanecem estáveis, e o VideoGo recebe o identificador legível e o título no storyboard. Pastas legadas não são renomeadas automaticamente.
- Aprovação vinculada a hash SHA-256 e exportação verificada com `MANIFEST.json`.
- Projetos derivados mantêm trilhas independentes: imagem → vídeo cria apenas um projeto/storyboard VideoGo, sem render automático; vídeo → imagem extrai um quadro por FFmpeg para nova entrada, sem alegar geração artística.
- Onboarding guiado na primeira execução, com configuração opcional, explicações simples e preservação do fluxo de perfis existentes.
- O onboarding pergunta se a primeira entrega será carrossel/post ou vídeo VideoGo e exige apenas o agente/motor selecionado; ElevenLabs é opcional e só gera áudio após aprovação da narração.
- O Studio oferece biblioteca pesquisável de modelos para carrosséis/vídeos de curiosidades, favoritos e prompts pessoais persistidos localmente; o usuário pode editar/revisar as instruções exatas, enquanto PostNow/VideoGo continuam os motores de produção.
- A ação “Criar conteúdo” mantém duas jornadas independentes — PostNow para imagem/carrossel e VideoGo para vídeo — com formulários, ajuda, templates e CTAs que nunca confundem um motor com o outro.
- O assistente exige o assunto, sugere um nome legível e editável, coleta público/tom/CTA, permite marca/notas opcionais e leva a prévia editável do template para o composer sem iniciar o agente.
- Briefing de vídeo lista como pendentes só público e formato que faltam (ADR-031).
- PostNow prepara artes somente com Codex ImageGen nativo ou arquivos importados: o CLI instalado não inventa pixels. Antes do ImageGen, o projeto nativo passa pelo preflight real do PostNow; a pessoa revisa headline, copy, claims/fontes e quem aparece na UI (os prompts ficam internos, ADR-017), aprova a versão ligada a SHA-256 e só então inicia geração. PostNow aplica a logo oficial aos PNGs reais; nenhuma etapa inicia vídeo automaticamente.
- Aprovação editorial PostNow (copy e claims) nasce pendente: o agente não marca as flags, a aprovação humana seta as três ligada ao hash do conteúdo, e `research/claims.json` inválido bloqueia revisão e aprovação (ADR-030).
- Cada rodada fica em `generated/runs/<batchId>`; a pessoa seleciona/revisa versões com arquivos, formatos/dimensões são persistidos no projeto e enviados aos prompts/storyboard, e a exclusão confirmada apaga arquivo e estado relacionado. Resultados legados no diretório raiz seguem visíveis quando uma rodada está vazia; carrossel só recebe preparo com pelo menos três imagens.
- O terminal fica recolhido por padrão; prompts detectados de autenticação/segredo/confirmação aparecem em solicitação interativa na UI, com resposta protegida e sem eco de senha.
- A atividade do agente mostra o código de saída e o comando de uma falha de comando, com o comando truncado no limite (ADR-027).
- Console copia trechos selecionados ("Copiar seleção" ou Ctrl+C com seleção) e o log completo ("Copiar tudo", sem sequências ANSI) para enviar ao debug; a única permissão de sessão concedida é `clipboard-sanitized-write`.
- Preparação local da próxima versão SemVer 0.2.0 documenta mudanças e limites; sem commit, push, tag ou publicação sem autorização específica.
- Diagnóstico de versão estável para Codex/Claude Code; instalação/atualização privada, validação antes de ativar, rollback e consentimento explícito sem alterar CLIs globais.
- Setup exibe o estado/versionamento por dependência de cada motor e orientação acionável para corrigir ausências ou versões incompatíveis; VideoGo discrimina FFmpeg e FFprobe.
- Testes locais de PostNow/VideoGo renderizam apenas em pasta temporária descartável, sem voz paga e sem alterar projetos; Maestro testa contexto local sem chamar IA. Cada execução exige consentimento.
- Preferências mostra aviso inline de atualização e data da última consulta concluída, persistidos localmente.
- Motores & Setup organiza ElevenLabs como um submenu dedicado para VideoGo: visão separada de Motores & CLIs e ElevenLabs & Voz, banner executivo de status, validação da chave por status HTTP (401/403/429/rede; ADR-023), armazenamento cifrado com `safeStorage`, catálogo pesquisável de vozes com player sob demanda e clonagem em passos com autorização explícita.
- Studio mantém narração editorial e texto falado por cena, seleciona voz, usa tags Eleven v4 e IPA, exige aprovação hash-bound antes da síntese e aprovação individual do áudio antes do render final. Também aceita áudio próprio por cena (upload ou gravação no Modo Studio), sem voz ElevenLabs (ADR-024).
- Referência de áudio órfã (arquivo ausente ou desatualizado) aparece como "Referência órfã" e pode ser removida; sem chave ElevenLabs, o gate oferece "Envie ou grave" e não promete geração (ADR-025).
- Storyboard de vídeo é checado contra o contrato VideoGo v1: problemas aparecem no Studio como aviso, sem bloquear a edição; o render segue recusado enquanto o storyboard não estiver pronto (ADR-032).
- Geração paga executa VideoGo em processo filho com chave apenas no ambiente, modelo `eleven_v4` e cache de voz/transcrição desativado no fluxo privado.
- Releases e autoatualização desktop: SemVer em `package.json`, tags anotadas `vX.Y.Z`, GitHub Releases no repositório `FernandoBolzan/maquina-de-conteudo-studio` e confirmação explícita do usuário para instalar.
- Etapas do Studio (`src/renderer/studio-steps.tsx`, `src/renderer/project-journey.ts`, `src/renderer/Studio.tsx`): eyebrow `Etapa i de n`, "Voltar" e "Próximo" só com etapa concluída.
- Revisão imagem a imagem (`src/shared/image-revision.ts`, `agents.reviseImages`, `projects.review`): Manter/Refazer por página na rodada mais recente `ready`; v2 gera só as páginas refeitas; aprovação transferida só com sha256 igual.
- Rodada incompleta (`detail()` em `src/main/projects.ts`): lote interrompido ou divergente vira `failed`; UI bloqueia decisões e "Próximo".
- Exclusão de imagem (`deleteProjectAsset`, `projects.deleteAsset`): remove do disco e do projeto, com journal recuperável; recusa `.input`.
- Encadeamento manual: bridge e render só por ação da UI; finalização de imagem não dispara vídeo.
- Abrir pasta (`src/main/open-folder.ts`, `app.pick`/`app.open` em `src/main/runtime.ts`): Linux via `xdg-open` detached; pastas escolhidas registradas (máx. 20).
- ZIP (`src/main/zip.ts`, `projects.exportZip`): STORE, sem Zip64, mesmo conteúdo do export de pasta; exige aprovado.
- Perguntas dos agentes (`src/shared/agent-followup.ts`): resposta em nova sessão confirmada pelo usuário.
- Contexto (`src/main/context.ts`): `consent` exige `confirm === true`.
- Duração do storyboard (`src/main/content/native.ts`): 5 s por cena.
- Formatos PostNow (ADR-022; `src/shared/formats.ts`, `src/main/content/postnow.ts`): story 9:16, feed 1:1 e 4:3; 4:5 removido; imagem única ou carrossel conforme o formato; o formato escolhido na etapa de imagens vira o formato da rodada. `--format` e `--type` seguem para o CLI; dimensões conferidas com `postnow/data/formats.json`.
- Imagem final (ADR-018, substitui a tolerância de 1% do ADR-015; superseded parcialmente pelo ADR-022 quanto ao 4:5): o ImageGen entrega a imagem; o PostNow fecha o formato com recorte centralizado de até 3% por lado e redimensionamento. Acima disso a rodada falha com mensagem e a página é refeita; nada é preenchido nem colado.
- Referências de marca (ADR-016, `src/shared/brand-references.ts`): PNG, JPG, JPEG e WebP, até 10, vão ao ImageGen com `--image` na geração e na correção; demais tipos seguem só como texto no contexto.
- Feedback de geração (`src/shared/agent-events.ts`, `src/renderer/GenerationProgress.tsx`): balão com cronômetro e atividades legíveis enquanto o agente gera.
- Textos e editores (`src/renderer/VisualTextEditor.tsx`, `src/renderer/VideoSceneEditor.tsx`, ADR-017): a etapa Textos de imagem mostra headline, copy e quem aparece, sem prompts, e sincroniza headline e copy com o arquivo de arte; o vídeo edita o texto das cenas.
- Retrato da cliente (ADR-019): `client_portrait` nas páginas de cliente quando o perfil PostNow tem retrato aprovado; o Studio só lê o retrato, e o cadastro segue no motor (`postnow client set-portrait`).
- Textos automáticos ao salvar a pauta de imagem, sem diálogo, quando não há texto gravado (ADR-020).
- Pedido de texto com o número de páginas do projeto nas receitas de carrossel (ADR-021).

## Out Of Scope

- Backend SaaS, cobrança/faturamento, serviço de armazenamento ou processamento de dados no servidor. Roteiros e amostras de voz só são enviados à ElevenLabs quando a ação autorizada do usuário exigir, sob os termos do provedor.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke` e `npm run build` passam.
- A chave ElevenLabs armazenada nunca aparece em settings persistidos, respostas IPC posteriores ao renderer, argumentos do CLI ou logs; sem cofre seguro, salvar é bloqueado em vez de recorrer a texto puro.
- No fluxo Studio, a síntese é bloqueada até a aprovação explícita da narração; mudanças de texto, fonética, tags ou voz invalidam a aprovação, e o render final exige clipes gerados e aprovação individual. Áudio próprio por cena também exige aprovação antes do render, e texto alterado na cena remove o áudio dela.
- Testes offline verificam autorização anterior a TTS, proteção da key, preservação de tags/IPA, associação atômica dos áudios e compatibilidade com áudio externo.
- Instalação nova abre onboarding; perfis existentes sem estado de onboarding não são interrompidos.
- Na primeira execução, a pessoa escolhe o formato, vê só as ações necessárias e segue para um projeto com o tipo pré-selecionado; trocar de agente atualiza os requisitos exibidos.
- Modelos substituem tema/público/tom/CTA, mantêm instruções de checagem factual e nunca autorizam render ou áudio; favoritos/prompts pessoais persistem localmente, com recuperação segura diante de dados inválidos.
- O composer recolhe agente/modelo/custo por padrão e mostra o prompt editável exato antes da sessão do agente; iniciar o agente continua separado da renderização pelos motores e da aprovação ElevenLabs.
- QA Chromium verifica troca de objetivo, setup opcional de voz, seleção/persistência de prompts, ausência de overflow horizontal em 390/768/1280/1440 px, violações de acessibilidade e erros do renderer.
- O wizard PostNow cria somente projetos `kind=image`, exige assunto, sugere título legível, aceita marca/notas opcionais e leva o template escolhido ao composer; não inicia sessão nem renderiza automaticamente.
- O wizard VideoGo cria somente projetos `kind=video`, com roteiro/prompt apropriado ao vídeo; navegação, vocabulário e CTAs identificam VideoGo; ElevenLabs fica opcional e o TTS aguarda aprovação.
- No Studio, a próxima ação corresponde a briefing salvo, roteiro, outputs em pastas finais/review, jobs e aprovações reais; exportação segue disponível somente para arquivos aprovados.
- Da narração sem key, um CTA abre diretamente Motores & Setup na seção de voz sem descartar briefing/narração não salvos; a clonagem mantém consentimento explícito e confirmação antes do envio.
- A biblioteca de setup mostra instruções de permissões e requisitos de amostra antes de configurar a key; os previews disponíveis da ElevenLabs têm player sob demanda. Preview sem voz/API real fica limitado no browser QA.
- Empty states de Projetos oferecem PostNow e VideoGo separados sem semear dados; os modelos de prompt e prompts pessoais usam placeholders ingleses e portugueses conhecidos.
- Distribuição: `package.json`/lockfile declaram 0.2.0; notas locais e README alertam que a tag/release pública ainda é 0.1.1. Sem publicação, commit, push ou tag.
- Codex/Claude distinguem CLI ausente, atualizado, desatualizado, externo e consulta indisponível; cópia gerenciada atualiza com validação e rollback.
- Nenhuma instalação/atualização de CLI modifica a cópia global; ações de instalação exigem confirmação explícita.
- Fluxos de usuário exercitados em app Electron real: marca, projeto, renderização do carrossel (incluindo mensagem útil quando faltar Pillow), aprovação, derivação imagem↔vídeo, render VideoGo e diagnóstico de motores.
- Criação e importação usam nomes legíveis sem colisões nem sobrescrita; IDs internos seguem UUID, e `storyboard.json` expõe ao VideoGo o slug da pasta e o título humano.
- Diagnósticos por motor refletem o runtime realmente selecionado; VideoGo distingue FFmpeg/FFprobe e PostNow confirma Python/Pillow no mesmo ambiente usado no render.
- Testes consentidos de VideoGo/PostNow validam artefato de render temporário; Maestro valida contexto local sem modelo. Resultados identificam explicitamente quando dependências impedem o teste.
- PostNow real: testar lote de carrossel em workspace temporário, exigir dimensões do formato, usar logo cadastrada e preservar outputs por rodada; a interface não deve chamar FFmpeg de render PostNow nem prometer geração de imagem pelo CLI.
- VideoGo real: renderizar formato escolhido em pasta descartável, conferir codec/dimensões do MP4 e não renderizar automaticamente ao derivar de imagens.
- Exclusão de imagem remove arquivo, entrada de source e aprovação hash-bound; testar sem tocar em projetos existentes.
- A geração PostNow permanece bloqueada até aprovação humana de headline, copy e claims/fontes na versão exata; os prompts dos arquivos de arte ficam internos e entram no hash da aprovação. Alteração em texto, fontes, storyboard, logo, referências, briefing ou formato invalida a aprovação. O gate deve aparecer na interface e não marcar aceite por padrão.
- E2E dos motores usa workspaces temporários: PostNow produz PNG 1080×1350 e VideoGo MP4 com codec/dimensões conferidos. Uma chamada real Codex ImageGen foi validada em post descartável após aprovação editorial humana e finalizada pelo PostNow (1 PNG 1080×1350, lote `ready`, sem auto-vídeo); o fixture de logo transparente foi corrigido e o overlay confirmado com fixture opaco. Isso não cobre multi-página/outros formatos nem substitui aprovação visual antes de exportar. Patricia permanece somente leitura.
- A exclusão de imagem mapeada remove arquivo, source, saída nativa e aprovações de forma recuperável; journals ficam em armazenamento privado por workspace, e journals forjados no workspace não são executados.
- A fila de agentes/geração não muta projetos com exclusão pendente: a recuperação é executada antes da ação e revalidada dentro da fila serializada.
- Rodadas PostNow aceitam somente PNG/JPEG/WebP; aprovação visual exige os campos nativos obrigatórios e o checkbox da UI corresponde ao hash exato revisado. Edição posterior invalida o aceite visual e o backend rejeita hash stale.
- Rodada PostNow é entregue só com `.status.json` `ready` e `.mapping.json` gravado pelo Studio (`isRoundDelivered`). Um `ready` escrito pelo agente não bloqueia a finalização, e o prompt de tarefa de imagem proíbe o agente de escrever `.status.json`, `.mapping.json`, saídas finais e documentação do projeto.
- A política de logo é escolhida por rodada (capa+fechamento, todas as páginas ou nenhuma) e não altera o `project.json`; cada página declara `depicted_person` (`none`, `other_person` ou `client_portrait`, este último só com retrato aprovado no perfil PostNow) antes da revisão visual. Com retrato aprovado, capa, última página de carrossel e post ou Story de página única exigem a cliente (ADR-019). O contexto ao motor de imagem é o carrossel e seus vínculos entre slides; slides vazios ou placeholders bloqueiam o envio.
- Imagem final PostNow (ADR-018): a saída do ImageGen é conformada ao formato por recorte centralizado de até 3% por lado e redimensionamento; recorte maior falha a rodada com mensagem clara, sem arte final, preenchimento ou colagem (E2E 4:5 em 2026-11-07, sob a regra de 1%).
- Derivação VideoGo→PostNow usa somente os arquivos aprovados da rodada selecionada e respeita a quantidade compatível com o formato de destino; projeto importado persiste o formato nativo no registro e storyboard.
- E2E Electron isolado verifica títulos/pastas legíveis, criação sem render automático, clone sem mídia herdada, exclusão física, formato escolhido e invalidação de aprovação; não substitui a autorização humana nem o teste pago de ImageGen/ElevenLabs.
- Terminal: diálogo interativo expõe as opções/campo correto e uma senha enviada não reaparece no log.
- Preferências exibe data persistente da última consulta concluída; update disponível aparece inline e download continua consentido.
- `npm run dist:linux` produz instaladores Linux; ao menos um pacote é aberto e executado em ambiente Linux compatível.
- Windows NSIS instala, abre e valida PTY, diálogos e caminhos no Windows nativo.
- macOS dmg/zip abre e valida permissões, subprocessos e caminhos em macOS nativo.
- A mesma versão é conferida nos três sistemas antes de afirmar compatibilidade completa.
- Tag `vX.Y.Z` deve corresponder à versão npm; workflow constrói Linux, Windows e macOS e publica os artefatos/metadados somente após todos os builds passarem.
- Release publicada fornece metadados `latest*.yml`; app empacotado consulta o feed GitHub fixo e só baixa após consentimento. `.deb` não usa autoatualizador do app.

## Structural Prevention

- Manter contratos tipados em `src/shared/contracts.ts` e validação de entrada/caminhos em `src/main/runtime.ts` e `src/main/content/storage.ts`.

## Constraints

- Alvo desktop: Linux, Windows e macOS; validação nativa é específica de cada sistema.
- Dados de projetos e marcas ficam fora dos clones dos repositórios.
- Publicar tags/releases exige autorização do mantenedor; assinatura/notarização depende de certificados e contas apropriados.

## Verification Plan

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run smoke`
- `npm run build`
- `npm run pack` valida configuração de empacotamento local sem publicar.
- Testes offline determinísticos para estado missing/current/outdated e ciclo CLI install/update/rollback validado em diretório temporário.
- Fluxo de primeira execução exercitado visualmente em Electron/Chromium sem instalar ferramentas ou autenticar contas reais.
- Validar que o fluxo `.github/workflows/release.yml` só aceita tag estável igual à versão npm e publica artefatos após os três builds nativos.
- Fluxos visuais em Electron real e verificações de pacote Linux.
- `npm run dist:windows` + instalação e smoke em Windows nativo.
- `npm run dist:mac` + abertura e smoke em macOS nativo.
- Smoke suporta caminhos configuráveis por `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`; defaults mantêm irmãos PostNow/VideoGo e Maestro Linux. FFmpeg e permissão de symlink são pré-requisitos; executar o smoke em Windows/macOS nativos ainda está pendente.
- `orquestrador-maestro check-dev-gates --project-path . --strict`

## Status

- State: active — separação guiada PostNow/VideoGo, títulos de projeto legíveis, modelos reaproveitáveis, próxima ação por jornada e setup ElevenLabs orientado estão implementados. `package.json`/lockfile declaram 0.2.0 como candidata local não publicada; falta validação nativa/empacotada em Windows/macOS, cofres reais e narração ElevenLabs (paga), ainda não exercitada. A narração própria (upload e gravação por cena) foi verificada sem pagar, e o formato 4:5 foi removido (ADR-022). A release pública continua v0.1.1.
- Rodada atual (2026-11-09, Motores & Setup submenu + layout redesign): ElevenLabs separado como submenu dedicado com segmented tabs e navegação aninhada na sidebar; overview executivo do ecossistema; catálogo de vozes com busca, filtros e player sob demanda; fluxo guiado de clonagem com consentimento formal. Gates: typecheck, lint, `npm test` 223/223, smoke, build e verificação visual em Chromium sem overflow em 390/768/1280/1440 px.
- Rodada 2026-11-07 (frentes de formatos, chave e narração): 4:5 removido com formato por rodada e status ilegível fechado (ADR-022), validação da chave ElevenLabs por status HTTP (ADR-023) e narração por cena com upload/gravação e Modo Studio (ADR-024). Verificado com `npm test` 157/157, typecheck, lint, smoke e build; mutações descartáveis cobertas pelos testes; FormatoVerify, item 5, PASS (`DEV/VERIFY.md`).
- Rodada 2026-11-07 (primeira frente): feedback de geração, editor de texto (imagem e vídeo), formatos no início, conformação de imagem com recorte de até 3% por lado (ADR-018), referências no ImageGen, retrato da cliente (ADR-019), textos automáticos ao salvar a pauta (ADR-020) e pedido com o número de páginas (ADR-021) estão implementados. Verificados com `npm test` 127/127, typecheck, lint, build, smoke, matriz do pedido 9/9 e UI isolada em 4 larguras. E2E com script descartável, sem Electron e sem geração paga (`DEV/VERIFY.md`, 2026-11-07). Pendente: páginas 1 e 6 da Patricia sem a cliente e prompts com "sem pessoas" (`DEV/DECISIONS.md`, itens 3 e 8); `--image` com Codex real (geração paga); ImageGen para 4:3/9:16 (decisão; 4:5 removido pelo ADR-022); logo pós-geração; crop de vídeo; verificação visual do editor de vídeo; notificação nativa; Windows/macOS.
- Rodada anterior (2026-11-06): etapas do Studio, revisão por imagem, exclusão, encadeamento, abrir pasta, ZIP, perguntas de agentes, layout e duração estão implementados e verificados em Electron isolado no Linux (`DEV/VERIFY.md`). Pendente: abertura de pasta fora do Linux (`shell.openPath`), execução nativa e instalador em Windows/macOS, e decisão de produto sobre o formato 4:5 → 9:16 do vídeo.
- Owner: Maestro & Orquestrador
- Last updated: 2026-11-09
