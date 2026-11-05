# Máquina de Conteúdo (Studio)

Aplicativo desktop local para criar e organizar projetos de conteúdo com PostNow, VideoGo e Orquestrador Maestro. Projetos e marcas ficam no workspace escolhido pelo usuário. Codex e Claude Code usam seus CLIs oficiais e mantêm o login nesses provedores.

## Linux x86_64 — instalação

Os pacotes gerados estão em `release/`:

- AppImage: `maquina-de-conteudo-0.1.1-x86_64.AppImage`
- Debian/Ubuntu: `maquina-de-conteudo-0.1.1-amd64.deb`

Para abrir o AppImage, use o gerenciador de arquivos ou execute na raiz do projeto:

```bash
chmod +x "release/maquina-de-conteudo-0.1.1-x86_64.AppImage"
"./release/maquina-de-conteudo-0.1.1-x86_64.AppImage"
```

O `chmod` só é necessário se o arquivo não estiver marcado como executável.

Em Debian/Ubuntu, instale o `.deb` pelo gerenciador de pacotes ou rode:

```bash
sudo apt install ./release/maquina-de-conteudo-0.1.1-amd64.deb
```

Atualize o `.deb` pelo gerenciador de pacotes do sistema. O AppImage pode verificar atualizações no app e só instala depois de confirmação explícita.

## Primeira execução

1. Escolha o workspace onde ficarão projetos e marcas.
2. Escolha Codex ou Claude Code como assistente padrão; a configuração pode ser alterada depois.
3. Instale apenas os motores locais que quiser usar. A instalação é opcional e pede confirmação.
4. Entre nas contas pelo terminal oficial do CLI. O Studio não pede nem armazena essas senhas.

O diagnóstico do Setup informa os requisitos de cada motor — incluindo Python/Pillow para PostNow e Node.js/FFmpeg/FFprobe para VideoGo — e orienta a correção. Depois de instalar ou vincular um motor, “Testar localmente” executa um render isolado para PostNow/VideoGo ou verifica o contexto local do Maestro. É necessário confirmar; arquivos temporários são removidos, não há voz paga nem chamada de modelo. A tela Preferências mostra a última consulta de atualização e destaca uma nova versão sem interromper o trabalho; baixar/instalar continua exigindo confirmação.

## Narração e vozes ElevenLabs

Em **Preferências → ElevenLabs para VideoGo**, valide e salve uma API key com acesso equivalente à leitura de vozes, Text to Speech e gerenciamento/clonagem de vozes. O Studio guarda a chave cifrada pelo cofre do sistema (Electron `safeStorage`); se o cofre não estiver disponível, o app bloqueia o salvamento e não usa texto puro.

No estúdio de um projeto de vídeo:

1. Escolha uma voz da conta — incluindo clones já existentes — e revise a narração editorial e o `spokenText` de cada cena.
2. Use tags de áudio Eleven v4 (`[excited]`, `[whispers]`) e IPA inline entre barras (`/…/`) para pronúncias difíceis. Não use SSML; o VideoGo confere que as palavras faladas correspondem ao texto editorial.
3. Salve e aprove explicitamente texto, voz, tags e fonética. Qualquer mudança invalida a aprovação.
4. Confirme a geração paga Eleven v4. Os áudios são criados por cena no workspace; revise a prévia e aprove cada clipe antes de renderizar o vídeo final.

Para clonar voz, habilite gerenciamento de vozes, confirme que a voz é sua ou que há autorização expressa, escolha uma amostra limpa e aceite o envio direto à ElevenLabs. A amostra é validada com FFprobe e não fica armazenada pelo Studio. Clone removido na ElevenLabs não apaga áudios já gerados localmente. Consumo de créditos, elegibilidade e retenção remota seguem a conta/termos ElevenLabs.

## Desenvolvimento e verificação

Requer Node.js e npm compatíveis com o `package-lock.json` (CI usa Node.js 22).

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
npm start
```

Empacotamento local:

```bash
npm run dist:linux    # Linux: AppImage e .deb
npm run dist:windows  # Windows nativo: instalador NSIS
npm run dist:mac      # macOS nativo: DMG e ZIP
```

Esses scripts usam `--publish never`; não publicam uma release. Consulte [`DEV/TESTING.md`](DEV/TESTING.md) para a matriz de testes e [`DEV/RUNBOOKS/RELEASES.md`](DEV/RUNBOOKS/RELEASES.md) para versionamento, releases e atualizações.

## Estado de validação por plataforma

| Plataforma | Artefatos | Estado verificado |
|---|---|---|
| Linux x86_64 | AppImage e `.deb` | v0.1.1 disponível na release pública. AppImage local aberto em workspace descartável; Preferências, criação de projeto VideoGo e bloqueios de narração sem key/voz verificados. Consulta de atualização informou que 0.1.1 é atual. `.deb` teve metadados conferidos, mas não foi instalado com `apt`. |
| Windows x64 | Instalador NSIS (`.exe`) | v0.1.1 publicado; feed `latest.yml` aponta para `maquina-de-conteudo-0.1.1-x64.exe`. Instalação e fluxos de usuário ainda não foram executados em Windows nativo. |
| macOS arm64 | DMG e ZIP | v0.1.1 publicado; feed `latest-mac.yml` aponta para artefatos `arm64`. Instalação e fluxos ainda não foram executados em macOS nativo; não há asset Intel/x64. |

A release pública [`v0.1.1`](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/tag/v0.1.1) foi publicada pelo Actions run [`42045235690`](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/actions/runs/42045235690). Os feeds Linux, Windows e macOS foram lidos e os nomes conferem com os assets. No AppImage local, a consulta informou que a versão instalada é a atual; não houve download/instalação de update. Builds de CI não substituem validação de instalação e runtime em cada host nativo; assinatura/notarização também não foram verificadas.

## Limites dos testes

`npm test` executa sete testes determinísticos; runtime usa FFmpeg para fixtures e cria symlink. No Windows, instale FFmpeg e habilite criação de symlink (Developer Mode ou privilégios adequados).

`npm run smoke` usa workspace temporário, gera arquivos com FFmpeg, testa conversões e PTY, e remove os dados ao terminar. Caminhos podem ser configurados:
```bash
MDC_SMOKE_POSTNOW="/caminho/PostNow" \
MDC_SMOKE_VIDEOGO="/caminho/VideoGo" \
MDC_SMOKE_MAESTRO="/caminho/orquestrador-maestro-cli" \
npm run smoke
```
Sem override, PostNow/VideoGo usam os diretórios irmãos. Maestro usa o caminho Linux `/usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli` somente no Linux; Windows/macOS precisam configurar `MDC_SMOKE_MAESTRO`. Smoke nativo ainda não foi executado.
