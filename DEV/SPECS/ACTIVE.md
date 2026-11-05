# Active Spec — Máquina de Conteúdo

## Goal

Entregar o aplicativo desktop **Máquina de Conteúdo (Studio)** (Electron + React + TypeScript + xterm.js), integrando PostNow, VideoGo, Orquestrador Maestro, execução interativa de Codex e Claude Code, diagnóstico e provisionamento local, marcas, aprovação humana e ponte bidirecional entre projetos de imagem e vídeo.

## In Scope

- Shell desktop Electron isolado (`contextIsolation`, sandbox, CSP) com protocolo seguro `media://asset/<token>`.
- Supervisor de processos e PTY (`node-pty` + `@xterm/xterm`), redaction de credenciais, histórico limitado em memória e encerramento de grupos.
- Gestão local de marcas e projetos PostNow/VideoGo.
- Aprovação vinculada a hash SHA-256 e exportação verificada com `MANIFEST.json`.
- Derivação imagem → vídeo e vídeo → imagem via FFmpeg.
- Onboarding guiado na primeira execução, com configuração opcional, explicações simples e preservação do fluxo de perfis existentes.
- Diagnóstico de versão estável para Codex/Claude Code; instalação/atualização privada, validação antes de ativar, rollback e consentimento explícito sem alterar CLIs globais.
- Setup exibe o estado/versionamento por dependência de cada motor e orientação acionável para corrigir ausências ou versões incompatíveis; VideoGo discrimina FFmpeg e FFprobe.
- Testes locais de PostNow/VideoGo renderizam apenas em pasta temporária descartável, sem voz paga e sem alterar projetos; Maestro testa contexto local sem chamar IA. Cada execução exige consentimento.
- Preferências mostra aviso inline de atualização e data da última consulta concluída, persistidos localmente.
- Preferências integra ElevenLabs para VideoGo: validação da chave, armazenamento cifrado com `safeStorage`, catálogo de vozes e clonagem com autorização explícita.
- Studio mantém narração editorial e texto falado por cena, seleciona voz, usa tags Eleven v4 e IPA, exige aprovação hash-bound antes da síntese e aprovação individual do áudio antes do render final.
- Geração paga executa VideoGo em processo filho com chave apenas no ambiente, modelo `eleven_v4` e cache de voz/transcrição desativado no fluxo privado.
- Releases e autoatualização desktop: SemVer em `package.json`, tags anotadas `vX.Y.Z`, GitHub Releases no repositório `FernandoBolzan/maquina-de-conteudo-studio` e confirmação explícita do usuário para instalar.

## Out Of Scope

- Backend SaaS, cobrança/faturamento, serviço de armazenamento ou processamento de dados no servidor. Roteiros e amostras de voz só são enviados à ElevenLabs quando a ação autorizada do usuário exigir, sob os termos do provedor.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke` e `npm run build` passam.
- A chave ElevenLabs armazenada nunca aparece em settings persistidos, respostas IPC posteriores ao renderer, argumentos do CLI ou logs; sem cofre seguro, salvar é bloqueado em vez de recorrer a texto puro.
- No fluxo Studio, a síntese é bloqueada até a aprovação explícita da narração; mudanças de texto, fonética, tags ou voz invalidam a aprovação, e o render final exige clipes gerados e aprovação individual.
- Testes offline verificam autorização anterior a TTS, proteção da key, preservação de tags/IPA, associação atômica dos áudios e compatibilidade com áudio externo.
- Instalação nova abre onboarding; perfis existentes sem estado de onboarding não são interrompidos.
- Codex/Claude distinguem CLI ausente, atualizado, desatualizado, externo e consulta indisponível; cópia gerenciada atualiza com validação e rollback.
- Nenhuma instalação/atualização de CLI modifica a cópia global; ações de instalação exigem confirmação explícita.
- Fluxos de usuário exercitados em app Electron real: marca, projeto, renderização do carrossel (incluindo mensagem útil quando faltar Pillow), aprovação, derivação imagem↔vídeo, render VideoGo e diagnóstico de motores.
- Diagnósticos por motor refletem o runtime realmente selecionado; VideoGo distingue FFmpeg/FFprobe e PostNow confirma Python/Pillow no mesmo ambiente usado no render.
- Testes consentidos de VideoGo/PostNow validam artefato de render temporário; Maestro valida contexto local sem modelo. Resultados identificam explicitamente quando dependências impedem o teste.
- Preferências exibe data persistente da última consulta concluída; update disponível aparece inline e download continua consentido.
- `npm run dist:linux` produz instaladores Linux; ao menos um pacote é aberto e executado em ambiente Linux compatível.
- Windows NSIS instala, abre e valida PTY, diálogos e caminhos no Windows nativo.
- macOS dmg/zip abre e valida permissões, subprocessos e caminhos em macOS nativo.
- A mesma versão é conferida nos três sistemas antes de afirmar compatibilidade completa.
- Tag `vX.Y.Z` deve corresponder à versão npm; workflow constrói Linux, Windows e macOS e publica os artefatos/metadados somente após todos os builds passarem.
- Release publicada fornece metadados `latest*.yml`; app empacotado consulta o feed GitHub fixo e só baixa após consentimento. `.deb` não usa autoatualizador do app.

## Structural Prevention

- Manter contratos tipados em `src/shared/contracts.ts` e validação de entrada/caminhos em `src/main/runtime.ts` e `src/main/content/storage.ts`.

## Constraints

- Alvo desktop: Linux, Windows e macOS; validação nativa é específica de cada sistema.
- Dados de projetos e marcas ficam fora dos clones dos repositórios.
- Publicar tags/releases exige autorização do mantenedor; assinatura/notarização depende de certificados e contas apropriados.

## Verification Plan

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run smoke`
- `npm run build`
- `npm run pack` valida configuração de empacotamento local sem publicar.
- Testes offline determinísticos para estado missing/current/outdated e ciclo CLI install/update/rollback validado em diretório temporário.
- Fluxo de primeira execução exercitado visualmente em Electron/Chromium sem instalar ferramentas ou autenticar contas reais.
- Validar que o fluxo `.github/workflows/release.yml` só aceita tag estável igual à versão npm e publica artefatos após os três builds nativos.
- Fluxos visuais em Electron real e verificações de pacote Linux.
- `npm run dist:windows` + instalação e smoke em Windows nativo.
- `npm run dist:mac` + abertura e smoke em macOS nativo.
- Smoke suporta caminhos configuráveis por `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`; defaults mantêm irmãos PostNow/VideoGo e Maestro Linux. FFmpeg e permissão de symlink são pré-requisitos; executar o smoke em Windows/macOS nativos ainda está pendente.
- `orquestrador-maestro check-dev-gates --project-path . --strict`

## Status

- State: active — release `v0.1.1` publicada; integração ElevenLabs implementada localmente; Linux AppImage verificado. Restam teste nativo Windows/macOS, assinatura/notarização e atualização entre versões; nenhuma síntese/clonagem paga real foi feita.
- Owner: Maestro & Orquestrador
- Last updated: 2026-11-05
