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
- Diagnóstico, login oficial interativo e gestão consentida dos motores locais.
- Releases e autoatualização desktop: SemVer em `package.json`, tags anotadas `vX.Y.Z`, GitHub Releases no repositório `FernandoBolzan/maquina-de-conteudo-studio` e confirmação explícita do usuário para instalar.

## Out Of Scope

- Backend SaaS em nuvem, cobranças ou faturamento remoto.
- Armazenamento de credenciais pelo aplicativo.
- Certificação de pacotes, assinatura/notarização ou publicação sem chaves e contas do mantenedor.

## Acceptance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke` e `npm run build` passam.
- Instalação nova abre onboarding; perfis existentes sem estado de onboarding não são interrompidos.
- Codex/Claude distinguem CLI ausente, atualizado, desatualizado, externo e consulta indisponível; cópia gerenciada atualiza com validação e rollback.
- Nenhuma instalação/atualização de CLI modifica a cópia global; ações de instalação exigem confirmação explícita.
- Fluxos de usuário exercitados em app Electron real: marca, projeto, renderização do carrossel (incluindo mensagem útil quando faltar Pillow), aprovação, derivação imagem↔vídeo, render VideoGo e diagnóstico de motores.
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
- `orquestrador-maestro check-dev-gates --project-path . --strict`

## Status

- State: active — Linux code, user flows, packaging, onboarding and managed Codex/Claude CLI lifecycle verified; native Windows/macOS builds and runtime validation pending.
- Owner: Maestro & Orquestrador
- Last updated: 2026-11-05
