# Versionamento, releases e atualização do Studio

## Fonte da versão

- `package.json` é a fonte canônica da versão SemVer (`MAJOR.MINOR.PATCH`); o lockfile npm acompanha essa versão.
- Releases estáveis usam tags Git anotadas `v<versão>`, por exemplo `v0.1.0`, iguais exatamente ao campo `version` do `package.json`.
- Os artefatos usam o template `artifactName: "${name}-${version}-${arch}.${ext}"`; o nome real do binário precisa corresponder ao `url` em `latest*.yml`, pois o updater baixa esse caminho da release.
- Incrementar `PATCH` para correções compatíveis, `MINOR` para funcionalidades compatíveis e `MAJOR` para mudanças incompatíveis. Pré-releases usam sufixos SemVer (por exemplo `1.0.0-rc.1`) e não são publicadas como estáveis por este fluxo.

## Histórico de publicação

- v0.2.0 publicada: primeira release com atualização automática. Conhecido: abas do submenu "Motores & CLIs" e "ElevenLabs & Voz" cortadas em janelas estreitas; corrigido em 0.2.1.
- v0.2.1 publicada: correção das abas do submenu, screenshots e notas com downloads, avisos de instalação, open source e link do curso.
- Antes de distribuir uma versão, repetir typecheck, lint, testes, smoke e build no conteúdo final. O workflow `release.yml` compila Linux, Windows e macOS antes de publicar; a validação dos instaladores em hosts nativos ainda não foi feita.
- Obter autorização explícita antes de criar/enviar commit/tag, iniciar o workflow de publicação ou disponibilizar qualquer artefato publicamente.

## Publicação

1. Atualize `version` em `package.json` e o lockfile com `npm version <patch|minor|major> --no-git-tag-version` (ou versão explícita), revise changelog/notas e valide `npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke` e `npm run build`.
2. Commit a versão validada; crie a tag anotada correspondente: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
3. Envie commit e tag ao GitHub. `.github/workflows/release.yml` confere os builds nativos de Linux, Windows e macOS. A publicação só começa quando os três builds terminam.
4. O job final publica uma release estável no repositório `FernandoBolzan/maquina-de-conteudo-studio`, com notas geradas pelo GitHub e os instaladores/artefatos `latest*.yml` produzidos pelo electron-builder.
5. Confirme na página Releases que os três alvos e metadados de atualização estão anexados. Falha em um build impede a publicação. Antes de publicar, `scripts/verify-release-assets.mjs` confere cada `latest*.yml` contra os arquivos (versão igual à tag, nome, tamanho e sha512); qualquer divergência cancela a publicação, porque um feed errado quebra a atualização de todas as instalações já distribuídas.

O workflow não usa certificado de assinatura de código nem notariza builds; macOS recebe assinatura ad hoc verificada no CI, não uma identidade Developer ID. A distribuição confiável sem avisos do Gatekeeper ainda exige certificados Apple Developer e notarização.

## Descoberta e instalação pelo app

- `electron-updater` consulta a release estável mais recente da API do GitHub, usando o provider fixo configurado em `package.json` e `src/main/electron.ts`; não depende de `MDC_UPDATE_REPOSITORY` nem de servidor `release.json`.
- Os metadados `latest*.yml` e arquivos da release dizem à biblioteca a versão e os artefatos. Não publicar uma release sem esses arquivos.
- Em pacote instalado, o app consulta releases 15 s após abrir e depois a cada 6 h. A nova versão é baixada automaticamente, sem confirmação. Quando termina, Configuração mostra **Reiniciar e atualizar**; se o usuário não reiniciar, a atualização é aplicada ao fechar o app. O restart é recusado enquanto houver tarefas em execução. **Verificar atualização** força uma consulta imediata.
- Em desenvolvimento (`app.isPackaged === false`), a verificação não é disponibilizada.
- Linux: `electron-updater` suporta atualização automática pelo formato AppImage; pacotes `.deb` devem ser atualizados pelo mecanismo/distribuição do sistema. Windows atualiza pelo NSIS sem assinatura (o app só verifica a assinatura se `publisherName` estiver configurado).
- macOS: o build é assinado ad hoc (`identity: "-"`, `hardenedRuntime: false`) para o Gatekeeper tratá-lo como "desenvolvedor não identificado" em vez de "danificado". A atualização automática só liga com Apple Developer ID: o app lê o `TeamIdentifier` com `codesign` ao abrir (`src/main/update-policy.ts`) e, sem ele, não baixa nada e orienta a baixar a versão nova. Ao adotar Developer ID, troque `identity` e reative `hardenedRuntime` com o entitlement `com.apple.security.device.audio-input` e `disable-library-validation`.
- Windows NSIS usa `perMachine: false`: instala por usuário por padrão, sem UAC nas atualizações. O usuário ainda pode escolher a instalação para todos no assistente; essa opção exige administrador e pode pedir UAC durante updates.
- O CI macOS extrai o ZIP, exige que `codesign --verify --deep --strict` passe e confirma `Signature=adhoc` antes de aceitar o artefato.
- VideoGo no Linux exige Node 22. Se Node do sistema faltar ou for antigo, o Studio baixa Node 22 oficial para `appData/runtime/tools/node/managed`, verifica SHA-256 contra `SHASUMS256.txt`, testa a versão antes e depois da ativação e não altera Node global. Só Linux x64/arm64; instalador de fallback usa o `tar` do sistema.

## Recuperação

- A recuperação manual (`workflow_dispatch`) não é build-only: o workflow executa o job `publish` após os builds e uploads; trate-a como publicação pública e obtenha autorização antes de executá-la.
- A execução `42040288628` provou builds nativos da tag `v0.1.0`, mas falhou nos uploads por nomes com `:`. A correção foi validada em `42042527532` (release `v0.1.0`) e o `artifactName` alinhado foi publicado como `v0.1.1` pela run `42045235690`. Os três manifests públicos foram conferidos e seus `url` apontam para nomes de assets existentes. A release v0.1.1 está publicada; builds de CI não substituem instalação/runtime em hosts nativos.
- Se um build falhar antes da publicação, preserve a tag existente. Corrija o workflow na `main`; depois execute manualmente `.github/workflows/release.yml` na branch `main`, informando a tag estável existente (`gh workflow run release.yml --repo FernandoBolzan/maquina-de-conteudo-studio --ref main -f release_tag=vX.Y.Z`). O workflow compila o código dessa tag e valida a versão antes de publicar.
- Se a tag ainda não foi publicada como release e a falha exige alterar o código do produto, não reutilize a versão/tag: publique uma versão SemVer superior.
- Se uma release publicada tiver artefatos inválidos, retire-a da distribuição e publique uma versão corretiva superior. Nunca mova uma tag de release já publicada.
