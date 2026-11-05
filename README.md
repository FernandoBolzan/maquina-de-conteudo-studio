# Máquina de Conteúdo (Studio)

**Versão pública atual: v0.1.1** · [Baixar para seu sistema](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/tag/v0.1.1) · [Ver todas as releases](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases)

Aplicativo desktop para organizar e produzir conteúdo de imagem e vídeo em um workspace local. Reúne projetos, marcas, assistentes por CLI, motores criativos locais, revisão humana, exportação e ponte entre fluxos de imagem e vídeo.

O Studio é construído com Electron, React e TypeScript. Ele orquestra os motores **PostNow**, **VideoGo** e **Orquestrador Maestro**; Codex e Claude Code são executados por seus CLIs oficiais. O Studio não é um serviço SaaS nem armazena projetos em uma nuvem própria.

## Downloads — v0.1.1

Os links abaixo apontam diretamente para os arquivos anexados à [release pública v0.1.1](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/tag/v0.1.1). Confira o sistema e a arquitetura do computador antes de baixar.

| Sistema | Arquivo | Download |
|---|---|---|
| Linux x86_64 | AppImage | [maquina-de-conteudo-0.1.1-x86_64.AppImage](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.1.1/maquina-de-conteudo-0.1.1-x86_64.AppImage) |
| Debian/Ubuntu x86_64 | Pacote `.deb` | [maquina-de-conteudo-0.1.1-amd64.deb](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.1.1/maquina-de-conteudo-0.1.1-amd64.deb) |
| Windows x64 | Instalador NSIS `.exe` | [maquina-de-conteudo-0.1.1-x64.exe](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.1.1/maquina-de-conteudo-0.1.1-x64.exe) |
| macOS Apple Silicon (arm64) | Imagem `.dmg` | [maquina-de-conteudo-0.1.1-arm64.dmg](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.1.1/maquina-de-conteudo-0.1.1-arm64.dmg) |
| macOS Apple Silicon (arm64) | Arquivo `.zip` | [maquina-de-conteudo-0.1.1-arm64.zip](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases/download/v0.1.1/maquina-de-conteudo-0.1.1-arm64.zip) |

> **Arquiteturas:** a release contém Linux x86_64, Windows x64 e macOS arm64. Não há instalador Linux ARM64 nem macOS Intel/x64 nesta versão. A publicação dos instaladores Windows/macOS não substitui a validação em máquinas nativas; veja [compatibilidade e testes](#compatibilidade-e-estado-de-verificação).

## O que o Studio faz

- **Organiza projetos e marcas** em um workspace escolhido por você, separado dos diretórios dos motores.
- **Cria conteúdo visual com PostNow:** projetos de imagem, carrosséis e materiais associados à identidade da marca, com revisão dos arquivos antes de aprovar e exportar.
- **Cria vídeos com VideoGo:** briefing, storyboard, cenas, arquivos do projeto e renderização local de vídeo.
- **Usa assistentes de IA por CLI:** escolha Codex ou Claude Code e mantenha a autenticação no CLI oficial do provedor.
- **Revisa e aprova resultados:** aprovações são vinculadas ao conteúdo por hash; exportações verificadas incluem `MANIFEST.json`.
- **Conecta imagem e vídeo:** deriva projetos entre PostNow e VideoGo usando FFmpeg, preservando o original.
- **Diagnostica os motores:** Setup informa dependências ausentes/incompatíveis e oferece instalação, vínculo e teste local com confirmação.
- **Inclui Maestro:** valida o contexto local sem chamar um modelo nos testes de contexto.
- **Opcionalmente integra ElevenLabs ao VideoGo:** catálogo/clones de voz, narração por cena e geração de áudio com aprovação explícita.

## Fluxo de uso

1. Instale e abra o Studio; na primeira execução, escolha o workspace e o assistente padrão.
2. Em **Motores & Setup**, veja os pré-requisitos e instale ou vincule somente os motores que pretende usar. Cada instalação ou teste local pede confirmação.
3. Crie uma marca com as referências visuais que quer reutilizar e inicie um projeto de imagem ou vídeo.
4. Escreva o briefing e trabalhe pelo assistente/CLI oficial. Os resultados ficam nos arquivos do projeto dentro do workspace.
5. Revise as prévias, aprove os arquivos desejados e exporte o material aprovado.
6. Em projetos de vídeo, prepare e aprove a narração e os clipes de áudio antes de renderizar o vídeo final.

O Studio não autentica você nos provedores de IA. Faça login pelo terminal do Codex ou Claude Code, conforme a ferramenta escolhida; as credenciais permanecem sob gestão dos CLIs oficiais.

## Instalação

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

Baixe e execute o instalador NSIS; siga o assistente e escolha o diretório de instalação se desejar. A release atual não foi instalada nem exercitada em um Windows nativo. Os binários desta release não foram assinados; o Windows pode exibir avisos de segurança.

### macOS Apple Silicon — `.dmg` ou `.zip`

Baixe o `.dmg` ou `.zip` arm64 e siga o fluxo de instalação do macOS. A release atual não foi instalada nem exercitada em um Mac nativo e não foi notarizada pela Apple; o macOS pode exibir avisos de segurança. Não há build para Macs Intel nesta versão.

## Requisitos dos motores

O aplicativo pode abrir sem que todos os motores estejam instalados. Instale apenas os que você usará; **Motores & Setup** verifica o ambiente selecionado e explica dependências ausentes.

| Componente | Para que serve | Requisitos principais |
|---|---|---|
| PostNow | Projetos de imagem e carrosséis | Python e Pillow no ambiente usado para renderizar |
| VideoGo | Projetos e renderização de vídeo | Node.js, FFmpeg e FFprobe |
| Orquestrador Maestro | Contexto e orquestração local | Node.js/npm e CLI Maestro |
| Codex / Claude Code | Assistência por IA no projeto | CLI oficial instalado e autenticado na conta correspondente |
| ElevenLabs (opcional) | Vozes, clonagem consentida e áudio por cena | API key com permissões de vozes, Text to Speech e gestão de vozes; cofre seguro do sistema operacional |

As versões e dependências concretas podem variar por motor. Use o diagnóstico de Setup; não instale dependências globais sem revisar a confirmação exibida pelo app.

## Narração, vozes e ElevenLabs

A integração é opcional e funciona em projetos VideoGo. Configure a ElevenLabs em **Motores & Setup → Voz e narração do VideoGo**:

1. Informe uma API key com acesso às operações que pretende usar e valide-a. A chave é cifrada com o cofre do sistema por Electron `safeStorage`; se o cofre não estiver disponível, o Studio bloqueia o salvamento em vez de gravar texto puro.
2. Escolha uma voz da conta, incluindo clones existentes, e revise a narração editorial e o `spokenText` de cada cena.
3. Se necessário, use tags Eleven v4, como `[excited]` e `[whispers]`, e IPA inline entre barras, como `/…/`. O fluxo não usa SSML e verifica a correspondência entre o texto editorial e o falado.
4. Salve e aprove explicitamente o texto, a voz, as tags e a fonética. Qualquer alteração invalida a aprovação.
5. Confirme a geração paga Eleven v4. Os áudios ficam no workspace; revise e aprove cada clipe antes de renderizar o vídeo final.

Para clonar uma voz, confirme que ela é sua ou que você tem autorização expressa, selecione uma amostra limpa e autorize o envio direto à ElevenLabs. A amostra é validada com FFprobe e não fica armazenada pelo Studio. A geração consome créditos; elegibilidade, retenção e uso dos dados seguem a conta e os termos da ElevenLabs. Não foi feita chamada paga ou clonagem real nos testes desta release.

## Dados, privacidade e segurança

- Projetos, marcas, aprovações e exportações ficam no workspace local que você escolheu.
- Codex e Claude Code usam a autenticação dos CLIs oficiais; o Studio não pede as senhas dessas contas.
- A chave ElevenLabs fica cifrada pelo cofre do sistema. Se o cofre seguro não estiver disponível, salvar a chave é bloqueado.
- A interface desktop usa isolamento de contexto, política de segurança de conteúdo (CSP) e validação de operações IPC.
- Conteúdo enviado a Codex, Claude Code, VideoGo/ElevenLabs ou outros serviços externos depende da ação que você iniciar e dos termos desses provedores. Uma geração ou clonagem pode enviar texto/áudio ao provedor e consumir créditos.
- Testes locais de motor usam diretórios temporários descartáveis; não renderizam voz paga nem alteram projetos existentes.

## Versão e atualizações

A versão do código e dos pacotes é definida em `package.json`; a release pública atual é **v0.1.1**, tag `v0.1.1`. As versões antigas ficam na [página de releases](https://github.com/FernandoBolzan/maquina-de-conteudo-studio/releases).

Em uma versão empacotada, use **Preferências → Verificar atualização**. O app mostra o resultado; baixar e instalar exige confirmação explícita e não deve interromper tarefas em andamento. O AppImage Linux pode atualizar pelo app; pacotes `.deb` são atualizados pelo gerenciador do sistema. Embora existam feeds para Windows e macOS na release, a instalação e a atualização nesses sistemas ainda precisam de validação nativa.

## Compatibilidade e estado de verificação

| Sistema | Artefatos publicados | Evidência disponível |
|---|---|---|
| Linux x86_64 | AppImage e `.deb` | AppImage v0.1.1 aberto em workspace descartável; navegação, Preferências e criação de projeto VideoGo exercitadas. Atualizador informou que 0.1.1 é a versão atual. `.deb` teve metadados conferidos, mas não foi instalado com `apt`. |
| Windows x64 | Instalador NSIS `.exe` | Build e publicação pelo GitHub Actions; não instalado nem exercitado em Windows nativo. |
| macOS arm64 | DMG e ZIP | Build e publicação pelo GitHub Actions; não instalado nem exercitado em macOS nativo. Sem artefato Intel/x64. |

Os binários v0.1.1 não têm assinatura/notarização. A publicação dos três alvos foi concluída, mas compatibilidade completa só pode ser afirmada após instalar e exercitar os fluxos em hosts Linux, Windows e macOS nativos. A consulta do updater foi validada no Linux; uma atualização entre duas versões diferentes não foi executada.

## Desenvolvimento e testes

Requer Node.js e npm compatíveis com o `package-lock.json`; a CI usa Node.js 22.

Para desenvolver a interface com Electron, abra dois terminais na raiz do repositório:

```bash
# Terminal 1: servidor Vite local
npm run dev

# Terminal 2: Electron conectado ao Vite
MDC_DEV_URL=http://127.0.0.1:5173 npm start
```

No PowerShell, use `$env:MDC_DEV_URL = "http://127.0.0.1:5173"` antes de `npm start`.

Validações do projeto:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
```

Depois de `npm run build`, `npm start` abre a versão compilada do renderer. `npm test` executa os testes automatizados do runtime, incluindo proteção da chave ElevenLabs e exigência de aprovação antes de TTS. `npm run smoke` exercita criação de marca/projetos, conversões FFmpeg, exportação, preflight e fluxos PTY usando dados temporários. O smoke requer FFmpeg e suporte a symlink; no Windows, habilite symlink (Developer Mode ou privilégios adequados).

Os caminhos de PostNow, VideoGo e Maestro podem ser definidos no ambiente para executar o smoke em layouts não padrão:

```bash
MDC_SMOKE_POSTNOW="/caminho/PostNow" \
MDC_SMOKE_VIDEOGO="/caminho/VideoGo" \
MDC_SMOKE_MAESTRO="/caminho/orquestrador-maestro-cli" \
npm run smoke
```

No PowerShell, configure os mesmos nomes com `$env:MDC_SMOKE_POSTNOW`, `$env:MDC_SMOKE_VIDEOGO` e `$env:MDC_SMOKE_MAESTRO` antes de `npm run smoke`. Sem override, PostNow e VideoGo usam os diretórios irmãos; o caminho padrão do Maestro é Linux-only. O smoke Windows/macOS ainda não foi executado nativamente.

### Gerar instaladores

Execute cada comando no sistema operacional correspondente. Os scripts usam `--publish never`: geram pacotes, mas **não publicam** uma release.

```bash
npm run dist:linux    # Linux: AppImage e .deb
npm run dist:windows  # Windows: instalador NSIS
npm run dist:mac      # macOS: DMG e ZIP
```

Publicação de uma nova versão exige SemVer, tag estável correspondente e os três builds nativos aprovados. O fluxo publica automaticamente quando autorizado; veja [`DEV/RUNBOOKS/RELEASES.md`](DEV/RUNBOOKS/RELEASES.md) antes de iniciar uma release.


## Documentação

- [Testes, requisitos e matriz de verificação](DEV/TESTING.md)
- [Evidências mais recentes e limites conhecidos](DEV/VERIFY.md)
- [Processo de versão, publicação e atualização](DEV/RUNBOOKS/RELEASES.md)
- [Contexto técnico do projeto](DEV/CONTEXT.md)
- [Repositório do Studio](https://github.com/FernandoBolzan/maquina-de-conteudo-studio)
- [Site do produto](https://www.fernandobolzan.com/maquina-de-conteudo)
