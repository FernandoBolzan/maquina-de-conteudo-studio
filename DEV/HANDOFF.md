# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-11-16T19:36:42.591Z
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: 2026-11-16 — Motores & Setup e workspace ElevenLabs
- Spec: `DEV/SPECS/ACTIVE.md`
- Plan: `.omx/plans/motores-setup-ux-20261116T185253Z.md` (RALPLAN Architect + Critic aprovados).
- Changed: `Setup.tsx` agrupa agentes/CLIs, motores e ferramentas de sistema; `VideoGoVoiceSetup.tsx` organiza chave/cofre, biblioteca e clonagem opcional; CSS escolhe um único seletor por breakpoint, corrige breadcrumb; `App.tsx` nomeia ações icon-only.
- Verified: typecheck, lint, `npm test` 296/296, build e smoke isolado (`ok: true`). Preview 320/390/768/1024/1440 sem overflow/truncamento; setas alternam tabs; fixture sintética exercitou busca/filtro/vazio/erro. Console sem erro; revisão independente sem findings.
- Risks: sequência composta falhou uma vez na proteção POSTNOW_HOME sob `/tmp`; smoke standalone passou depois, sem causa isolada. Build avisa renderer JS 853,06 kB >500 kB. Sem Electron/keychain, chave real, reprodução de áudio, TTS ou clonagem.
- Next context: reiniciar Electron para carregar os assets; validar chave, cofre e áudio real apenas com autorização explícita.

## Recent Entries

- 2026-11-16 — Motores & Setup e workspace ElevenLabs
- 2026-11-10 — Release 0.2.1: abas do submenu corrigidas
- 2026-11-10 — Atualização automática do app por release por tag (v0.2.0)
- 2026-11-09 — Fluxo simplificado: Avançar aprova a etapa; isolamento das contas Claude/Codex
