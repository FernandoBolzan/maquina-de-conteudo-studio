# Handoff — Máquina de Conteúdo (Studio)

- Updated: 2026-11-05
- Entry: integração Studio ↔ VideoGo/ElevenLabs v4, clonagem consentida e aprovação hash-bound de áudio; configuração de voz está em Motores & Setup.
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/elevenlabs.ts`, `src/main/runtime.ts`, `src/main/projects.ts`, `src/shared/contracts.ts`, `src/renderer/Setup.tsx`, `src/renderer/VideoGoVoiceSetup.tsx`, `src/renderer/Studio.tsx`, testes, README e `DEV/**`; prompt completo em `DEV/WORKFLOWS/PROMPT-ADAPTACAO-ELEVENLABS-VIDEOGO.md`.
- Verified: Studio typecheck, lint, 7/7 tests, smoke, build e Chromium preview: configuração em Motores & Setup, removida de Preferências; viewport 390 px sem overflow ou erros. VideoGo typecheck, 49/49 core, 20/20 flicker, E2E áudio externo e build passaram anteriormente. Nenhuma chamada paga ou clonagem real.


## Snapshot

**Máquina de Conteúdo (Studio)** é um aplicativo Electron local com PostNow, VideoGo, Maestro, projetos e marcas locais, aprovações por hash, exportação e ponte imagem/vídeo. Os CLIs de IA usam autenticação oficial própria.

## Latest Work

- Versionamento: `package.json` é a fonte SemVer; tags estáveis anotadas `vX.Y.Z` precisam corresponder à versão e iniciam builds nativos; publicação ocorre após sucesso dos três alvos.
- Updater: feed GitHub fixo `FernandoBolzan/maquina-de-conteudo-studio`; instalação sempre requer consentimento; AppImage suporta auto-update Linux, `.deb` segue gerenciador de pacotes.
- Scripts de empacotamento usam `--publish never` para impedir publicação acidental local/CI. Processo completo em `DEV/RUNBOOKS/RELEASES.md`.
- Release `v0.1.0` permanece pública e imutável. `v0.1.1` foi publicada após alinhar `artifactName` com os nomes referenciados por `latest*.yml`; GitHub Actions concluiu Linux, Windows e macOS.
- A release `v0.1.1` fornece `latest-linux.yml`, `latest-mac.yml`, `latest.yml` e assets com nomes coerentes. Os três manifests públicos foram lidos e seus caminhos correspondem aos assets publicados.
- `scripts/smoke.ts` aceita `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`; smoke padrão e configurado passaram no Linux. Windows/macOS têm instaladores publicados, mas ainda sem smoke, instalação ou fluxo nativo.
- Perfil novo abre um guia de primeira execução com workspace, agente e motores opcionais; configurações antigas sem o campo novo são migradas como já configuradas.
- Codex/Claude consultam a versão estável no npm oficial; instalar/atualizar usa diretório privado, valida antes de ativar, preserva rollback e nunca substitui a instalação global. Ação pede confirmação explícita.
- Não há instalação silenciosa no primeiro lançamento; update dos CLIs é acessível em “Motores & Setup”. Erro de rede não bloqueia o CLI já instalado.
- Motores mostram dependências e orientação para corrigir versão ausente/incompatível; PostNow verifica Python/Pillow no mesmo runtime do render, VideoGo inclui FFmpeg/FFprobe.
- Teste local pede confirmação, usa área temporária descartável; VideoGo renderiza em silêncio, PostNow gera PNG e Maestro valida contexto sem IA. Nenhum projeto real é alterado.
- Preferências mantém a data da última consulta e exibe disponibilidade inline; baixar/instalar segue consentido. O teste do estado disponível usou resposta IPC simulada, não feed remoto.

## Recent Entries
- 2026-11-05: Setup ElevenLabs movido de Preferências para Motores & Setup, sob a seção de motores de conteúdo; Preferências agora fica restrita ao workspace, agente e atualização.

- 2026-11-05: QA final do AppImage 0.1.1 em workspace descartável; projeto VideoGo e bloqueios de narração sem key/voz observados. Update checker retornou versão atual; sem download.
- 2026-11-05: typecheck, lint, 7/7 testes, smoke default/overrides, build, `dist:linux` e `check-dev-gates --strict` passaram.
- 2026-11-05: release `v0.1.1` pública; Actions run `42045235690` concluiu Linux, Windows e macOS. Feeds apontam para assets publicados; macOS arm64 é o único alvo publicado.
- 2026-11-05: diagnósticos por motor, smoke local consentido, verificação de Pillow e aviso/data de atualização exercitados. PostNow sem Pillow no ambiente selecionado; render PostNow não executado.
- 2026-11-05: pacote Linux AppImage/deb e fluxos essenciais exercitados; metadata Debian conferido, sem `apt install`.
- 2026-11-05: aviso de origem não autorizada reproduzido por navegação CDP para arquivo fora da origem; entrada normal do app funciona sem aviso. Nenhum workspace real foi modificado.
- 2026-11-05: onboarding e gestão consentida Codex/Claude com cópia gerenciada, checagem de versão, validação e rollback passaram nos testes offline.

- Next context: `v0.1.1` está publicada; feeds correspondem aos assets. Build de CI não comprova runtime nativo: ainda instalar/testar em Windows e macOS arm64, validar permissões/PTY/diálogos, e definir assinatura/notarização. macOS Intel não tem artefato. Release não precisa ser republicada para essas validações.

## Next Action

- Next action: executar instaladores v0.1.1 em hosts Windows e macOS arm64 nativos, validar fluxos e documentar evidências; assinatura/notarização e macOS Intel permanecem separados.
