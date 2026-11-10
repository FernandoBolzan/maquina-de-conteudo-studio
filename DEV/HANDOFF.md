# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-11-10T02:20:54.522Z
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: 2026-11-09 — Motores & Setup: submenu ElevenLabs, overview executivo e redesign de layout
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/renderer/App.tsx` (navegação com `setupSubmenu: 'engines' | 'elevenlabs'`, submenu aninhado na sidebar com pills de status, breadcrumb com navegação hierárquica e deep link de voz); `src/renderer/Setup.tsx` (segmented tabs para alternar entre Motores & CLIs e ElevenLabs & Voz, banner executivo de status com métricas operacionais, desacoplamento completo do bloco de voz, link direto no onboarding); `src/renderer/VideoGoVoiceSetup.tsx` (dashboard dedicado de voz com 4 pilares de governança e segurança, toggle de visualização da API key, catálogo de vozes pesquisável com filtro por categoria, player de áudio preview sob demanda interativo, guia de clonagem instantânea estruturado em passos, checkbox de consentimento legal e diagnóstico local de áudio FFprobe); `src/renderer/shell-refined.css` (estilos para submenu na sidebar, tabs in-page, cards de estatísticas, ribbon de segurança, catálogo de vozes e responsividade sem overflow em 390/768/1280/1440 px).
- Verified: `npm run typecheck`, `npm run lint` (exit 0); `npm test` (223/223); `npm run smoke` (`ok: true`); `npm run build` (exit 0); verificação interativa visual em Chromium via Browser API em 4 viewports (390, 768, 1280, 1440 px com 0 overflow), alternância de abas e submenus na sidebar e in-page, e navegação direta do Studio para o painel ElevenLabs.
- Risks: [list only active risks]
- Next context: reiniciar a aplicação desktop para carregar os novos componentes compilados no Electron nativo.

## Recent Entries

- 2026-11-09 — Motores & Setup: submenu ElevenLabs, overview executivo e redesign de layout
- 2026-11-09 — Capa com título, pessoa fiel e logo oficial; contas visíveis
- 2026-11-09 — Entrega: capa preservada quando o Claude falha; login do Claude conferido
