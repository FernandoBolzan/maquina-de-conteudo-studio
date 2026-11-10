# Máquina de Conteúdo (Studio)

**Última release pública: v0.2.1** · [Baixar para seu sistema](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/tag/v0.2.1) · [Ver todas as releases](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases)

Aplicativo desktop para organizar e produzir conteúdo de imagem e vídeo em um workspace local. Reúne projetos, marcas, assistentes por CLI, motores criativos locais, revisão humana, exportação e ponte entre fluxos de imagem e vídeo.

O Studio é construído com Electron, React e TypeScript. Ele orquestra os motores **PostNow**, **VideoGo** e **Orquestrador Maestro**; Codex e Claude Code são executados por seus CLIs oficiais. O Studio não é um serviço SaaS nem armazena projetos em uma nuvem própria.

> **Open source e curso:** este repositório é público. O Studio faz parte do curso [Máquina de Conteúdo](https://www.fernandobolzan.com/maquina-de-conteudo). A licença ainda não foi definida e o repositório não tem arquivo `LICENSE`.

## Novidades desde a v0.1.1

- Criação guiada mantém PostNow (imagem/carrossel) e VideoGo (vídeo) em trilhas distintas; o assunto sugere um nome editável e o template revisado segue para o composer sem iniciar o agente.
- O Studio apresenta roteiros VideoGo em rascunho e permite revisá-los por cena antes da aprovação explícita. A narração é organizada por cena: use gravação no Modo Studio, arquivo próprio, Piper local ou ElevenLabs. O modo sem narração permite testar o vídeo sem apagar os áudios, para retomá-los depois.
- Na revisão de vídeo aparecem apenas renders em `renders/review` ou `renders/final`; fotos e outros arquivos de trabalho não são exibidos. No modo narrado, o FFprobe confirma a presença de áudio antes de mostrar um vídeo; no modo sem narração, renders sem áudio também podem ser revisados.
- Motores & Setup explica permissões mínimas da API key e o preparo/consentimento da amostra de clonagem; a lista oferece controles de reprodução para as vozes com prévia fornecida pela ElevenLabs.
- Em **Motores & Setup**, o Studio exibe o nome da conta conectada no GitHub CLI, OpenAI Codex e Claude Code. Quando logado, estão disponíveis as ações de **Desconectar** (remove as credenciais salvas sem desinstalar o CLI) e **Trocar conta** (desconecta a sessão atual e abre o fluxo oficial de login para entrar com outra conta).
- **Geração com progresso ao vivo:** atividade do agente e cronômetro aparecem na etapa de geração. A etapa Textos mostra headline, copy, fontes e quem aparece na arte, sem prompts. Referências da marca entram como imagens de entrada do ImageGen na geração e na correção. 1:1 fecha quando o ImageGen entrega quadrado; 4:3 e 9:16 só fecham quando a saída já está na proporção, ou quase; saídas mais distantes são recusadas e a rodada falha. O formato 4:5 foi removido do app; projetos antigos em 4:5 abrem pedindo a escolha de outro formato.
- **Troca de formato:** ao mudar o formato na etapa de imagens, confirme a sessão de IA para adaptar os textos já existentes. O Studio preserva o conteúdo anterior, volta para Textos e exige nova revisão e aprovação antes de gerar imagens. Se a adaptação falhar ou for interrompida, use a opção de tentar novamente; uma nova adaptação para carrossel usa cinco páginas quando o formato anterior não tinha uma quantidade compatível.
- **Quem aparece na arte:** Ninguém, Outra pessoa ou Cliente (retrato aprovado). Com retrato aprovado no perfil PostNow, capa, última página de carrossel e post ou Story de página única precisam mostrar a cliente; escolher Cliente sem retrato é recusado antes do motor. O Studio não cadastra o retrato: use `postnow client set-portrait <client_id> --image references/<arquivo>`.
- Windows/macOS nativos, chamada paga e clonagem real ainda precisam de validação. A atualização automática de 0.2.0 para 0.2.1 ainda não foi observada em instalador real.

## Downloads — v0.2.1

Os links abaixo apontam para os arquivos anexados à [release v0.2.1](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/tag/v0.2.1). Confira sistema e arquitetura antes de baixar.

| Sistema | Arquivo | Download |
|---|---|---|
| Linux x86_64 | AppImage | [maquina-de-conteudo-0.2.1-x86_64.AppImage](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.2.1/maquina-de-conteudo-0.2.1-x86_64.AppImage) |
| Debian/Ubuntu x86_64 | Pacote `.deb` | [maquina-de-conteudo-0.2.1-amd64.deb](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.2.1/maquina-de-conteudo-0.2.1-amd64.deb) |
| Windows x64 | Instalador NSIS `.exe` | [maquina-de-conteudo-0.2.1-x64.exe](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.2.1/maquina-de-conteudo-0.2.1-x64.exe) |
| macOS Apple Silicon (arm64) | Imagem `.dmg` | [maquina-de-conteudo-0.2.1-arm64.dmg](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.2.1/maquina-de-conteudo-0.2.1-arm64.dmg) |
| macOS Apple Silicon (arm64) | Arquivo `.zip` | [maquina-de-conteudo-0.2.1-arm64.zip](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.2.1/maquina-de-conteudo-0.2.1-arm64.zip) |

> A release contém Linux x86_64, Windows x64 e macOS arm64. Não há instalador Linux ARM64 nem macOS Intel/x64. Os builds foram gerados pelo GitHub Actions e não foram instalados em hosts Windows ou macOS nativos. Avisos: o Windows mostra SmartScreen (**Mais informações > Executar assim mesmo**); o macOS pede **Ajustes do Sistema > Privacidade e Segurança > Abrir mesmo assim** porque o app não é assinado nem notarizado; o `.deb` precisa ser instalado manualmente a cada versão.

## O que o Studio faz

- **Organiza projetos e marcas** em um workspace escolhido por você, separado dos diretórios dos motores.
- Novos projetos e importações usam uma pasta legível derivada do título (acentos removidos, palavras separadas por hífen); nomes repetidos recebem sufixos numéricos sem sobrescrever arquivos. O UUID interno continua identificando o projeto, e o VideoGo recebe o slug no `storyboard.id` e o título em `storyboard.title`. Projetos já existentes mantêm seus caminhos.
- **Escolhe o formato antes de gerar:** story 9:16 (1080×1920), feed 1:1 (1080×1080) e 4:3 (1440×1080), como imagem única ou carrossel de 3 a 10 páginas; o formato 4:5 foi removido. Com o Codex ImageGen, 1:1, 4:3 e 9:16 fecham com recorte centralizado de até 3% por lado; saídas mais distantes são recusadas e a rodada falha (`DEV/DECISIONS.md`, pendência 1). O formato pode ser trocado na etapa de imagens: regerar com outro formato refaz a rodada inteira. Projetos antigos em 4:5 abrem pedindo a escolha de outro formato.
- **Prepara conteúdo visual no PostNow:** após você aprovar headline, copy e fontes, o Codex gera os originais e o PostNow valida as páginas, ajusta o formato, aplica a logo oficial e prepara a folha de contato. Cada rodada fica separada; originais são preservados. A arte gerada é conformada ao formato final: se a proporção difere, o PostNow faz recorte centralizado de até 3% por lado e redimensiona; recorte maior é recusado e a rodada falha, sem arte final. Uma rodada incompleta é marcada como falha, não como concluída. Também aceita várias imagens importadas de uma vez; não há arte sintética de fallback.
- **Cria vídeos com VideoGo:** briefing, storyboard, cenas, arquivos do projeto e renderização local de vídeo.
- **Entrega de vídeo:** em Entregar, escolha YouTube (16:9), Reels/Story (9:16) ou feed quadrado (1:1) e confirme a geração de copy e capa pelo Codex. O processo pode consumir créditos e usa FFmpeg/FFprobe para validar e ajustar a imagem com recorte centralizado; revise o enquadramento e aprove cada arquivo antes de exportar. Regerar um formato substitui seus arquivos anteriores e invalida suas aprovações.
- **Acompanha projetos:** a biblioteca separa as trilhas de criação dos projetos, mostra a quantidade correspondente ao filtro e destaca as capas. O cartão mostra “Processando” enquanto houver tarefa ativa e usa a primeira imagem da rodada pronta ou uma capa de vídeo gerada quando disponível. No Studio, a etapa ativa fica destacada e as demais permanecem visíveis conforme sua disponibilidade.
- **Usa assistentes de IA por CLI:** escolha Codex ou Claude Code e mantenha a autenticação no CLI oficial do provedor.
- **Revisa e aprova resultados:** aprovações são vinculadas ao conteúdo por hash; exportações verificadas incluem `MANIFEST.json`.
- **Conecta imagem e vídeo sem misturar motores:** a conversão de carrossel cria um projeto VideoGo, mas não o renderiza; vídeo→imagem extrai um quadro com FFmpeg para servir de entrada, sem alegar geração de arte.
- **Reutiliza ou exclui projetos:** “Usar como base” cria outro projeto com briefing, marca e notas, sem copiar mídias nem aprovações. A exclusão pede o nome exato e mostra o inventário; marcas, vozes, exportações externas e cópias nativas antigas sem identificação comprovada são preservadas.
- **Prepara os motores:** em Motores & Setup, instale, atualize, vincule ou teste cada motor. A instalação também prepara os requisitos necessários e pode solicitar autorização administrativa do sistema.
- **Inclui Maestro:** valida o contexto local sem chamar um modelo nos testes de contexto.
- **Integração ElevenLabs (branch `main`, ainda não publicada):** configuração segura da key, vozes, clonagem consentida, narração por cena, síntese paga e aprovação de cada clipe. Também aceita áudio próprio por cena, enviado ou gravado no Modo Studio. Não está incluída nos instaladores v0.1.1.

## Fluxo de uso

1. Na primeira execução, escolha o que quer produzir primeiro: imagens/carrossel no **PostNow** ou vídeo no **VideoGo**. Configure o agente e o motor dessa trilha; a ElevenLabs é opcional e só atende à voz do VideoGo.
2. Em **Motores & Setup**, instale ou vincule apenas as ferramentas que pretende usar. Instalações, testes locais e logins pedem confirmação.
3. Em **Projetos → Criar conteúdo**, escolha explicitamente **PostNow** ou **VideoGo**. Informe o assunto; o Studio sugere um nome legível para o projeto e a pasta, que você pode editar.
4. Selecione um modelo da biblioteca (incluindo seus prompts favoritos e pessoais), revise o briefing e o pedido completo. Criar o projeto não inicia o agente.
5. O agente prepara conteúdo; no PostNow, revise a headline, a copy e as fontes na etapa **Textos** e aprove-as antes de gerar imagens. Os prompts das artes ficam internos e não aparecem nessa etapa. Codex ImageGen cria PNGs e recebe as referências de marca em PNG, JPG/JPEG ou WebP (até 10) como imagens de entrada, na geração e na correção (Refazer); PDFs, SVG, GIF, AVIF e arquivos além do limite seguem apenas como texto no contexto da geração. O PostNow aplica a logo e fecha o formato final: redimensiona e, se a proporção difere, faz recorte centralizado de até 3% por lado. No VideoGo, o motor renderiza somente quando você inicia a ação. Conversões criam projetos independentes; imagens nunca iniciam vídeo automaticamente.
   Em projeto de imagem, salvar uma pauta nova sem textos gravados já inicia essa preparação, sem diálogo de confirmação; com algum texto gravado, o disparo automático não roda.
6. Para fala no VideoGo, configure **Motores & Setup → Voz e narração do VideoGo**. Revise e aprove narração/voz; só então o Studio oferece a geração Eleven v4, que pode consumir créditos. Aprove cada clipe antes do render final. A voz não é obrigatória para renderizar: sem voz, anexe ou grave o áudio próprio de cada cena e aprove antes do render. Se a versão instalada do VideoGo não oferecer geração de áudio pela CLI, atualize o motor antes da síntese.

O Studio não autentica você nos provedores de IA. Faça login pelo terminal do Codex ou Claude Code, conforme a ferramenta escolhida; as credenciais permanecem sob gestão dos CLIs oficiais.

## Instalação dos downloads v0.1.1

### Linux x86_64 — AppImage

Baixe o AppImage, abra pelo gerenciador de arquivos ou execute no terminal:

```bash
chmod +x maquina-de-conteudo-0.1.1-x86_64.AppImage
./maquina-de-conteudo-0.1.1-x86_64.AppImage
```

O `chmod` só é necessário se o arquivo não estiver marcado como executável.

### Debian/Ubuntu x86_64 — `.deb`

Baixe o pacote e, no diretório do arquivo, instale com:

```bash
sudo apt install ./maquina-de-conteudo-0.1.1-amd64.deb
```

Depois, atualize-o pelo gerenciador de pacotes do sistema. O `.deb` não usa a instalação automática de atualização do app.

### Windows x64 — instalador `.exe`

Baixe e execute o instalador NSIS; siga o assistente e escolha o diretório de instalação se desejar. A release atual não foi instalada nem exercitada em Windows nativo. Os binários não foram assinados; o Windows pode exibir avisos de segurança.

### macOS Apple Silicon — `.dmg` ou `.zip`

Baixe o `.dmg` ou `.zip` arm64 e siga o fluxo de instalação do macOS. A release atual não foi instalada nem exercitada em um Mac nativo e não foi notarizada pela Apple; o macOS pode exibir avisos de segurança. Não há build para Macs Intel nesta versão.

## Requisitos dos motores

O aplicativo pode abrir sem que todos os motores estejam instalados. Em **Motores & Setup**, instale apenas os que você usará. A instalação prepara também as dependências necessárias; erros e pedidos de autorização são informados durante o processo.

| Componente | Para que serve | Requisitos principais |
|---|---|---|
| PostNow | Projetos nativos, aplicação da identidade e preparo de artes existentes | Python e Pillow; imagem/carrossel precisa de artes geradas por ferramenta real ou importadas (o CLI PostNow não é gerador de imagem) |
| VideoGo | Projetos, renderização de vídeo e transcrição local com faster-whisper | Node.js 22+, FFmpeg, FFprobe e Python 3.11+ |
| Orquestrador Maestro | Contexto e orquestração local | Node.js/npm e CLI Maestro |
| Codex / Claude Code | Assistência por IA no projeto | CLI oficial instalado e autenticado na conta correspondente |
| ElevenLabs (branch `main`, não no v0.1.1) | Vozes, clonagem consentida e áudio por cena | API key com permissões de vozes, Text to Speech e gestão de vozes; cofre seguro do sistema operacional |

VideoGo e PostNow são repositórios privados. Quando o GitHub confirmar que a conta conectada não tem acesso, o Studio oferece o botão **Adquirir agora** para abrir a página do curso. Falhas de conexão e de autenticação são tratadas separadamente. As versões e dependências concretas podem variar por motor; a instalação pode exigir autorização administrativa.

## Narração, vozes e ElevenLabs — código da branch `main`

Esta integração ainda não está nos instaladores públicos v0.1.1. No código atual da branch [`main`](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/tree/main), ela atende apenas a projetos VideoGo. Configure em **Motores & Setup → Voz e narração do VideoGo**:

1. Crie uma API key no painel da ElevenLabs e habilite o mínimo necessário: `voices_read` para consultar/selecionar vozes; `text_to_speech` para sintetizar fala; e, para clonar/remover clones, `voices_write` e `create_instant_voice_clone`. Os nomes e escopos disponíveis podem variar conforme a conta; consulte a [documentação oficial de permissões](https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create). Não use permissão “all”; defina limite mensal de caracteres e expiração se a conta oferecer esses controles.
2. Cole a key em Motores & Setup. O Studio testa a listagem de vozes e guarda a chave no cofre seguro do sistema; essa validação não gera áudio nem confirma permissões de TTS/clonagem. 401 sem detalhe de permissão recusa a chave e não salva; 401 ou 403 com detalhe de permissão salva com aviso de chave restrita ("Para narrar, a chave também precisa de text_to_speech."); limite atingido (429) e falha de conexão têm mensagem própria.
3. No projeto VideoGo, selecione uma voz e revise a narração editorial e o `spokenText` de cada cena. Use tags Eleven v4, como `[excited]` e `[whispers]`, e IPA entre barras apenas para termos cuja pronúncia precise de correção. O fluxo não usa SSML e verifica a correspondência entre o texto editorial e o falado.
4. Salve e aprove explicitamente o texto e a voz. Qualquer alteração invalida a aprovação. Só então confirme a síntese paga Eleven v4; ouça e aprove o áudio de cada cena na própria etapa de narração antes de renderizar o vídeo.

A transcrição de áudio e o alinhamento de legendas com tempo são executados localmente pelo VideoGo com `faster-whisper` (gratuito e offline, sem chamadas externas). O aviso eventual sobre `OPENAI_API_KEY` exibido no console do VideoGo refere-se apenas a um fallback legado do módulo de clipes externos e não afeta a transcrição nem a geração de narração pela ElevenLabs.

No Linux com COSMIC, o Studio usa o Secret Service do sistema para proteger a chave. O keyring precisa estar instalado e desbloqueado; sem um cofre seguro disponível, a chave não é salva em texto puro.

Para voz IA local, instale o executável Piper e disponibilize-o no `PATH` do aplicativo. Selecione um modelo de voz `.onnx` local com seu arquivo de configuração `.onnx.json` ao lado. A síntese ocorre no computador, sem chamada à ElevenLabs; o Studio não baixa o modelo automaticamente. Revise e aprove cada áudio antes de renderizar.

No projeto de vídeo, escolha **sem narração** para testar sem incluir os áudios já preparados. A escolha preserva os arquivos e pode ser revertida para usar narração novamente.

No Modo Studio, ao salvar uma gravação, o aplicativo avança para a próxima cena com narração ainda sem áudio. Ao terminar, revise e aprove os áudios; se um salvamento falhar, a cena permanece aberta.

Para clonar uma voz, habilite as permissões de Instant Voice Cloning, confirme que a voz é sua ou que tem autorização expressa e escolha uma amostra. Como referência de qualidade, grave 2–5 minutos de fala natural, com uma pessoa, sem música, ruído ou clipping. O Studio aceita WAV, MP3, M4A, FLAC e OGG até 100 MB e usa FFprobe para verificar arquivo/faixa de áudio; instale FFmpeg/FFprobe em Motores & Setup se faltar. Essa verificação não avalia qualidade nem presença de fala. A amostra só é enviada à ElevenLabs após confirmação explícita e não fica armazenada pelo Studio. Clone pode consumir créditos e depende da elegibilidade da conta; a exclusão remove o clone da conta, mas não apaga áudios já gerados localmente. A integração da branch `main` não foi testada com chamada paga ou clonagem real.

Em vez da voz da ElevenLabs, cada cena pode receber áudio próprio: envie um arquivo (MP3, WAV, M4A, AAC, OGG ou FLAC) ou grave direto no **Modo Studio** (teleprompter com o texto da narração e gravação por take, até 64 MB). O Studio converte a gravação para `narration.m4a` no projeto e pede aprovação antes do render; texto alterado na cena descarta o áudio dela.

## Dados, privacidade e segurança

- Projetos, marcas, aprovações e exportações ficam no workspace local que você escolheu.
- Codex e Claude Code usam a autenticação dos CLIs oficiais; o Studio não pede as senhas dessas contas.
- **Na branch `main`:** a chave ElevenLabs fica cifrada pelo cofre do sistema. Se o cofre seguro não estiver disponível, salvar a chave é bloqueado. Esse código não está nos instaladores v0.1.1.
- Áudios gravados no Modo Studio ficam no projeto como `narration.m4a` (um por cena) e não são enviados a provedores; o microfone é ativado apenas durante a gravação.
- A interface desktop usa isolamento de contexto, política de segurança de conteúdo (CSP) e validação de operações IPC.
- Conteúdo enviado a Codex, Claude Code, VideoGo/ElevenLabs ou outros serviços externos depende da ação que você iniciar e dos termos desses provedores. Uma geração ou clonagem pode enviar texto/áudio ao provedor e consumir créditos.
- Testes locais de motor usam diretórios temporários descartáveis; não renderizam voz paga nem alteram projetos existentes.

## Versão, releases e atualizações

A release pública mais recente é **v0.2.1**, publicada pela tag `v0.2.1`; `package.json` e o lockfile declaram a mesma versão.

Em uma versão empacotada, o app baixa novas versões sozinho em segundo plano. Em **Preferências**, **Reiniciar e atualizar** aplica a versão pronta; se você não reiniciar, ela é aplicada ao fechar o app. O restart é recusado enquanto houver tarefas em execução. O AppImage Linux e o instalador Windows usam essa atualização automática; pacotes `.deb` são atualizados pelo gerenciador do sistema. A atualização automática no macOS exige build assinado, que ainda não existe; os feeds macOS e Windows precisam de validação nativa antes de afirmar compatibilidade completa.

## Compatibilidade e estado de verificação

| Sistema | Artefatos publicados | Evidência disponível |
|---|---|---|
| Linux x86_64 | AppImage e `.deb` v0.2.1 | Build e publicação pelo GitHub Actions. O AppImage testado localmente (build da branch, em workspace descartável) abriu e exercitou navegação, Preferências e projeto VideoGo. A atualização automática entre versões publicadas ainda não foi executada. O `.deb` não atualiza sozinho. |
| Windows x64 | Instalador NSIS `.exe` v0.2.1 | Build e publicação pelo GitHub Actions; não instalado nem exercitado em Windows nativo. Sem assinatura: o SmartScreen avisa na primeira execução. |
| macOS arm64 | DMG e ZIP v0.2.1 | Build e publicação pelo GitHub Actions; não instalado nem exercitado em macOS nativo. Sem assinatura Apple, então a atualização automática não é habilitada. Sem artefato Intel/x64. |

Os binários v0.2.1 não têm assinatura/notarização. A publicação dos três alvos foi concluída, mas compatibilidade completa só pode ser afirmada após instalar e exercitar os fluxos em hosts Linux, Windows e macOS nativos. A atualização automática de 0.2.0 para 0.2.1 ainda não foi observada em instalador real.

## Desenvolvimento e testes

Requer Node.js e npm compatíveis com o `package-lock.json`; a CI usa Node.js 22. Os comandos abaixo usam o código do checkout atual; não assumem que ele corresponde à tag/release v0.1.1.

Para desenvolver a interface com Electron, abra dois terminais na raiz do repositório:

```bash
# Terminal 1: servidor Vite local
npm run dev

# Terminal 2: Electron conectado ao Vite
MDC_DEV_URL=http://127.0.0.1:5173 npm start
```

No PowerShell, use `$env:MDC_DEV_URL = "http://127.0.0.1:5173"` antes de `npm start`.

Validações do checkout atual:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
```

`npm test` executa os testes automatizados presentes no checkout. No código atual, eles incluem proteção da chave ElevenLabs e exigência de aprovação antes de TTS. `npm run smoke` exercita criação de marca/projetos, conversões FFmpeg, exportação, preflight e fluxos PTY usando dados temporários. O smoke requer FFmpeg e suporte a symlink; no Windows, habilite symlink (Developer Mode ou privilégios adequados).

Os caminhos de PostNow, VideoGo e Maestro podem ser definidos no ambiente para executar o smoke em layouts não padrão:

```bash
MDC_SMOKE_POSTNOW="/caminho/PostNow" \
MDC_SMOKE_VIDEOGO="/caminho/VideoGo" \
MDC_SMOKE_MAESTRO="/caminho/orquestrador-maestro-cli" \
npm run smoke
```

No PowerShell, configure os mesmos nomes com `$env:MDC_SMOKE_POSTNOW`, `$env:MDC_SMOKE_VIDEOGO` e `$env:MDC_SMOKE_MAESTRO` antes de `npm run smoke`. Sem override, PostNow e VideoGo usam os diretórios irmãos; o caminho padrão do Maestro é Linux-only. O smoke Windows/macOS ainda não foi executado nativamente.

### Gerar instaladores

Execute cada comando no sistema operacional correspondente. Os scripts usam `--publish never`: geram pacotes, mas **não publicam** uma release. Como o `package.json` da branch ainda está em `0.1.1`, esses builds locais usam a mesma versão/nomenclatura da release oficial embora possam conter código posterior à tag. Não distribua nem publique esses arquivos como se fossem os downloads oficiais.

```bash
npm run dist:linux    # Linux: AppImage e .deb
npm run dist:windows  # Windows: instalador NSIS
npm run dist:mac      # macOS: DMG e ZIP
```

Para uma nova distribuição, primeiro atualize `package.json` e o lockfile para uma versão SemVer superior, valide o mesmo commit nos três sistemas e siga [`DEV/RUNBOOKS/RELEASES.md`](DEV/RUNBOOKS/RELEASES.md). O workflow de release publica os artefatos automaticamente quando autorizado.

## Documentação e links

- [Testes, requisitos e matriz de verificação](DEV/TESTING.md)
- [Evidências mais recentes e limites conhecidos](DEV/VERIFY.md)
- [Processo de versão, publicação e atualização](DEV/RUNBOOKS/RELEASES.md)
- [Contexto técnico do projeto](DEV/CONTEXT.md)
- [Repositório do Studio](https://github.com/FernandoBolzan/maquina-de-conteudo-studio)
- [Código atual na branch `main`](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/tree/main)
- [Tag do release v0.2.1](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/tree/v0.2.1)
