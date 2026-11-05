# Handoff — Máquina de Conteúdo (Studio)

- Updated: 2026-11-05
- Entry: Documentação final de instalação, testes reproduzíveis e limites multiplataforma.
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `README.md`, `DEV/INDEX.md`, `DEV/TESTING.md`, `DEV/VERIFY.md`, `DEV/WORKLOG.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md`
- Verified: typecheck, lint, `npm test` 5/5, smoke, `dist:linux`, DEV gates; AppImage UI project/brand/onboarding and `.deb` update policy passed. Cross-platform builds and native installers remain blocked; test-harness portability is documented.

## Snapshot

**Máquina de Conteúdo (Studio)** é um aplicativo Electron local com PostNow, VideoGo, Maestro, projetos e marcas locais, aprovações por hash, exportação e ponte imagem/vídeo. Os CLIs de IA usam autenticação oficial própria.

## Latest Work

- Versionamento: `package.json` é a fonte SemVer; tags estáveis anotadas `vX.Y.Z` precisam corresponder à versão e iniciam builds nativos; publicação ocorre após sucesso dos três alvos.
- Updater: feed GitHub fixo `FernandoBolzan/maquina-de-conteudo-studio`; instalação sempre requer consentimento; AppImage suporta auto-update Linux, `.deb` segue gerenciador de pacotes.
- Scripts de empacotamento usam `--publish never` para impedir publicação acidental local/CI. Processo completo em `DEV/RUNBOOKS/RELEASES.md`.
- Workflow disparado pela tag `v0.1.0`: todos os builds Linux/Windows/macOS passaram; upload-artifact falhou nos três por `:` em nome (`release-dist:...`). Tag e commit estão no GitHub, release ainda não existe; recuperação via `workflow_dispatch` documentada.
- Carrossel agora valida Pillow e dá orientação acionável; `.deb` bloqueia update in-app e indica o gerenciador de pacotes, enquanto o AppImage preserva o fluxo de update.
- O AppImage foi executado pelo caminho FUSE normal, sem `--no-sandbox`; onboarding e criação de projeto em workspace temporário passaram.
- Tentativas atuais `dist:windows` e `dist:mac` no Linux pararam ao reconstruir `node-pty` (`node-gyp` não faz cross-compiling nativo); wine/xcrun indisponíveis, QEMU sem `/dev/kvm` e sem mídia/disco Windows, sem hosts SSH configurados. Não há instaladores/runtime nativos Windows/macOS. `scripts/smoke.ts` também assume paths Linux de VideoGo/PostNow/Maestro.
- Perfil novo abre um guia de primeira execução com workspace, agente e motores opcionais; configurações antigas sem o campo novo são migradas como já configuradas.
- Codex/Claude consultam a versão estável no npm oficial; instalar/atualizar usa diretório privado, valida antes de ativar, preserva rollback e nunca substitui a instalação global. Ação pede confirmação explícita.
- Não há instalação silenciosa no primeiro lançamento; update dos CLIs é acessível em “Motores & Setup”. Erro de rede não bloqueia o CLI já instalado.

## Recent Entries

- 2026-11-05: Pacotes Linux AppImage/deb e fluxos essenciais exercitados; metadados Debian corrigidos após a falha inicial de empacotamento.
- 2026-11-05: Validado que o aviso de origem não autorizada vinha de uma navegação CDP para um arquivo fora da origem carregada; entrada normal do app funciona sem o aviso.
- 2026-11-05: Onboarding de primeira execução e gerenciamento consentido Codex/Claude com cópia gerenciada, checagem de versão, validação e rollback; todos os gates Linux passaram.

- Next context: código está na `main` (`80cc1e5`) e tag anotada `v0.1.0` foi enviada. A correção do artefato precisa ser publicada na `main`, então execute o workflow manualmente com essa tag; confirmar release/assets antes de afirmar update remoto funcional. Windows/macOS ainda não foram instalados nem validados manualmente.

## Next Action

1. Corrigir `.github/workflows/release.yml` e recuperação em `DEV/RUNBOOKS/RELEASES.md`.
2. Enviar o fix para `main` e disparar `workflow_dispatch` para `v0.1.0`; confirmar os 3 artefatos e metadados `latest*.yml`.
3. Abrir a release pública e verificar instaladores/metadata; não declarar update in-app testado sem executar atualização em uma versão anterior.
4. Manter assinatura/notarização e validação manual de instaladores nativos como pendências.
