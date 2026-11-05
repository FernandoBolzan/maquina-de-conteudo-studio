# Handoff — Máquina de Conteúdo (Studio)

- Updated: 2026-11-05
- Entry: Onboarding inicial e ciclo seguro de versões do Codex/Claude.
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/shared/contracts.ts`, `src/main/runtime.ts`, `src/main/setup.ts`, `src/main/setup/tools.ts`, `src/renderer/App.tsx`, `src/renderer/Setup.tsx`, `src/renderer/styles.css`, `tests/**`, `DEV/**`
- Verified: typecheck, lint, `npm test` 5/5, smoke, `dist:linux`, DEV gates; AppImage atual abre e onboarding/projeto/marca/Setup passaram em workspace isolado, sem erros do renderer. Atualização `.deb` verificada no binário empacotado.

## Snapshot

**Máquina de Conteúdo (Studio)** é um aplicativo Electron local com PostNow, VideoGo, Maestro, projetos e marcas locais, aprovações por hash, exportação e ponte imagem/vídeo. Os CLIs de IA usam autenticação oficial própria.

## Latest Work

- Versionamento: `package.json` é a fonte SemVer; tags estáveis anotadas `vX.Y.Z` precisam corresponder à versão e iniciam builds nativos; publicação ocorre após sucesso dos três alvos.
- Updater: feed GitHub fixo `FernandoBolzan/maquina-de-conteudo-studio`; instalação sempre requer consentimento; AppImage suporta auto-update Linux, `.deb` segue gerenciador de pacotes.
- Scripts de empacotamento usam `--publish never` para impedir publicação acidental local/CI. Processo completo em `DEV/RUNBOOKS/RELEASES.md`.
- Workflow GitHub não foi executado e a API pública do repositório não mostra releases; nenhum tag/release foi publicado nesta sessão.
- Carrossel agora valida Pillow e dá orientação acionável; `.deb` bloqueia update in-app e indica o gerenciador de pacotes, enquanto o AppImage preserva o fluxo de update.
- O AppImage foi executado pelo caminho FUSE normal, sem `--no-sandbox`; onboarding e criação de projeto em workspace temporário passaram.
- Tentativas atuais `dist:windows` e `dist:mac` no Linux pararam ao reconstruir `node-pty` (`node-gyp` não faz cross-compiling nativo); wine/xcrun indisponíveis, QEMU sem `/dev/kvm` e sem mídia/disco Windows, sem hosts SSH configurados. Não há instaladores/runtime nativos Windows/macOS.
- Perfil novo abre um guia de primeira execução com workspace, agente e motores opcionais; configurações antigas sem o campo novo são migradas como já configuradas.
- Codex/Claude consultam a versão estável no npm oficial; instalar/atualizar usa diretório privado, valida antes de ativar, preserva rollback e nunca substitui a instalação global. Ação pede confirmação explícita.
- Não há instalação silenciosa no primeiro lançamento; update dos CLIs é acessível em “Motores & Setup”. Erro de rede não bloqueia o CLI já instalado.

## Recent Entries

- 2026-11-05: Pacotes Linux AppImage/deb e fluxos essenciais exercitados; metadados Debian corrigidos após a falha inicial de empacotamento.
- 2026-11-05: Validado que o aviso de origem não autorizada vinha de uma navegação CDP para um arquivo fora da origem carregada; entrada normal do app funciona sem o aviso.
- 2026-11-05: Onboarding de primeira execução e gerenciamento consentido Codex/Claude com cópia gerenciada, checagem de versão, validação e rollback; todos os gates Linux passaram.

- Next context: Linux x86_64 está empacotado e verificado; o objetivo Windows/macOS permanece bloqueado até executar builds, instalação e smoke nos respectivos hosts nativos. Nenhuma release/tag remota foi publicada.

## Next Action

1. Consultar `DEV/RUNBOOKS/RELEASES.md` para atualizar `package.json`/lockfile e preparar uma tag estável somente quando autorizado.
2. Após uma tag autorizada, revisar builds/artifacts e update metadata na release GitHub; testar autoatualização em AppImage e instaladores nativos.
3. Manter validação nativa Windows/macOS e assinatura/notarização pendentes até executá-las nos hosts apropriados.
4. O app normal está aberto via `npm start` após recuperação de Xwayland; se encerrar, reabra em sessão gráfica ativa.
