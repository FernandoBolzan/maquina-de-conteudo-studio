# Verify — Máquina de Conteúdo (Studio)

- Date: 2026-11-06
- Scope: estado da release pública `v0.1.1` versus checkout local, mais verificação corrente do ciclo de vida, fluxo editorial PostNow e produção/derivação VideoGo.
- Passed: Actions run `42045235690` concluiu builds/publicação da tag `v0.1.1`. Feeds públicos `latest-linux.yml`, `latest.yml` e `latest-mac.yml` apontam para assets existentes com nomes correspondentes.
- Observed: a primeira consulta do updater retornou HTTP 504; a seguinte, feita pelo build local, informou “Você está na versão atual (0.1.1)”. Não houve download/instalação de atualização.
- Pending: runtime/instalação Windows/macOS, assinatura/notarização, macOS Intel, `.deb` via `apt`, atualização entre versões e publicação do código atual da branch `main`.

## Rodada 2026-11-07 — gates e limites

- Verificado por gate (comandos executados pelo lead):
  - `npm run typecheck`: exit 0.
  - `npm run lint`: exit 0.
  - `npm test`: 102 de 102 passando.
  - `npm run build`: exit 0; aviso de chunk do renderer `index-BlFQd9j3.js` com 709.88 kB minificado (acima de 500 kB).
  - `npm run smoke`: exit 0; `"ok": true`, `"projects": 3`, `"ptyCancelled": "cancelled"`.
- Não verificado nesta rodada:
  - Geração real do Codex com `--image`: exige geração paga, ainda não autorizada.
  - Windows e macOS: nenhuma execução nativa.
  - Vídeo com áudio: VideoGo com `--voice demo` gera MP4 sem áudio. ElevenLabs está fora de escopo.
- Nota sobre E2E: o E2E desta rodada usa um stand-in do Codex em `/tmp/mdc-e2e/bin/codex`, fora do repositório, sem chamada de modelo. Os resultados do E2E são anexados pelo lead em seção própria.

## Rodada 2026-11-07 — E2E isolado com stand-in do Codex

- Instância: Electron `mdc-e2e-app5` com build `index-BlFQd9j3.js`, `MDC_DATA_DIR=/tmp/mdc-e2e/data`, CDP 9447. Marca `Marca E2E` (`968f049d-98b3-49a8-8b8d-42a29a8fa0a7`) com `Foto de referência` (`1f0743af-…`, .jpg) e `Briefing em PDF` (`dde26f1b-…`). O claim `fixture-e2e-1` (`research/claims.json`, aprovado) foi escrito à mão no workspace isolado: é fixture, não fonte real.
- Carrossel 1:1 (`e2e-carrossel-1x1`, `4b4e8b34-894e-45ec-9ea6-56f7797e35be`): geração `1794064089551-8d8cbf20` `ready`; `.input` 1024×1024 → 1080×1080 por escala, sem corte; logo nas páginas 1 e 5 (política "Capa e fechamento"). Refazer `1794064308450-a177d4db`: `redonePages [1]`, `keptPages [2,3,4,5]`, logo na página 1. O log do stand-in registra `--image` com a foto de referência nas execuções desse projeto (`/tmp/mdc-e2e/fake-codex-argv.jsonl`). Hash igual da página refeita é artefato do stand-in determinístico, não prova de reuso real. Capturas `/tmp/mdc-cdp/e2e-02-…png` e `e2e-03-…png`.
- Carrossel 4:5 (`e2e-carrossel-4x5`, `1e14e5bc-b087-45f4-9108-b4ce3bf8bd8d`, `format: carousel-4x5`, 5 páginas):
  - Textos, sincronização: headline da página 1 "Sono e memória" gravada em `prompts/01.md` (`Título: Sono e memória`); toast "Textos salvos. Aprove o texto de novo antes de gerar imagens.".
  - Textos, teste negativo: linha de `prompts/02.md` alterada à mão e headline da página 2 editada. A UI recusou com "Página 2: não encontrei a headline atual no arquivo de arte…"; `project.json` manteve "O que acontece à noite" e o arquivo não foi regravado. Linha restaurada depois.
  - Aprovação: checkbox e "Aprovar conteúdo para imagem" → "Textos e fontes aprovados para esta versão."; "Próximo" avançou para "Gerar imagens".
  - Geração (stand-in com atraso de 20 s): diálogo de logo com padrão "Capa e fechamento"; balão com cronômetro, "Gerando imagens originais com o Codex.", "Salvando arquivos" e linhas "Imagem gerada" ×5. "Imagem gerada" é resultado bruto do Codex, não arte final. Captura `/tmp/mdc-cdp/e2e-06-atividade-4x5.png`.
  - Rodada `1794067232466-688be06e` `failed`: "A página 1 tem proporção incompatível com 1080×1350; cortar mudaria o conteúdo. Gere uma nova rodada." Disco: `.input/slide-01..05.png` brutos, `.conformed/` vazio, sem arte final. Captura `/tmp/mdc-cdp/e2e-07-4x5-recusada.png`.
- Console: `uiEvents` vazio em todas as checagens.
- Limites: `--image` testado só com o stand-in (Codex real não foi chamado, sem geração paga); 4:3 e 9:16 seguem a mesma regra de proporção, não executados; editor de vídeo sem verificação visual; notificação nativa ao fim do job não verificada; Windows e macOS não exercitados; app do usuário não reaberto (abrir projetos grava status em `detail()`, e o storage é somente leitura).

## 2026-11-07 — Retrato da cliente, textos automáticos e pedido com páginas

- Escopo: ADR-019 (retrato `client_portrait`), ADR-020 (textos ao salvar a pauta de imagem) e ADR-021 (pedido com o número de páginas).
- Gates: `npm run typecheck` e `npm run lint` sem erro; `npm test` 127/127 (inclui `tests/depicted-person.test.ts`, `tests/text-generation.test.ts` e `tests/prompt-library.test.ts`); `npm run build` exit 0, com o aviso de chunk >500 kB já existente; `npm run smoke` com `"ok": true`. Sem mudança em `src/` depois do build de 21:34 (último arquivo alterado às 20:53).
- Matriz do pedido (script descartável): 3 receitas × 3, 10 e 5 páginas, 9/9 com "N slides" correto; imagem única sem seletor de páginas.
- UI isolada (renderer, sem agente): sem overflow horizontal em 1024, 768, 390 e 320 px.
- E2E 1 (estado real da Patricia, script descartável, sem Electron): `synchronizeNativeProject` sai com exit 1 em `postnow.ts:149`, sem chamada ao motor. Página 1: "com retrato aprovado, esta página precisa mostrar a cliente; escolha Cliente (retrato aprovado)". Página 6: a mesma mensagem.
- E2E 2 (sandbox do motor, positivo): páginas 1 e 6 com `client_portrait`, 2 a 5 com `none`; marcadores corretos; um bloco "## Política de geração PostNow"; uma instrução de identidade por prompt; idempotente. O motor aceitou `client list`, `client set-logo`, `project create` e `project check`. Parou no bloqueio editorial esperado (`claims.json` `reviewed`, `editorial.copy_approved`, `editorial.claims_reviewed`); a aprovação não foi simulada.
- E2E 2 (sandbox, negativo, sem `owner_portrait`): "Página 1: Cliente (retrato aprovado) exige um retrato aprovado no perfil PostNow da marca. Cadastre-o com `postnow client set-portrait`." Página 6, a mesma. 0 chamadas de geração.
- Checagem de prompt (E2E 2): 2 falhas, "página 1: resíduo \"Não incluir pessoas\"" e a mesma na página 6.
- Dados reais intactos: `profile.json` com mtime 21:41:56.589 e pasta `projects` com mtime 21:41:56.678 (13 entradas); a verificação não gravou no projeto da Patricia.
- Rodadas pagas anteriores, não disparadas pela verificação: `1794092818439-3780179b` (20:06 → 20:14; sessão `96afdaa8-71a7-4fc3-ba14-7a08ac4bbba0`) e `1794094278264-6059590f` (20:31 → 20:38; sessão `1c78daf9-a5b0-4754-b222-00345d8d0000`; `revision.of` aponta para a primeira; refez p1 e p6). Ambas anteriores ao retrato e ao `owner_portrait`; quem as disparou não foi confirmado.
- Incidente: um preview de verificação disparou `codex exec` real (PID 616267, ~40 s, HOME normal). Custo não medido. Causa identificada por leitura de código, não reproduzida: `searchDirectories` (`src/main/setup/tools.ts` L103) põe `~/.local/bin` e `/usr/local/bin` antes do PATH. Não corrigido; item 9 em `DEV/DECISIONS.md`.
- Logs do app: "Já existe um processo ativo neste projeto. Aguarde ou cancele-o." (`requireIdle`, `storage.js:206`) e "Aguarde ou cancele os jobs de projeto antes de alterar ferramentas." (`setup.js:71`). Não investigados.
- App não reiniciado: o processo em execução usa build anterior às mudanças; o reinício aguarda resposta à pergunta 8.
- Não verificado: Codex real com esta frente; nenhuma imagem nova; `--image` com Codex real; bloqueio, aprovação e geração da Patricia pelo fluxo da UI; disparo de textos ao salvar pauta pela UI; quem cadastrou o retrato e quem disparou as rodadas de 20:06 e 20:31; custo do `codex exec` real; Windows e macOS.

## Latest Verification

- Date/scope: 2026-11-06 — verificação real do Studio em Electron isolado (`MDC_DATA_DIR=/tmp/mdc-e2e/data`, `--user-data-dir=/tmp/mdc-e2e/electron-user`, workspace `/tmp/mdc-e2e/workspace`). Projetos: carrossel `teste-e2e-carrossel`, vídeo de 1 imagem `teste-e2e-video`, vídeo VideoGo `teste-e2e-video-video`, skeleton `teste-e2e-skeleton`. Horários locais (UTC-3); nomes de ZIP e MP4 usam UTC.
- Gates (`src/`, `tests/`, `scripts/` sem mudança após 19:27 local): `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` 69/69, `# fail 0`; `npm run smoke` `ok: true`; `npm run build` exit 0 (`index-B_hcCSVp.js` 692.20 kB, gzip 191.16 kB; aviso >500 kB pré-existente). Logs em `/tmp/mdc-gate-*.log`.
- Carrossel Codex v1: job `6b9d53d5-…` `succeeded` (≈3,3 min; lote `1794001502221-a545bf9e`). 3 PNG 1080×1350 RGBA; logo nas páginas 1 e 3; copy literal; sem pessoas.
- Revisão v2 do carrossel: job `807d698a-…` `succeeded` (242 s; lote `1794001933013-c7ea805c`; `keptPages [1,2]`, `redonePages [3]`). Páginas 1 e 2 byte-idênticas ao v1 (copiadas para `.input` com sha256); página 3 regenerada.
- Imagem PostNow (vídeo de 1 imagem): job `e3eba261-…` `succeeded` (136 s; lote `1794001259506-d52b97bb`); `slide-01.png` 1080×1350 RGBA.
- Projetos de texto PostNow: carrossel `4e96e40a-…` (3 páginas; claims `qualified`; aprovado na UI; `contentHash c4d4c795…dd203d`); vídeo de imagem `2e8a8f00-…` (aprovado na UI; `contentHash 720158ee…ecff14`).
- Skeleton com headline: job `f9f75e7d-…` `succeeded` (439 s). `headline` preenchido nas 3 páginas; `depicted_person: none`; `copy_approved: false`, `claims_reviewed: false`; claims `qualified`, `reviewed: false`. `python: command not found` no shell do Codex é do ambiente do usuário, não bug do produto.
- Derivação e render VideoGo: storyboard `videogo.storyboard/v1`, reels 9:16, 30 fps, 5 s, 1 cena (imagem, push-in). Job `ffd5f8ba-…` `succeeded` (exit 0, ≈9 s).
- MP4 `renders/review/teste-e2e-video-video-1794001610257-fc0d4e20.mp4`: 3 845 225 bytes; 5,000000 s; H.264 Main 1080×1920; yuv420p; 30 fps; 150 frames; sem áudio. Sidecars `.mp4.storyboard-hash` e `.mp4.videogo.json` (`videogo.render/v1`, `expectedAudio: false`). sha256 `53236aed…efc78`.
- Revisão do vídeo: lightbox com contador, setas, "Fechar ampliado", "Manter", "Refazer", "Limpar decisão" e "Apagar do disco". Vídeo aprovado na UI: `<video>` `readyState 4`, `duration 5`, 1080×1920. Screenshots em `/tmp/mdc-cdp/`: `e2e-video-lightbox.png`, `e2e-video-revisao-aprovada.png`.
- Exclusão por tile (vídeo): `slide-01.png` removido de `generated/`; `.input/` e `.conformed/` vazios; `.status.json` `failed`; "Próximo" desabilitado; etapa volta a "3 Gerar imagens". Derivado `assets/visuals/generated/01.png` intacto (sha256 `a0befc35…5030`).
- Exclusão pelo lightbox (carrossel): `slide-03.png` do lote v2 removido de `generated/runs/1794001933013-c7ea805c/` e `.input/`; `.conformed/` vazio; slides 1 e 2 preservados; `failed`; UI com 2 tiles; "Gerar 3 imagens com Codex".
- ZIP do carrossel `teste-e2e-carrossel-20261106-215821.zip`: `zipfile -t` OK; 4 entradas (`MANIFEST.json` 934 bytes + 3 PNG); hashes do MANIFEST = ZIP = disco.
- ZIP do vídeo `teste-e2e-video-video-20261106-220947.zip` (3 846 148 bytes): `testzip()` None; 2 entradas STORE (`MANIFEST.json` 577 bytes; MP4); sha256 do MP4 = disco.
- Abrir pasta: "ZIP salvo" → "Abrir pasta" abriu `xdg-open` e `cosmic-files` em `/tmp/mdc-e2e/exports`. Processos abertos pela sessão foram encerrados por PID (snapshot `pids-antes-abrir.txt`); processos do usuário intactos.
- Exportar pasta: `export-4e96e40a-…` (carrossel) e `export-bdd5a7ac-…` (vídeo), cada uma com `MANIFEST.json` e artefatos. MANIFEST da pasta do vídeo = MANIFEST do ZIP após remover `exportedAt`.
- Follow-up de agente: job `d2b2d7f6-…` `succeeded` (34 s) com `## Perguntas para o usuário`. Resposta confirmada no diálogo "Responder ao Codex"; job `c3bbf114-…` `succeeded` (26 s): "Sem perguntas", nenhum arquivo alterado. `visualReview` depois = baseline (`approved: true`, `ready: true`, `contentHash 720158…`).
- Responsividade (CDP, 920/640/560 px): `overflowDoc: false` no projeto e no lightbox. Screenshots `/tmp/mdc-cdp/e2e-resp-final-*.png`. Cosmético: aba "Motores & Set..." trunca em 560 px.
- Console (renderer, monitor CDP): zero `exceptionThrown`, `console.error/warning/assert`, `Log.entryAdded` error/warning, `targetCrashed` e `frameDetached`. Cópia `/tmp/mdc-e2e/console-final.jsonl`. Não cobre o processo principal.
- Jobs: 12, todos `succeeded`, nenhum `running` (`/tmp/mdc-e2e/jobs-final.json`).
- App real `maquina-studio-user` reiniciado (`npm start`, pid 333278, `ELECTRON_WINDOW_READY`). Histórico real `history/jobs.json` sem `"status": "running"`: nenhum job convertido em `interrupted`.
- Achados abertos (detalhe técnico em `DEV/IMPLEMENTATION.md`, "Achados abertos"): crop 4:5 → 9:16 corta ≈30% da largura; rótulo "SCENE 1" derivado do id; direção "Motion Kinetic" proposta e "classic" usada; vídeo sem áudio (`--voice demo`); "imagem(ns)" literal em `projects.ts` l.953 e `Studio.tsx` l.202; `Operação não suportada.` (`runtime.ts` l.173) não reproduzido.
- Limites: Windows/macOS não exercitados (`shell.openPath` fora do Linux não verificado); ElevenLabs e narração fora do escopo; janela Wayland só via CDP; console só do renderer.

## Previous Verification (2026-11-06 — carrossel Instagram)

- Date/scope: 2026-11-06 — carrossel Instagram de 5 páginas em fixture sintético, workspace descartável `/tmp/mdc-imagegen-e2e.QASmnt/`; terminal do Studio; exportação de pacote.
- `npm run typecheck`: passou (exit 0). `npm run lint`: passou (exit 0). `npm test`: passou, 49/49. `npm run smoke`: `ok: true`, três projetos, uma marca, PTY cancelado. `npm run build`: passou; aviso de chunk >500 kB pré-existente.
- Estágio de geração sem Codex (`preparePostNowGeneration`, script descartável): `passed`, lote `1793976144489-f6cd2364`.
- Carrossel no Electron: a revisão bloqueou o projeto até `depicted_person` ser definido em cada página; após aprovar copy, claims e prompts, "Gerar imagens com Codex + PostNow" com "Todas as páginas" (`logoPolicy: all-pages`) gerou a rodada `1793977196498-2e51db64`, estado `ready`, 5/5 páginas.
- Lote conferido com Pillow: saídas 1080×1350 RGBA com alpha 255; entrada bruta 1122×1402 RGB; logo na mesma caixa 194×194 em [810, 994, 1004, 1188] nas 5 páginas. Contexto enviado ao motor restrito ao carrossel e à marca. Nenhum vídeo gerado.
- Exportação: somente as 5 saídas da rodada aprovadas pela UI. `projects.export` via IPC (diálogo nativo contornado) gerou `export-out/export-be93410f-…-31d48d0c-…` com `MANIFEST.json` `maquina.export/v1`, `approval: explicit-human-per-artifact`, 5 artefatos; sha256 e bytes iguais aos PNGs do lote; sem `.mp4`/`.mov`.
- Terminal no Electron (mouse e teclado reais via CDP): "Copiar seleção" e "Copiar tudo" copiam o texto do job (clipboard conferido com `wl-paste`); Ctrl+C com seleção copia o mesmo texto; Ctrl+C sem seleção não altera o clipboard. Causa: `session.defaultSession.setPermissionRequestHandler` negava `clipboard-sanitized-write`.
- Limites: ElevenLabs não executado; Windows/macOS não exercitados; sem commit, tag, push ou merge. `depicted_person` foi editado à mão nas 5 páginas do fixture (backup `project.json.before-depicted.json`); 5 aprovações de QA da Versão 2 foram removidas antes da exportação.

## Previous Verification (2026-11-06 — ciclo de vida)

- Date/scope: 2026-11-06 — ciclo de vida de projetos e imagens, gates editoriais PostNow, derivações VideoGo e E2E desktop isolado.
- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: passou, 37/37.
- `npm run smoke`: passou em workspace temporário; três projetos, uma marca, PostNow e VideoGo locais; PTY cancelado conforme o cenário.
- `npm run build`: passou; o chunk do renderer continua acima do aviso de 500 kB.
- PostNow real em arquivos temporários: preparou três PNGs 1080×1350 e aplicou a logo cadastrada. VideoGo real renderizou MP4 H.264 1080×1080.
- Electron com workspace isolado: criação nomeada PostNow/VideoGo sem job automático; projeto clonado com diretrizes mas sem mídia/aprovações/jobs herdados; exclusão removeu o projeto e sua pasta; mudança no prompt invalidou o aceite visual hash-bound e desabilitou a aprovação.
- Testes cobrem recuperação de exclusão parcial, isolamento entre workspaces, formatos/contagens, importação de formatos nativos, bloqueio por campos ausentes e dispatch durante journal pendente.
- Code review independente: quatro findings corrigidos e re-review sem issues restantes. Security review: sem findings após incluir isolamento cross-workspace.
- Patricia permaneceu somente em leitura. Após autorização explícita para concluir os testes e aprovação editorial do fixture sintético, uma chamada real do Codex ImageGen em workspace descartável terminou `succeeded`/exit 0; o PostNow finalizou 1 PNG 1080×1350, batch `1793968923287-bfe631be`, estado `ready`. A arte não foi aprovada para exportação; nenhum vídeo iniciou.
- O job teve erro interno recuperável `Argument list too long` ao tentar gravar a imagem, depois recuperou e concluiu. A logo sintética inicial tinha alpha 0, por isso não apareceu; a aplicação da logo PostNow foi confirmada visualmente com fixture sintético opaco via CLI. Isso valida o motor/overlay, não uma marca real do usuário.
- Nenhuma chamada ElevenLabs/clonagem. Patricia, sem mutações. Nenhum commit, tag, push, merge ou publicação.
- Limites: bundle do renderer >500 kB; Electron distribuído e runtime Windows/macOS ainda não exercitados. Release pública permanece `v0.1.1`.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passou com 12 entradas; warnings de recorrência históricos em `package.json`, `src/main/electron.ts` e `src/renderer/Setup.tsx`. A CLI 1.1.1 não expõe `check-recurrence` no help; os hotspots não foram alterados nesta tarefa.

## Validação local prévia à publicação

- No snapshot anterior ao bump de versão: typecheck, lint, `npm test` (6/6), `npm run smoke`, smoke com overrides, build e `dist:linux` passaram.
- Aquele build local 0.1.0 produziu AppImage 121.374.248 bytes e `.deb` 92.272.280 bytes; o AppImage abriu em perfil temporário e o `.deb` teve metadata verificado, sem instalação `apt`.
- Actions run `42040288628` construiu `v0.1.0`, mas uploads falharam por `:` nos nomes. A run `42041326153` corrigiu uploads, mas macOS recebeu HTTP 504 durante empacotamento. A run `42042527532` publicou a release `v0.1.0`.
- O feed v0.1.0 referia nomes que não correspondiam aos assets publicados. O template `artifactName` foi corrigido no código de release e o pacote foi bumpado para `0.1.1`.
- No snapshot anterior à publicação de `v0.1.1`, os builds locais foram gerados e smoke paths ficaram configuráveis por `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`. Depois, a Actions run `42045235690` publicou os manifests corrigidos.

## Histórico de publicação

- Commit inicial `80cc1e5` e tag anotada `v0.1.0` foram publicados; release permanece imutável.
- Primeiro upload falhou com nomes inválidos; tentativa seguinte teve falha transitória HTTP 504 no build macOS.
- Retry manual `42042527532` publicou `v0.1.0` e todos os assets.
- Commit `77cf59c` corrigiu `artifactName` para alinhar feeds e assets; tag anotada `v0.1.1` disparou Actions run `42045235690`, sucesso nos três builds e publicação.
- API pública confirma `v0.1.1` como latest. `latest-linux.yml`, `latest-mac.yml` e `latest.yml` foram lidos; os caminhos dos pacotes Linux, macOS e Windows correspondem aos nomes dos assets.

## Commands

```bash
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
npm run pack
orquestrador-maestro check-dev-gates --project-path . --strict
```

## Previous Release Packaging Verification (2026-11-05)

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 2/2 (runtime security invariants and AppImage-only Linux update policy).
- `npm run build`: passed; Vite reports renderer chunk >500 kB.
- `npm run pack`: passed on Linux x86_64; electron-builder loaded the GitHub publish config and produced `release/linux-unpacked`. Explicit `--publish never` prevented implicit publishing in CI.
- `npm run dist:linux`: passed with `--publish never`; produced x86_64 AppImage and Debian artifacts.
- Final AppImage launched directly through FUSE, without `--appimage-extract-and-run` or `--no-sandbox`; onboarding and project creation/persistence through the UI passed in `/tmp/maquina-appimage-final-workspace`.
- Packaged Linux binary returned the package-manager-only update message for the non-AppImage target without contacting GitHub; `tests/update-policy.test.ts` covers Linux AppImage vs other target platforms.
- `.github/workflows/release.yml`: YAML parsed successfully; local tag-rule check accepted `v0.1.0` and rejected mismatched `v0.1.1`. GitHub Actions itself was not run.
- No Git tag was created/pushed and no GitHub Release was published.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passed; warns of repeated worklog touches to `package.json` (4 entries) and `src/main/electron.ts` (3 entries); these were separate branding, release, and update-policy changes rather than repeated test failures.

## Not Verified Here

- Lookup público da release e leitura dos três feeds foram exercitados; a consulta pelo app informou que `0.1.1` já era a versão atual. Nenhum download/instalação de update foi tentado.
- Instalação manual do `.deb` com apt, instalação/fluxos nativos Windows/macOS, assinatura/notarização e macOS Intel não foram exercitados.
- Geração paga ElevenLabs, clonagem real e autenticação interativa não foram acionadas.

## Review

```yaml
id: PKG-001
severity: low
finding: The Debian package initially failed because electron-builder required project homepage metadata.
action: Added the official product homepage and correct top-level desktopName metadata; AppImage and deb then built successfully.
```

## Reported Origin Message

During CDP inspection, the test harness navigated an AppImage window to the development renderer path; the IPC origin guard correctly rejected that mismatched page and displayed “Origem não autorizada.” Reopening the AppImage's own `app.asar` renderer path, then restarting `npm start` at its matching development path, loaded both normally with no renderer errors. No project data was modified by this navigation.

## Outcome
- Passaram typecheck, lint, 7/7 testes, smoke com defaults/overrides, build e `dist:linux`; QA do AppImage e gates DEV strict passaram.
- Linux v0.1.1: AppImage abriu em workspace descartável, fluxo de projeto/narração e Preferências observados; `.deb` metadata verificado, sem instalação apt.
- Release pública `v0.1.1` e feeds Linux/Windows/macOS confirmados. Windows x64 e macOS arm64 foram compilados/publicados por Actions, mas ainda sem instalação/execução em hosts nativos.

## 2026-11-05 — ElevenLabs v4 no Studio

- Studio: `npm run typecheck`, `npm run lint`, `npm test` (7/7) e `npm run build` passaram. Vite reportou bundle renderer 616.16 kB acima do aviso de 500 kB.
- Runtime offline simulou `/v2/voices` e cofre cifrado: key ausente de `settings.json` e armazenada cifrada; síntese bloqueada antes de aprovar; mudança no texto após aprovação invalida o hash; asset de áudio apagado deixa de contar como pronto; zero chamadas TTS e nenhuma API externa real.
- `npm run smoke` passou: 3 projetos, 1 marca, VideoGo ligado, PTY cancelado conforme cenário.
- QA Chromium no preview compilado: projeto VideoGo de teste, edição/salvamento do texto, botões Aprovar/Gerar bloqueados sem cofre/voz, Preferências com instruções de API/clonagem; viewport 390×844 com `scrollWidth=390`, erros de console/renderer vazios.
- VideoGo: `npm run typecheck`, `npm test` (49 core + 20 flicker), `npm run test:external-audio` e `npm run build` passaram. E2E confirmou render audível com fixture sintética e `--voice demo` sem duplicação.
- Não executado: chamada ElevenLabs paga ou clonagem real; escuta humana de voz Eleven v4; testes Electron nativos Windows/macOS.

## 2026-11-06 — Geração PostNow e validação dos motores

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: passou, 24/24; novo teste confirma bloqueio de ImageGen sem aprovação, rejeição de hash stale e invalidação após edição de prompt.
- `npm run smoke`: passou em workspace temporário; criou três projetos, vinculou um brand e executou render VideoGo/derivação explícita.
- `npm run build`: passou; Vite mantém aviso do bundle renderer acima de 500 kB.
- PostNow real em workspace temporário: três imagens reais 1080×1350 foram preparadas pelo CLI e receberam a logo oficial. VideoGo real: MP4 H.264 1080×1080 em `renders/review`.
- Electron/Chromium abriu o projeto PostNow da Patricia em modo somente leitura: exibiu os seis PNGs raiz, a copy, duas claims/fontes e o gate de aprovação desmarcado. Não foram alterados arquivos, aprovações nem assets do projeto.
- A geração de novas imagens Codex ImageGen não foi iniciada: copy e alegações jurídicas no projeto precisam da revisão/aprovação humana explícita na UI. Ao aprovar, o Studio verifica o hash e roda o preflight PostNow antes de chamar a ferramenta nativa; o PostNow continua responsável por aplicar a logo.
## 2026-11-05 — Setup ElevenLabs em Motores & Setup

- Design-system discovery resolveu `@./components` com confiança 0.90; mudança de posição reaproveita os componentes e estilos existentes, sem redesign.
- O painel de API key, biblioteca, clonagem e instruções está agora em Motores & Setup, após os cartões dos motores de conteúdo. Preferências não contém mais configuração ElevenLabs.
- Chromium preview: baseline captured on Preferências before editing. After build, “Voz e narração do VideoGo” is visible in Motores & Setup after the content-engine cards; Preferências has no ElevenLabs or voice-setup text. At 390×844, document `scrollWidth=390`; no browser errors.
- Studio gates passed: `npm run typecheck`, `npm run lint`, `npm test` (7/7), `npm run smoke` and `npm run build`. Vite reports the existing renderer chunk warning at 618.93 kB (>500 kB).

## 2026-11-05 — Pastas legíveis e integração de nome com VideoGo

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: passou, 8/8. Novo teste exercita slug com acento, rejeição de briefing inválido sem deixar diretório, preservação de pasta ocupada, IDs internos UUID, sufixos para títulos repetidos, importação e recarga do caminho.
- `npm run smoke`: passou; usou workspace temporário e identificou VideoGo local em `/home/bolzan/Documentos/Code/VideoGo`.
- `npm run build`: passou; Vite mantém aviso para chunk renderer de 618.93 kB (>500 kB).
- A regressão lê o `storyboard.json` criado pelo Studio e comprova `id` igual ao nome legível da pasta e `title` igual ao título do projeto. Não houve chamada ElevenLabs paga/clonagem real.
- Projetos pré-existentes mantêm caminhos UUID; renomeá-los requer migração explícita, não aplicada.

## 2026-11-05 — Polimento das jornadas PostNow, VideoGo e voz

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: passou, 18/18; cobre a sequência de cada motor, approvals, templates, nomes legíveis, storage de key e clonagem consentida.
- `npm run smoke`: passou em workspace temporário; 3 projetos, 1 marca, PostNow/VideoGo/Maestro vinculados e PTY cancelado conforme o cenário.
- `npm run build`: passou; Vite mantém aviso do bundle renderer de 653.08 kB acima de 500 kB.
- Chromium: criação separada nos dois motores; título `Carrossel — 5 curiosidades sobre Saturno` / `Vídeo — Assunto teste`; template pessoal substituiu tema/público/tom/CTA, preservou placeholder desconhecido e chegou ao composer. Nenhum agente foi iniciado. Preferências não contém ElevenLabs; Motores & Setup contém a configuração de voz.
- VideoGo: journey mostrou roteiro como próxima etapa; exportação, aprovação e geração de áudio permaneceram desabilitadas sem aprovações. CTA de voz abriu Motores & Setup diretamente; depois da rolagem, seção apareceu no topo (~120 px), com permissões `voices_read`, `text_to_speech`, `voices_write`, `create_instant_voice_clone`, amostra de 2–5 min e pré-requisito FFprobe visíveis.
- 390/768/1280/1440 px: wizard, Studio PostNow, Studio VideoGo e setup sem overflow horizontal. Fluxos limpos: nenhum botão sem nome e nenhum erro de renderer. Axe não foi executado nesta validação.
- Preview declara `v0.2.0`, coerente com `package.json`; release pública permanece `v0.1.1`. Não foi executado empacotamento, Electron distribuído, publicação, commit/push/tag nem operação paga.
- Cofre seguro indisponível no preview; nenhuma key foi salva. TTS real, catálogo autenticado e clonagem real não foram exercitados; Windows/macOS nativos seguem pendentes.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passou; sinalizou hotspots de recorrência históricos em `package.json`, `DEV/**`, `src/main/electron.ts` e `src/renderer/Setup.tsx`.

## 2026-11-07 — Recorte 4:5 centralizado (ADR-018)

- Gates desta rodada:
  - `npm run typecheck`: sem erro.
  - `npm run lint`: sem erro.
  - `npm test`: 112/112 (`# pass 112`, `# fail 0`), incluindo `tests/postnow-crop-plan.test.ts` (7 casos) e `tests/postnow-round-delivery.test.ts` (3 casos).
  - `npm run build`: ok; `dist/renderer/assets/index-BlFQd9j3.js` 709.88 kB (aviso >500 kB pré-existente).
  - `npm run smoke`: `"ok": true` (3 projetos, 1 marca, motores postnow, videogo e maestro linkados).
- Validação offline com os 6 PNGs reais da rodada `1794090447511-af60e76f` (1092×1440), script `/tmp/mdc-crop-check/check.ts`, repo intocado:
  - Escala 0,98901; corte de 37 px no topo (2,57%) e 38 px na base (2,64%); esquerda e direita 0; saída 1080×1350.
  - Overlay inspecionado visualmente (`/tmp/mdc-crop-check/overlay-sheet.png`): texto, títulos e elementos principais fora das faixas; só folhagem decorativa e borda de fundo caem (slides 3–4 e topo dos slides 1, 4 e 5). Não medido por pixel.
- Smoke temporário com entrada 1092×1440 (`scripts/smoke-crop.tmp.ts`, removido): `"ok": true`; saída 1080×1350.
- Aceite de `planCenterCrop` sobre as 230 PNGs em `~/.codex/generated_images` (sem geração):
  - Limite de 3% por lado: 4:5 110/230 (47,8%); 1:1 16 (7,0%); 9:16 7 (3,0%); 4:3 2 (0,9%).
  - Limite de 10% (cópia temporária de `conform.ts`, não aplicada): 4:5 119 (+9: 1024×1536 ×8 e 1049×1499 ×1); 1:1 103; 9:16 16; 4:3 10.
  - Janelas recentes em 4:5 (ordem por mtime): 19 de 20; 42 de 50. Nas 50, 7 recusadas são 1672×941 (exigiria ~27% por lado).
- Reinício: `npm start` pid 551942 (start 20:06:49), `ELECTRON_WINDOW_READY`, modo persistente; `mdc-dbus` (pid 46697) intacto. Build final desta rodada: mesmo hash do renderer.
- Não executado: nenhuma geração Codex, imagegen ou API paga. Pendente: clique da usuária em "Gerar 6 imagens com Codex" ou "Gerar nova versão de 2 imagens".

## 2026-11-07 — Formatos, chave ElevenLabs, narração por cena e Modo Studio

- Gates finais (lead): `npm test` 157/157; `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run smoke` `"ok": true`; `npm run build` ok (chunk do renderer 721.22 kB; aviso >500 kB pré-existente). Arquivos de rodada isolados: 14/14 (`tests/postnow-round-delivery.test.ts`, `tests/postnow-round-format.test.ts`, `tests/postnow-render-round.test.ts`).
- Regressão de render (`tests/postnow-render-round.test.ts`): rodada legada `ready` sem formato registrado não é rebaixada; rodada já entregue não é sobrescrita; `.status.json` ilegível é recusado sem reescrever o arquivo (dois casos: sem mapping e entregue com mapping). Mutações descartáveis em cópia fora do repo: reverter o predicado de `isRoundDelivered` derrubou 3 testes; remover a guarda de status ilegível de `roundFormat` derrubou 2 testes.
- FormatoVerify: item 3 (mensagens com formato removido) PASS — revisão bloqueada só com "O formato escolhido foi removido do app; escolha outro formato no Studio.", geração e render recusados, `project.json` idêntico. Item 5 falhou na rodada com expectativas antigas por causa do próprio script: `.status.json` sem `updatedAt` (fixture inválida pelo schema do app) era lido como rodada crua e reprocessado (fail-open). Reexecução do item 5 com o fix: caso 1 (`{"state":"ready"}`, sem mapping) PASS — job `failed` com "O estado desta rodada está ilegível; gere uma nova rodada com o formato escolhido.", `.status.json` byte a byte inalterado, nenhuma saída; caso 2 (`{"state":"ready","format":"carousel-1x1"}` + `.mapping.json`) PASS — job `failed` com "Esta rodada já está pronta e não será sobrescrita.", arquivo inalterado. O script do agente usou stub fiel ao trecho de `supervisor.ts`; o supervisor real está coberto pelos testes de regressão, que aguardam o evento final do job.
- NarracaoVerify (0 rede, 0 pago): gate sem voz liberado; voz selecionada sem áudio bloqueia por cena; `narration.approve` sem chave recusa antes de qualquer rede; upload mp3 → `audioSource=upload`; gravação webm opus → `narration.m4a` (3,007 s); entradas inválidas recusadas sem escrita; `removeAudio` exige `confirm: true`; alterar o texto da cena remove só o áudio dela; asset apagado → `audioAttached=false` e o render recusa.
- Divergências registradas: voz selecionada sem chave não é apontada no gate de narração; estado não expõe `stray` (ref órfã: a UI mostra só "Enviar áudio"); render logo após aprovar o áudio de uma única cena não foi capturado diretamente.
- Não verificado: chave ElevenLabs real; geração paga (ImageGen, Codex, TTS, clonagem); render VideoGo com áudio; microfone real, indicador de microfone e UI do Modo Studio em Electron; qualidade do áudio gravado; Windows/macOS; ref órfã em app real; `projects.narration.generate` e `elevenlabs.*` com chave válida.

## 2026-11-08 — Revisão geral: E1-E6, divergências 1-3 e pendências 9-13

- Janela: início 2026-11-08T06:34:59Z (2026-11-08 03:34 UTC−3); término medido 2026-11-09T03:07:21Z (2026-11-09 00:07 UTC−3). Data da rodada: 2026-11-08. HEAD `e38e6a4`; sem commit, tag, push ou publicação.
- Plano: `.omx/plans/revisao-geral-20261108T050544Z.md` (v6); spec: `.omx/plans/autopilot-spec-revisao-geral.md`. Consenso incompleto: Architect e Critic indisponíveis (`usage_limit_reached`, `openai-codex/gpt-6-luna`). Validação single-agent em `.omx/autopilot/revisao-geral/validation.md`.
- Gates de código (após o último ajuste, `src/renderer/Studio.tsx` L697):
  - `npm run typecheck` exit 0; `npm run lint` exit 0.
  - `npm test` 188/188, exit 0.
  - `PYTHONDONTWRITEBYTECODE=1 npm run smoke` exit 0, `"ok": true`.
  - `npm run build` exit 0: `dist/renderer/assets/index-CA12svJw.js` 722.07 kB (gzip 200.04 kB); aviso >500 kB pré-existente.
  - `orquestrador-maestro check-dev-gates --project-path . --strict`: EXIT=0 ("DEV gates passed.", WorklogEntries 12, MaxEntries 12) antes deste registro; repetição após o registro em `.omx/autopilot/revisao-geral/checkpoint.md`.
  - Avisos não bloqueantes de recorrência (3+ entradas): `src/main/projects.ts` (7), `src/main/agents.ts` (6), `src/main/content/postnow.ts` (6), `src/renderer/Studio.tsx` (6), `src/main/electron.ts` (4), `readme.md` (3), `src/main/content/native.ts` (3), `src/shared/contracts.ts` (3). `check-recurrence --write` e investigação causal não executados (sugeridos pelo gate, não exigidos).
- Correções:
  - E1 (ADR-026): documentado; sem remoção. `~/.codex/tmp/arg0-linux` é `drwx------ bolzan` com 1458 entradas, incluindo itens `root:root` de 2026-10-31; remoção exige root. Origem não confirmada; reprodução pausada.
  - E2 (ADR-030, ADR-032): `claims.json` malformado bloqueia revisão e aprovação (`src/main/projects.ts` L924, L957–958; teste `tests/visual-approval.test.ts` L128). `storyboard.json` é sinal não bloqueante: `src/renderer/Studio.tsx` L954 mostra o aviso; L236 mostra o primeiro problema como motivo quando o storyboard não está pronto. Render continua recusado (`src/main/projects.ts` L1592, L1594–1595).
  - E3 (ADR-027): `classifyCommand` (`src/shared/agent-events.ts` L81; `exit_code` em L157–160): `exit_code` ≠ 0 gera "Comando falhou (código N): <comando>", com comando truncado; código 0 não gera. Testes `tests/agent-events.test.ts` 10/10 (L69, L84). Causa dos códigos 128 e 1 não reproduzida (exige `codex exec`).
  - E4 (ADR-030): `saveVisualText` (`src/main/projects.ts` L436) zera as três flags quando algum texto muda (`textChanged` L462; reset L466–472). A aprovação exige `copy_approved`, `claims_reviewed` e `claimsDocument.reviewed` (L1032–1035); `approveVisualContent` (L1050) seta as três (L1061–1062). `reconcileEditorialApprovals` (L1071–1085; chamada em L1199, só para projetos de imagem) zera as flags quando o hash do conteúdo não confere. Defaults `false` em `src/main/content/native.ts` L63 e L66; o prompt do agente proíbe alterar as flags (`src/main/agents.ts` L142). Testes `tests/visual-approval.test.ts` L73, L92, L128.
  - E5 (ADR-031): briefing de vídeo marcava público e formato como pendentes mesmo definidos. `pendingBriefPoints` (`src/main/content/native.ts` L24–34) inclui cada um só quando falta; `initializeNative` (L37–70) grava `planning/brief.md` (L42). Testes `tests/brief-pending.test.ts` 3/3 (L22, L29, L35). Vale só para projetos de vídeo criados depois.
  - E6 (ADR-028): `planCenterCrop` (`src/main/content/conform.ts` L12) inalterado. Medição sintética 1448×1086 → 1440×1080: `cropped:false`; LANCZOS sem perda de bordas. Textos corrigidos: `src/main/agents.ts` L177, `src/main/projects.ts` L1574, `src/main/content/postnow.ts` L406. Limite de 3% por lado (ADR-018) mantido. As cinco artes reais não foram inspecionadas.
- Divergências de `DEV/VERIFY.md` (2026-11-07):
  - 1 (ADR-025): "gere" só com chave ElevenLabs. `narrationGate` (`src/shared/narration.ts` L108–123: opções em L112; sufixo "Sem a chave ElevenLabs, só envio ou gravação." em L117); `elevenLabsReady` (`src/main/projects.ts` L295); Studio L697 cita a chave (L696 não cita; ver limitações). Teste `tests/narration-gating.test.ts` L66 (suíte 11/11).
  - 2 (ADR-025): referência órfã: `stray = ref !== undefined && file === undefined` (`src/main/projects.ts` L280); `NarrationScene.stray` (`src/shared/contracts.ts` L38); gate emite issue para `stray` (`src/shared/narration.ts` L114–115); Studio L686–688; `src/renderer/NarrationTeleprompter.tsx`. Remoção pela API `removeNarrationAudio` (`src/main/projects.ts` L404). Teste `tests/narration-stray.test.ts` 1/1 (depende de ffmpeg).
  - 3 (ADR-025): aprovação parcial de cenas: `tests/narration-gating.test.ts` L74.
- M12 (`DEV/TESTING.md`): `tests/elevenlabs-key.test.ts` 6/6, com fetch stubado: 401 inválida não grava; 429 não grava; 403/401 `missing_permissions` grava com ressalva; 200 sem ressalva; falha de conexão não grava.
- Contrato VideoGo v1 (ADR-032): `src/shared/storyboard-contract.ts` (novo; `STORYBOARD_SCHEMA` L12; `storyboardContractIssues` L121); `storyboardStatus` (`src/main/projects.ts` L222–233) não lança. Teste `tests/storyboard-contract.test.ts` 18/18.
  - Cruzamento com `validateStoryboardFile` (`../VideoGo/src/services/production/storyboard.ts` L206), 26 casos, harness descartável em `/tmp/xc` (removido): 24 concordam. Divergências app-aceita/VideoGo-recusa: `asset-inexistente` (por design: o contrato não confere existência de arquivos) e `spokentext-digitos-diferentes` (dígitos fora de tags não comparados). Nenhum caso recusado pelo app foi aceito pelo VideoGo.
- Pendências 9–13 (`DEV/DECISIONS.md` L244–260; ADR-029): default "manter"; aguardam decisão da usuária; nenhuma mudança de código.
  - 9: `resolveTool` (`src/main/setup/tools.ts` L119; `searchDirectories` L103, `toolEnvironment` L142) põe `~/.local/bin` e `/usr/local/bin` antes do PATH. Um preview disparou `codex exec` real (PID 616267, ~40 s).
  - 10: página sem headline ou copy não grava (`src/main/projects.ts` L459–460).
  - 11: `client_portrait` obrigatório (`portraitRequiredPages`, `src/shared/depicted-person.ts` L20).
  - 12: motor de narração local não instalado; mantido ElevenLabs.
  - 13: projeto da Patricia com `carousel-4x5` segue bloqueado por `unsupportedFormat`; nenhuma escrita.
  - Pendências 1–8 não tratadas.
- Docs: `DEV/WORKLOG.md` (entrada 2026-11-08; bloco 2026-11-06 "Lifecycle e confiabilidade dos motores" movido para o fim de `DEV/HANDOFFS/WORKLOG_ARCHIVE.md`, por limite de 12 entradas); `DEV/HANDOFF.md`; `DEV/DECISIONS.md` (ADR-025 a ADR-032); `DEV/TESTING.md` (inventário M01–M20); `DEV/CONTEXT.md`; `DEV/SPECS/ACTIVE.md`.
- Irmãos e storage (somente leitura; nenhuma escrita nesta rodada):
  - `../PostNow`: `git status --porcelain` vazio; `find -newermt '@1794119699'` (excl. `.git`) sem saída.
  - `../VideoGo`: HEAD `5406fc0` (2026-11-08T21:22:06-03:00, "docs: roadmap do apresentador virtual por fase"), commit posterior ao início e feito fora desta rodada; nenhum comando de escrita foi executado lá. `git status --short`: só `?? .claude/launch.json` e `?? .claude/settings.local.json`. `find -newermt` (excl. `node_modules` e `.git`): `DEV/INDEX.md` e `DEV/ROADMAP.md`, alterados por `5406fc0`.
  - Storage `/home/bolzan/MaquinaDeConteudo/storage`: `find -newermt '@1794119699'` sem saída (só `stat` e `find`; conteúdo não lido). Identidade do projeto da Patricia não confirmada.
- Critérios de aceite (plano §7). n/N = subrequisitos verificados nesta rodada / total do critério.

| AC | Status | n/N | Evidência | Não verificado |
|---|---|---|---|---|
| AC1 | parcial | 2/3 | `tests/elevenlabs-key.test.ts` 6/6: 401 inválida e 429 não gravam; falha de rede não grava; 403/401 `missing_permissions` grava com ressalva (ramo a). Falta teste de `elevenlabs.status` | chave real |
| AC2 | não executado | 0/4 | pausa: ImageGen pago | carrossel 4:3 real; ZIP com `MANIFEST.json` |
| AC3 | não executado | 0/2 | cobertura existente, não alterada: `tests/postnow-render-round.test.ts`, `tests/postnow-round-delivery.test.ts` | regeneração 1:1 real; diff de `.status.json` e `.mapping.json` |
| AC4 | não executado | 0/3 | unitários: `tests/narration-gating.test.ts`, `tests/narration-stray.test.ts`, `tests/narration-attach.test.ts` | render com faixa; ffprobe; correlação (pausa: TTS e render) |
| AC5 | parcial | 1/3 | (i) `tests/permissions.test.ts` existente, passa em `npm test`, não alterado | (ii) indicador e (iii) mensagem pt-BR de permissão negada: Electron |
| AC6 | parcial | 6/20 | cobertas: M06, M08, M10, M11, M12, M17; parciais: M04, M05, M07, M09, M13, M16, M18; sem teste: M01, M02, M03, M14, M15, M19, M20 | UI em Electron |
| AC7 | parcial | 6/7 | typecheck, lint, `npm test` 188/188, smoke, build e check-dev-gates verdes; F1b, F3 e F5 com testes; F1 sem teste (sem mudança em `resolveTool`) | — |
| AC8 | atendido | 1/1 | `find -newermt` em `../PostNow` e storage: sem saída. Em `../VideoGo`, só `DEV/INDEX.md` e `DEV/ROADMAP.md` têm mtime posterior ao início, alterados pelo commit externo `5406fc0` (fora desta rodada). Sem migração | identidade do projeto da Patricia; conteúdo do storage |
| AC9 | atendido | 1/1 | este registro | — |
| AC10 | não executado | 0/3 | pausa: TTS real. Recusa de `configure` coberta; recusa de TTS não | TTS real; faixa no render; ffprobe |
| AC11 | parcial | 1/2 | ramo (a) decidido: `client_portrait` obrigatório (pendência 11 mantida) | geração real nas dimensões (pausa) |
| AC12 | parcial | 2/3 | aprovação editorial: `tests/visual-approval.test.ts` L73, L92; briefing: `tests/brief-pending.test.ts` L22, L29, L35 | aprovação de voz sem teste de regressão novo |
| AC13 | parcial | 0/3 completos | (i) E1 documentado (ADR-026); E3 com mensagem (ADR-027), causa pausada; (ii) releitura pré-patch não implementada; (iii) `claims.json` validado em `buildVisualReview` (`src/main/projects.ts` L924; checagens L957–958); storyboard como sinal (ADR-032), validação pós-job não implementada | `codex exec` (pausa) |
| AC14 | não executado | 0/3 | pausa: render com faixa | export com bytes e hash; `exportZip` com `MANIFEST.json`; ffprobe 15 s ± 1 s |

- Não verificado: Electron (UI do Modo Studio, indicador, permissão de microfone, teleprompter em runtime); microfone; chave ElevenLabs real; TTS; ImageGen; `codex exec`; reinício do app; conteúdo do storage (proibido); as cinco artes da Patricia; Windows; macOS.
- Limitações:
  - Sem independência: Architect e Critic indisponíveis. Validação single-agent (10 pontos) com correções: menção à chave no Studio em L697 (não L696); referência da pendência 10 corrigida para L459–460; bloqueio do storyboard implementado e revertido (ADR-032).
  - AC13 (ii) e a causa dos códigos 128 e 1 (E3) dependem de `codex exec` (pausa). Origem do E1 não confirmada.
  - E6: artes reais não inspecionadas.
  - Storyboard é sinal, não bloqueio (ADR-032). `tests/narration-stray.test.ts` depende de ffmpeg.
  - Sem teste permanente: redação de segredos (`src/main/supervisor.ts` L14–16, aplicada em L81, L109, L253); prefixo "Storyboard inválido:"; recusas de render e de storyboard; M01, M02, M03, M14, M15, M19, M20.
  - M19: `src/main/agents.ts` L179 grava `error.message` bruto.
  - `src/main/agents.ts` L135–136 ("até 3% por lado") mantido. Studio L696 não cita a chave. Botão "Gerar áudio" (`src/renderer/Studio.tsx` L708) sem checagem de chave no renderer.
  - Árvore git suja: 101 entradas (baseline 97 + 4 novos: `src/shared/storyboard-contract.ts`, `tests/brief-pending.test.ts`, `tests/narration-stray.test.ts`, `tests/storyboard-contract.test.ts`); nenhuma linha do baseline sumiu. `git status` não isola a rodada; a comparação é por baseline.
  - VideoGo: `dist` não recompilado; commit externo `5406fc0`. Hotspots de recorrência do gate não investigados.
- Testes alterados: `tests/agent-events.test.ts`, `tests/elevenlabs-key.test.ts`, `tests/narration-gating.test.ts`, `tests/visual-approval.test.ts`. Novos: `tests/brief-pending.test.ts`, `tests/narration-stray.test.ts`, `tests/storyboard-contract.test.ts`.

## 2026-11-09 — Biblioteca editorial premium
- `npm run build`, `npm run typecheck` e `npm run lint`: passaram; Vite informou bundle acima de 500 kB.
- Prévia isolada: biblioteca observada em 320×568, 390×844, 768×1024, 1024×768 e 1440×900, sem overflow horizontal; capa de exemplo carregou e ocultou o estado vazio.
- Busca sem resultado atualizou a contagem para zero; trilha PostNow abriu o diálogo e Escape o fechou. Nenhum erro de página registrado.
- Limites: dados de prévia temporários; Electron nativo, geração paga e alterações em projetos reais não foram exercitados.

## 2026-11-09 — Motores & Setup: submenu ElevenLabs, overview executivo e redesign de layout
- `npm run typecheck` e `npm run lint`: exit 0 sem erros ou avisos.
- `npm test`: 223 de 223 testes passando.
- `npm run smoke`: exit 0; `"ok": true`.
- `npm run build`: exit 0; bundle do renderer compilado com sucesso (assets minificados e CSS correspondente).
- Teste interativo via Browser API em Chromium headless (`preview.ts` em porta 4178):
  - Navegação principal: botão "Motores & Setup" seleciona a seção e renderiza abas e submenu.
  - Submenu da sidebar: itens "Motores & CLIs" e "ElevenLabs & Voz" (com pill de status "Setup" quando não configurado / "OK" quando ativo) funcionais com destaque visual e indicador lateral.
  - Submenu in-page (`.setup-subnav`): botões segmented tab "Motores & CLIs" e "ElevenLabs & Voz" alternam perfeitamente o conteúdo sem recarregar o estúdio.
  - Painel ElevenLabs (`.elevenlabs-dashboard`):
    - Ribbon de confiança com os 4 pilares: Cofre Seguro do SO (`safeStorage`), Zero Vazamento, Síntese Hash-Bound e Áudio Local Próprio.
    - Card de credenciais com campo de senha, toggle Eye/EyeOff para exibir/ocultar a chave, botões de ação e permissões oficiais colapsáveis.
    - Catálogo de vozes com campo de busca textual e filtros rápidos por pills (Todas, Clones, Catálogo) e player de áudio sob demanda interativo com botão Play/Stop.
    - Seção de clonagem instantânea com checklist das 3 regras de gravação, input de nome, termo de consentimento e titularidade com checkbox destacado e botão de envio com FFprobe verificado.
  - Painel Motores & CLIs:
    - Overview banner com 4 métricas (Assistente de IA, Motores de Produção, Dependências de Sistema e ElevenLabs & Voz com atalho para a aba de voz).
    - Onboarding guide com botão de navegação direta para ElevenLabs & Voz quando a opção de narração é selecionada.
  - Responsividade e ausência de overflow:
    - Testado em 390px, 768px, 1280px e 1440px: todos com `scrollWidth === innerWidth` e `overflow: false`. Em 390px o submenu lateral se recolhe graciosamente na grade mobile enquanto as tabs in-page garantem alternância perfeita.
- Limites: testes executados em ambiente de prévia do navegador sem gravação real paga na ElevenLabs; Electron desktop nativo não foi reiniciado.
