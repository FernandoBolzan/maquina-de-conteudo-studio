# Execução autopilot — Máquina de Conteúdo

## Contrato e baseline
Somente documentação existia no início; não havia código, package.json, build, testes ou repositório Git. O trabalho é implementar aplicativo local Electron/React/TypeScript com projetos persistidos, marcas, previews, agentes reais, terminal, setup, motores e atualização. Nenhum commit/push/publicação/login/pagamento será executado autonomamente nesta sessão.

As descrições anteriores eram propostas, não implementações verificadas. Não se presume RPC OMP em Claude/Codex, geração de imagens nativa disponível em todo provedor, HTTP nos motores, zero alucinação, redução percentual de tokens ou suporte offline a modelos remotos. `claude auth login` e `codex login` são os comandos reais observados. Acesso a repositório público não prova licença comercial. Não adotar `git pull main` ou imagens `latest` como atualização silenciosa.

## Decisões
- Electron para os dois sistemas; processos locais padrão evitam dependência obrigatória de Docker/WSL. Contêineres são uma rota de distribuição a validar, não requisito adicional instalado à força.
- React para cards, histórico e mídia; xterm exclusivamente para PTY de programas interativos. Não reimplementar renderer ANSI do OMP.
- Codex/Claude via executáveis oficiais, aprovação nativa preservada. Maestro prepara contexto; não gera storyboard por si.
- GitHub CLI autentica no navegador e guarda sua própria credencial. Aplicativo não lê tokens. OAuth próprio depende de registro do aplicativo pelo mantenedor.
- Dados fora dos clones; operações só em workspaces escolhidos. Atualizações dos motores em diretórios versionados, ativação após instalação válida. App update depende de canal publicado pelo mantenedor.
- Sem modelo remoto pago durante testes. Smoke real local com mídia gerada deterministicamente e CLIs de diagnóstico. Login/conta humana e Windows são gates externos, nunca aprovados por inferência.

## UX / Design Profile
CREATE / EVOLVE / MEDIUM. Base visual já proposta: estúdio escuro, contraste AA, verde discreto, tipografia mono só em console/dados, sem percentuais inventados. Telas: Projetos (criar/importar), Estúdio (mídia/brief/agente/revisão), Marcas (logo/tom/paleta), Configuração (diagnóstico/login/instalação/updates). Navegação persistente; console recolhível; estados vazio/carregando/erro/aguardando aprovação explícitos. Em telas estreitas navegação compacta, painel único e console alternável. Nenhuma operação crítica apenas por cor. Sistema visual local via tokens CSS, sem biblioteca de componentes paralela.

## Roadmap e ownership
1. Lead: contratos compartilhados `src/shared/contracts.ts`, `src/main/context.ts`, configuração/npm, Electron, preload, supervisor de jobs, persistência e integração. Gate: typecheck/build/lint.
2. Projects lane [P]: `src/main/projects.ts`, `src/main/agents.ts`, auxiliares de projetos. Criar/importar/listar marcas/projetos/assets, aprovação, exportação, bridge imagem/vídeo, render real VideoGo, launcher Codex/Claude com contexto Maestro. Gate: CLI smoke em workspace temporário.
3. Setup lane [P]: `src/main/setup.ts` e auxiliares. Diagnóstico, logins interativos, instalação consentida, motores versionados, atualização/rollback seguros. Gate: status real e dry-run/validação de instalações sem alterar contas globais.
4. UI lane [P]: `src/renderer/**`, `index.html`. Interface completa sobre API abaixo, sem dados falsos. Gate: navegador e Electron real.
5. Lead: integração, evidência visual, cenários mídia/projetos/job/cancelamento; revisão funcional e segurança; empacotamento Linux e config Windows.

## API (renderer -> host)
`window.maquina.invoke<T>(action,payload)`; falhas rejeitam Error legível; eventos `job`, `output`, `refresh`. Contratos em src/shared/contracts.ts.
- `app.snapshot` -> Snapshot; `app.settings` {workspace?,provider?,enginePaths?} -> Settings; `app.pick` {directory?,extensions?} -> string|undefined; `app.open` {path}; `app.external` {url}.
- `projects.list` -> Project[]; `projects.create` {title,kind,brandId?,brief?} -> Project; `projects.import` {path,kind?} -> Project; `projects.detail` {id} -> ProjectDetail; `projects.notes` {id,notes}; `projects.importAsset` {id,path} -> ProjectDetail; `projects.approve` {id,path,approved} -> ProjectDetail; `projects.export` {id,destination} -> string; `projects.bridge` {id,kind} -> Project; `projects.render` {id} -> Job.
- `brands.list` -> Brand[]; `brands.save` {id?,name,tone,colors:string[],logo?} -> Brand.
- `agents.start` {id,provider,model?,prompt,confirm:true} -> Job. `model` is an optional CLI model ID (max 100 characters); omitted/blank preserves the provider CLI default. Codex and Claude receive it as `--model`. Interactive PTY, with native permissions; prompt launch does not imply arbitrary shell permission. Existing-project conflict must be refused while running.
- O catálogo do seletor exibe perfis qualitativos e preços públicos de API por 1M tokens (USD), verificados em 2026-11-05: OpenAI (`developers.openai.com/api/docs/pricing`) e Anthropic (`platform.claude.com/docs/en/about-claude/pricing`). São referência comparativa, não estimativa da fatura: uso por login em Codex/Claude segue cotas/regras da conta e o Studio não recebe contagem de tokens do CLI. A disponibilidade efetiva depende da conta e da versão do CLI; modelos fora do catálogo aceitam ID manual.
- `setup.status` -> SetupStatus; `setup.install` {tool,confirm:true} -> Job; `setup.login` {provider:'github'|'claude'|'codex',confirm:true} -> Job; `setup.engine` {engine,operation:'install'|'update'|'rollback',confirm:true} -> Job or result with message; `setup.link` {engine,path,confirm:true} -> Settings.
- `jobs.list` -> Job[]; `jobs.cancel` {id}; `jobs.input` {id,data}; `jobs.resize` {id,cols,rows}.
- `app.updateCheck` -> {available:boolean,version?:string,message:string}; `app.updateInstall` {confirm:true}.

## Segurança e falhas
Renderer sandboxed, contextIsolation, nodeIntegration false, IPC allowlist/origem validada, CSP. Protocol de mídia só autoriza arquivos registrados sob storage. URLs externas https allowlist. Path traversal/symlinks recusados; upload cópia local; nomes gerados por UUID. Cancelar mata grupo de processos; histórico limitado em RAM, logs em disco com redaction; reinício marca jobs incompletos interrupted. Login não registra conteúdo sensível. Autoinstalação exige consentimento e fonte oficial; erros mantêm versão anterior.

## Evidência / limites
Verificação final: npm run typecheck, npm run lint, npm test, npm run build, smoke real, navegador+Electron, pacote Linux. Sem fabricação de render/generation/API ou percentuais. Terminais Windows precisam execução em Windows para certificação. Instalador assinado e auto-update publicado dependem de repositório/certificado do proprietário.
