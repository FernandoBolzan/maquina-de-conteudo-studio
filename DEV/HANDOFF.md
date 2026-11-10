# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-11-10T02:53:43.808Z
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: 2026-11-10 — Release 0.2.1: abas do submenu corrigidas
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/renderer/shell-refined.css` — `.setup-subnav` com `flex-wrap: wrap` e sem `overflow-x: auto`; as abas "Motores & CLIs" e "ElevenLabs & Voz" quebram para outra linha em vez de cortar. `package.json` e `package-lock.json` em 0.2.1. README e `DEV/RUNBOOKS/RELEASES.md` atualizados ao estado publicado.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` 230/230, `npm run smoke` (`ok: true`); preview visual em 4178 mostrou as duas abas inteiras, sem barra de rolagem.
- Risks: [list only active risks]
- Next context: após publicar 0.2.1, testar a atualização de uma instalação 0.2.0 para 0.2.1; decidir licença e assinatura de macOS/Windows.

## Recent Entries

- 2026-11-10 — Release 0.2.1: abas do submenu corrigidas
- 2026-11-10 — Atualização automática do app por release por tag (v0.2.0)
- 2026-11-09 — Fluxo simplificado: Avançar aprova a etapa; isolamento das contas Claude/Codex
