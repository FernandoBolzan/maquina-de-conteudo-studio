# Testing And Verification

## Local checks

```bash
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
npm start
```

## Distribution targets

```bash
npm run dist:linux    # AppImage + deb; build and launch on Linux
npm run dist:windows  # NSIS installer; certify install, PTY, and updater on Windows
npm run dist:mac      # dmg + zip; build, open, and verify permissions on macOS
```

Local packages built from the current checkout (`package.json` still says `0.1.1`):
- `release/maquina-de-conteudo-0.1.1-x86_64.AppImage` — 122,062,829 bytes; opened from FUSE in a disposable profile/workspace.
- `release/maquina-de-conteudo-0.1.1-amd64.deb` — 92,381,148 bytes; `dpkg-deb --field` reports package `maquina-de-conteudo`, version `0.1.1`, architecture `amd64`; not installed with apt.

The official public `v0.1.1` assets are separate builds from tag `v0.1.1`: its updater feed reports AppImage 118,860,613 bytes and `.deb` 91,914,484 bytes. Current `main` has ElevenLabs files absent from that tag, while its `package.json` still says `0.1.1`. Local filenames/version therefore do not prove equivalence to the public binaries; do not distribute current local builds under the released version.

The public release provides a Windows x64 NSIS installer and macOS arm64 DMG/ZIP. Windows/macOS native installation and user flows remain unverified. Public updater manifests match published asset names; signatures/notarization were not validated. AppImage supports user-confirmed in-app updates; `.deb` updates through the system package manager.

- O checkout atual executa 230 testes determinísticos ('npm test'), cobrindo contratos de storyboard VideoGo v1, sanitização, permissões de sessão, validação de chaves ElevenLabs por status HTTP, aprovações editoriais vinculadas a hash SHA-256, conformação centralizada de imagem, derivadas bidirecionais e journals de exclusão recuperável. Os testes não realizam chamadas de rede pagas nem consomem créditos reais.

- Testes de runtime usam `ffmpeg` para criar fixture PNG e criam symlink. Instale FFmpeg no host; Windows também precisa permitir symlink (Developer Mode ou privilégios adequados).
- `npm run smoke` cria e remove uma raiz de dados/workspace temporária. Exercita criação de marca e projetos, derivação de imagem/vídeo com FFmpeg, manifesto de exportação, preflight de motores, entrada/redimensionamento/cancelamento de PTY e eventos.
- Os caminhos aceitam `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`. PostNow e VideoGo mantêm os defaults de diretórios irmãos; Maestro tem default Linux `/usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli` apenas no Linux. Windows/macOS precisam de `MDC_SMOKE_MAESTRO`; smoke nativo ainda não foi executado.
- Latest command outcomes and artifact sizes: [`VERIFY.md`](VERIFY.md). User installation steps and the platform status matrix: [`../README.md`](../README.md).

## Release and update contract

- `package.json` SemVer is authoritative; stable tags must be annotated `vX.Y.Z` and match it exactly.
- Pushing a matching tag starts `.github/workflows/release.yml`. Three native builds must succeed before GitHub creates the stable release with installers and updater metadata.
- Packaged UI flow: check for update, review offered version, explicitly confirm download/install, then restart. The fixed feed is `FernandoBolzan/maquina-de-conteudo-studio`; no environment variable is required.
- Do not publish a release without electron-updater `latest*.yml` metadata. Do not overwrite published tags; recovery is a higher SemVer version.
- A release pública `v0.1.1` foi publicada após a Actions run `42045235690`; três builds nativos e uploads concluíram. Os manifests públicos correspondem aos nomes dos assets. Runtime/instalação Windows/macOS permanecem por validar nativamente; histórico de runs está em [`VERIFY.md`](VERIFY.md).
## Manual user-flow checks

- Launch the Electron window and inspect navigation, project creation, and brand creation in a disposable workspace.
- Render a carousel using a healthy PostNow environment; verify output dimensions for the chosen format, e.g. 1080x1080 for 1:1, 1440x1080 for 4:3, 1080x1920 for 9:16, and slide previews.
- Carrossel PostNow: cada página precisa de `depicted_person` antes da revisão; com slides vazios, revisão, criação de rodada e contexto ao motor devem ficar bloqueados, sem chamada paga.
- Terminal no Electron: arrastar para selecionar um trecho, testar "Copiar seleção", Ctrl+C com seleção e "Copiar tudo" num log maior que a tela; conferir o clipboard, sem sequências ANSI.
- Approve slides, derive image -> VideoGo, render an MP4 with VideoGo, then extract frames back to an image project.
- Verify setup diagnostics, authentication status, preferences, and the unconfigured-update-channel message.
- Verify security cases in `tests/runtime.test.ts` and project/export/FFmpeg/PTy flows in `scripts/smoke.ts`.
- `tests/update-policy.test.ts` covers AppImage-only Linux in-app updates; the packaged non-AppImage Linux binary must show the package-manager message without querying the update feed.
- Do not invoke paid model generation or login flows in unattended tests.
- Chave ElevenLabs real: a validação manual com chave real não está automatizada; sem autorização explícita, não executar.
- Áudio por cena: enviar um arquivo por cena e gravar um take no Modo Studio (permissão de microfone); conferir `narration.m4a` por cena e a aprovação antes do render.
- Trocar o formato na etapa de imagens refaz a rodada inteira no formato escolhido.
- Projeto com formato removido (ex.: 4:5 antigo) abre bloqueado com a mensagem de remoção; geração e render recusam até a escolha de outro formato.
- Render em rodada legada não rebaixa o status da rodada; `.status.json` ilegível não é sobrescrito nem reprocessado (`tests/postnow-render-round.test.ts`).
- Retrato da cliente: com retrato aprovado no perfil PostNow, capa, última página e post ou Story de página única oferecem "Cliente (retrato aprovado)". Sem retrato, essa escolha é recusada antes do motor.
- Textos automáticos: salvar uma pauta nova em projeto de imagem sem textos inicia a preparação sem diálogo; com textos gravados, não dispara.
- Pedido com páginas: carrossel de 3, 5 ou 10 páginas mostra o número escolhido no pedido de texto; imagem única não mostra seletor de páginas.

## Gates desta rodada (2026-11-07)

Comandos executados pelo lead, com resultado exato:

- `npm run typecheck` (`tsc --noEmit && tsc -p tsconfig.main.json --noEmit`): exit 0.
- `npm run lint` (`eslint src`): exit 0.
- `npm test` (`tsx --test tests/*.test.ts`): 102 de 102 testes passando.
  - Novo em `tests/brand-references.test.ts`: "isAttachableReference keeps references with a comma in the path out of --image".
  - Novo arquivo `tests/context.test.ts`: "singleLine collapses line breaks so a reference name cannot start a new context instruction".
  - Testes de `applyArtText` em `tests/visual-text.test.ts`: troca headline e copy no arquivo de arte e recusa texto ausente sem gravar.
- `npm run build`: exit 0. Aviso conhecido: chunk do renderer `index-BlFQd9j3.js` com 709.88 kB minificado (acima de 500 kB).
- `npm run smoke`: exit 0; saída com `"ok": true`, `"projects": 3`, `"ptyCancelled": "cancelled"`.

Testes e smoke não fazem chamada paga nem usam rede de modelo. Não há geração de imagem ou vídeo nesses gates.

## Gates da frente retrato, textos e pedido (2026-11-07)
- `npm run typecheck` e `npm run lint` sem erros.
- `npm test` 127/127, com `tests/text-generation.test.ts`, `tests/depicted-person.test.ts` e `tests/prompt-library.test.ts`.
- `npm run build` com exit 0 (aviso de chunk >500 kB já conhecido); `npm run smoke` com `"ok": true`.
- Detalhes e limites em `DEV/VERIFY.md` (seção 2026-11-07, retrato, textos e pedido).

## Verificação real (2026-11-06)

- Isolamento: instância Electron própria com `MDC_DATA_DIR=/tmp/mdc-e2e/data`, `--user-data-dir=/tmp/mdc-e2e/electron-user` e workspace `/tmp/mdc-e2e/workspace`.
- Diálogo nativo de seleção de pasta (`dialog.showOpenDialog`) stubado só nessa instância, com fila `globalThis.__mdcPickQueue`; fila vazia responde `canceled`.
- Gerações reais (Codex ImageGen, PostNow e VideoGo com `--voice demo`) foram disparadas no app em execução, sob autorização explícita. Não fazem parte de `npm test` nem de `npm run smoke`. ElevenLabs (pago) não foi exercitado.
- Fluxos: imagens (carrossel com revisão v2 parcial e vídeo de 1 imagem), lightbox, exclusão por tile e lightbox, derivação e render VideoGo de 5 s, ZIP e exportação de pasta, follow-up de agente, headline/claims do skeleton, responsividade em 920/640/560 px e console do renderer.
- Resultados, IDs, hashes e achados: [`VERIFY.md`](VERIFY.md), seção `## Latest Verification`.

## Verificação E2E isolada (2026-11-07)

- Lançamento: `MDC_DATA_DIR=/tmp/mdc-e2e/data npm start -- --user-data-dir=/tmp/mdc-e2e/electron-user --remote-debugging-port=9447 --inspect=9448`. Sem `MDC_DATA_DIR`, o runtime usa o `userData` do Electron; isso ocorreu uma vez nesta rodada, foi corrigido e não tocou o storage do usuário.
- Codex: stand-in em `/tmp/mdc-e2e/bin/codex`, fora do repositório, ligado por `resolveTool` (`src/main/setup/tools.ts`) por symlink em `/tmp/mdc-e2e/data/runtime/tools/codex/node_modules/.bin/codex`. Não chama modelo; recusa `--cd` fora de `/tmp/mdc-e2e/`; exige `--image` nas rodadas de geração; grava o argv em `/tmp/mdc-e2e/fake-codex-argv.jsonl`.
- Console: `uiEvents` (erros e avisos do console, exceções, `Log.entryAdded`, `Inspector.targetCrashed`, `Page.frameDetached`) vazio em todas as checagens.
- Resultados, IDs e limites: `DEV/VERIFY.md`, "Rodada 2026-11-07 — E2E isolado com stand-in do Codex".

## Inventário de mensagens de recusa — revisão geral (2026-11-08)

- Escopo: gatilhos M01–M20 do plano `.omx/plans/revisao-geral-20261108T050544Z.md` (AC6). Textos conferidos por leitura de `src/` e `tests/` em 2026-11-08. IDs estáveis.
- Situação: **coberta** = mensagem pinada por teste; **parcial** = só parte das mensagens do gatilho pinada; **sem teste** = nenhuma asserção de mensagem. UI e Electron não foram exercitados nesta rodada (sem Electron no ambiente).
- Fora deste inventário: avisos informativos do E6 (`src/main/agents.ts` L177, `src/main/projects.ts` L1574, `src/main/content/postnow.ts` L406), rótulos de evento do E3 (`src/shared/agent-events.ts`) e o aviso não bloqueante de storyboard (`src/renderer/Studio.tsx` L954; ADR-032). Não são recusas.
- Lacuna: recusas de render por storyboard (`src/main/projects.ts` L1591–1592 e L1594–1595) e o prefixo "Storyboard inválido:" (`src/renderer/Studio.tsx` L236) não estão em M01–M20 e não têm teste.

| ID | Gatilho | Mensagem (pt-BR) e fonte | Situação e evidência |
|---|---|---|---|
| M01 | Workspace sem projetos | "Nenhum projeto no workspace" (`src/renderer/Projects.tsx` L266); "Nenhum projeto criado ainda." (`src/renderer/App.tsx` L196) | sem teste (UI) |
| M02 | Filtro sem resultado | "Nenhum projeto encontrado para este filtro" e "Experimente outro nome ou filtro." (`src/renderer/Projects.tsx` L264) | sem teste (UI) |
| M03 | Ferramenta ou Maestro ausente | "… não encontrado. Instale-o em Configuração e execute o diagnóstico novamente." (`src/main/setup/tools.ts` L155); "Executável Maestro/Node indisponível." (`src/main/agents.ts` L111); "Maestro indisponível: … Contexto local preservado." (`src/main/agents.ts` L117) | sem teste |
| M04 | Página sem arte, copy ou função visual | "PostNow bloqueou a geração por pendências editoriais ou estrutura incompleta." (`src/main/content/postnow.ts` L182); "Página N: arquivo de arte ausente ou ilegível. Use Preparar textos…" (`src/main/projects.ts` L945); "Página N: copy vazia." (L950); "Página N: função visual vazia. Use Preparar textos…" (L951); "Página N: a copy ou a função visual não está no arquivo de arte…" (L952); "arquivo de arte ausente." (L452) e "arquivo de arte não encontrado." (L454) | parcial: "copy vazia" em `tests/carousel-engine-gate.test.ts` L71; demais sem teste |
| M05 | Formato removido ou desconhecido | "Formato PostNow desconhecido ou removido; escolha outro formato." (`src/shared/formats.ts` L52); "Formato PostNow ausente ou removido; escolha outro formato." (`src/main/content/native.ts` L45); "Formato removido ou ausente: escolha outro formato no Studio antes de continuar." (`src/main/projects.ts` L74; `src/main/content/postnow.ts` L245 e L305); "O formato escolhido foi removido do app; escolha outro formato no Studio." (`src/main/projects.ts` L1001); "… Escolha outro formato para gerar as imagens." (`src/renderer/Studio.tsx` L742); opção "Formato removido: …" (`src/renderer/Studio.tsx` L736) | parcial: `tests/formats.test.ts` L39 e `tests/postnow-round-format.test.ts` L48–49; `projects.ts` L1001 e UI sem teste |
| M06 | Estado da rodada ilegível | "O estado desta rodada está ilegível; gere uma nova rodada com o formato escolhido." (`src/main/content/postnow.ts` L304) | coberta: `tests/postnow-round-format.test.ts` L59; `tests/postnow-render-round.test.ts` L149 |
| M07 | Rodada sem conclusão verificada ou incompleta | "A rodada precisa estar completa e verificada antes da revisão." (`src/main/projects.ts` L1117) e "…antes da aprovação." (L1724); "A rodada ${batch} não tem conclusão verificada para exportação." (L1404); "Esta rodada não tem conclusão verificada; prepare e revise as imagens antes de derivar." (L1488); "Esta rodada não contém todas as imagens exigidas pelo roteiro…" (L1490) | parcial: regex `conclusão verificada` em `tests/project-lifecycle.test.ts` L158 (caminho `projects.bridge`); demais sem teste |
| M08 | Rodada já entregue | "Esta rodada já está pronta e não será sobrescrita." (`src/main/content/postnow.ts` L281) | coberta: `tests/postnow-render-round.test.ts` L130 e L168 |
| M09 | Aprovação editorial ausente ou conteúdo alterado | "A aprovação editorial precisa ser explícita." (`src/main/projects.ts` L1051); "O conteúdo mudou depois da revisão. Recarregue e revise novamente antes de aprovar." (L1054); "Aprove os textos e as fontes antes de preparar as imagens." (`src/renderer/Studio.tsx` L233) | parcial: L1054 em `tests/visual-approval.test.ts` L78; demais sem teste |
| M10 | Chave ElevenLabs inválida ou revogada | "A API key ElevenLabs é inválida ou foi revogada." (`src/main/elevenlabs.ts` L35); demais recusas "A ElevenLabs recusou a operação (HTTP n)." (L40) | coberta para 401: `tests/elevenlabs-key.test.ts`; L40 sem teste |
| M11 | Chave reconhecida sem permissão (401 ou 403 com `missing_permissions`) | "A chave foi reconhecida pela ElevenLabs, mas a operação foi recusada (HTTP …)." seguido de "Verifique as permissões da chave (voices_read para listar vozes; text_to_speech para narrar)." ou "Detalhe da ElevenLabs: …" (`src/main/elevenlabs.ts`, `permissionError`); ressalva "Para narrar, a chave também precisa de text_to_speech." (ADR-023) | coberta: casos 401 e 403 em `tests/elevenlabs-key.test.ts` |
| M12 | Limite de uso (429) | "Limite da ElevenLabs atingido. Aguarde antes de tentar novamente." (`src/main/elevenlabs.ts` L39) | coberta: caso 429 em `tests/elevenlabs-key.test.ts` (adicionado nesta rodada; confirma que a chave não é gravada) |
| M13 | Falha de conexão ou timeout | "Não foi possível contatar a ElevenLabs. Verifique a conexão e tente novamente." e "A ElevenLabs não respondeu a tempo. Tente novamente." (`src/main/elevenlabs.ts` L50) | parcial: ramo de rede (`fetch failed`) em `tests/elevenlabs-key.test.ts`; timeout sem teste |
| M14 | Permissão de microfone negada | "Permissão de microfone negada. Libere o microfone para a Máquina de Conteúdo nas configurações do sistema e tente de novo." (`src/renderer/NarrationTeleprompter.tsx` L219) | sem teste (UI e Electron pendentes) |
| M15 | Microfone ausente, em uso ou ilegível | "Nenhum microfone encontrado. Conecte um microfone e tente de novo." (`NarrationTeleprompter.tsx` L220); "O microfone está em uso por outro aplicativo ou não pôde ser lido." (L221); "Não foi possível acessar o microfone: …" (L222) | sem teste (UI e Electron pendentes) |
| M16 | Gravação vazia ou inválida | "A gravação ficou vazia. Verifique o microfone e grave a cena de novo." (`NarrationTeleprompter.tsx` L127); "A gravação está vazia." (`src/shared/narration.ts` L64); "Gravação inválida: os dados não estão em base64." (L59); "Gravação inválida: envie o tipo e os dados do áudio." (L82) | parcial: `tests/narration-attach.test.ts` L19–21 (regex `base64` ou `vazia`); mensagem do Modo Studio sem teste |
| M17 | Gravação acima de 64 MB | "Gravação acima do limite de 64 MB. Grave um trecho menor." (`src/shared/narration.ts` L56 e L63); "A gravação passa do limite de 64 MB. Grave um trecho menor." (`NarrationTeleprompter.tsx` L128) | coberta para `narration.ts`: `tests/narration-attach.test.ts` L22 (`/64 MB/`); texto do Modo Studio sem teste |
| M18 | Render bloqueado por narração sem áudio aprovado | Mensagens de `src/shared/narration.ts`: L115 (referência órfã; "Envie, grave ou gere…" ou, sem chave, "Envie ou grave…"), L117 (cena sem áudio; sufixo "Sem a chave ElevenLabs, só envio ou gravação." sem chave), L119 (aprovação da cena na prévia) e L121 (ElevenLabs não aprovada; "Configure a chave ElevenLabs…" sem chave); status do Studio em `src/renderer/Studio.tsx` L697 | parcial: `tests/narration-gating.test.ts` L40 (órfã bloqueia), L46 (órfã sem chave, sem "gere"), L57 (ElevenLabs não aprovada sem chave cita "chave ElevenLabs"), L66 (sem áudio sem chave: "chave ElevenLabs" e sem "gere") e L74 (aprovação parcial nomeia a cena pendente). Textos de L115, L117, L119, L121 e Studio L697 não têm asserção. Sufixo sem chave acrescentado nesta rodada (divergência 1) |
| M19 | Falha de geração ou processamento | "A geração ou o processamento não terminou. Consulte o log; os originais existentes foram preservados." (`src/main/agents.ts` L185); "VideoGo não gerou um vídeo MP4 válido no teste local." (`src/main/setup/engines.ts` L232) | sem teste da mensagem. Lacuna: `src/main/agents.ts` L179 grava `error.message` bruto no status da rodada; não reproduzido, não tratado nesta rodada |
| M20 | Exportação sem aprovação, destino inválido ou artefato alterado | "Aprove pelo menos um artefato antes de exportar." (`src/main/projects.ts` L1419 e L1442); "Exporte para fora das pastas de projetos, para preservar os pacotes ao excluir um projeto." (L1421 e L1444); "Exporte para fora da pasta do projeto." (L1422 e L1445); "Escolha uma pasta de destino válida." (L1446); "O artefato mudou durante a exportação: …" (L1432 e L1459); "Arquivo mudou durante a exportação." (`src/main/zip.ts` L158) | sem teste da mensagem (lacuna) |

- Resumo: coberta M06, M08, M10, M11, M12, M17; parcial M04, M05, M07, M09, M13, M16, M18; sem teste M01, M02, M03, M14, M15, M19, M20.
- Limite: testes novos para os itens sem teste ficam fora desta rodada; M14 e M15 exigem Electron e microfone real; M19 tem risco de texto técnico na UI.
