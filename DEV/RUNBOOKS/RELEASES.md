# Versionamento, releases e atualização do Studio

## Fonte da versão

- `package.json` é a fonte canônica da versão SemVer (`MAJOR.MINOR.PATCH`); o lockfile npm acompanha essa versão.
- Releases estáveis usam tags Git anotadas `v<versão>`, por exemplo `v0.1.0`, iguais exatamente ao campo `version` do `package.json`.
- Os artefatos usam o template `artifactName: "${name}-${version}-${arch}.${ext}"`; o nome real do binário precisa corresponder ao `url` em `latest*.yml`, pois o updater baixa esse caminho da release.
- Incrementar `PATCH` para correções compatíveis, `MINOR` para funcionalidades compatíveis e `MAJOR` para mudanças incompatíveis. Pré-releases usam sufixos SemVer (por exemplo `1.0.0-rc.1`) e não são publicadas como estáveis por este fluxo.

## Publicação

1. Atualize `version` em `package.json` e o lockfile com `npm version <patch|minor|major> --no-git-tag-version` (ou versão explícita), revise changelog/notas e valide `npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke` e `npm run build`.
2. Commit a versão validada; crie a tag anotada correspondente: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
3. Envie commit e tag ao GitHub. `.github/workflows/release.yml` confere os builds nativos de Linux, Windows e macOS. A publicação só começa quando os três builds terminam.
4. O job final publica uma release estável no repositório `FernandoBolzan/maquina-de-conteudo-studio`, com notas geradas pelo GitHub e os instaladores/artefatos `latest*.yml` produzidos pelo electron-builder.
5. Confirme na página Releases que os três alvos e metadados de atualização estão anexados. Falha em um build impede a publicação.

O workflow não assina/notariza binários. Assinatura e validação nativa de cada sistema permanecem responsabilidade do mantenedor; macOS pode exigir identidade/notarização para distribuição confiável.

## Descoberta e instalação pelo app

- `electron-updater` consulta a release estável mais recente da API do GitHub, usando o provider fixo configurado em `package.json` e `src/main/electron.ts`; não depende de `MDC_UPDATE_REPOSITORY` nem de servidor `release.json`.
- Os metadados `latest*.yml` e arquivos da release dizem à biblioteca a versão e os artefatos. Não publicar uma release sem esses arquivos.
- Em pacote instalado, a tela Configuração permite **Verificar atualização**; o usuário vê a versão disponível e escolhe **Baixar e instalar**. O download só ocorre após confirmação explícita e sem tarefas ativas; o app reinicia para aplicar. O updater não baixa nem instala automaticamente.
- Em desenvolvimento (`app.isPackaged === false`), a verificação não é disponibilizada.
- Linux: `electron-updater` suporta atualização automática pelo formato AppImage; pacotes `.deb` devem ser atualizados pelo mecanismo/distribuição do sistema. macOS/Windows precisam manter os artefatos e pré-requisitos de assinatura apropriados para instalação confiável.

## Recuperação

- A recuperação manual (`workflow_dispatch`) não é build-only: o workflow executa o job `publish` após os builds e uploads; trate-a como publicação pública e obtenha autorização antes de executá-la.
- A execução `42040288628` provou builds nativos da tag `v0.1.0`, mas falhou nos uploads por nomes com `:`. A correção foi validada em `42042527532` (release `v0.1.0`) e o `artifactName` alinhado foi publicado como `v0.1.1` pela run `42045235690`. Os três manifests públicos foram conferidos e seus `url` apontam para nomes de assets existentes. A release v0.1.1 está publicada; builds de CI não substituem instalação/runtime em hosts nativos.
- Se um build falhar antes da publicação, preserve a tag existente. Corrija o workflow na `main`; depois execute manualmente `.github/workflows/release.yml` na branch `main`, informando a tag estável existente (`gh workflow run release.yml --repo FernandoBolzan/maquina-de-conteudo-studio --ref main -f release_tag=vX.Y.Z`). O workflow compila o código dessa tag e valida a versão antes de publicar.
- Se a tag ainda não foi publicada como release e a falha exige alterar o código do produto, não reutilize a versão/tag: publique uma versão SemVer superior.
- Se uma release publicada tiver artefatos inválidos, retire-a da distribuição e publique uma versão corretiva superior. Nunca mova uma tag de release já publicada.
