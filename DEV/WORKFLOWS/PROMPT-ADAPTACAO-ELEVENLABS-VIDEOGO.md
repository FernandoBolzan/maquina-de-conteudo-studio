# Prompt — Integração de narração ElevenLabs no VideoGo/Studio

Copie o prompt abaixo e execute-o dentro do repositório **VideoGo** quando for necessário portar ou revisar a integração do motor. O fluxo atual do Studio também depende do contrato de storyboard descrito aqui.

```text
Implemente e verifique a geração de narração ElevenLabs v4 pelo VideoGo para projetos controlados pelo Máquina de Conteúdo (Studio), preservando o suporte existente a áudio externo por cena.

Contexto obrigatório:
- O storyboard `videogo.storyboard/v1` já suporta `scenes[].audio.narration` com `assetPath`, `startOffsetSeconds` e `gain`; render, validação de caminhos e mixagem já existem. Estude-os e estenda-os, não crie um segundo contrato.
- O Studio configura e valida a API key, lista vozes, oferece clonagem com consentimento, edita a narração e registra aprovação humana vinculada por hash ao texto, `spokenText`, voz e modelo `eleven_v4`.
- O VideoGo recebeu uma correção de vozes do mantenedor. Preserve-a. Não reescreva nem reverta `listVoices`, `cloneVoice`, a listagem de vozes ou a clonagem existente para implementar a geração de áudio.
- A geração é feita por `VoiceService` existente. O Studio inicia apenas o comando pago autorizado e injeta `ELEVENLABS_API_KEY` no ambiente do processo filho; a chave não entra em argumento, storyboard, configuração persistente ou logs. O fluxo Studio usa `VIDEOGO_NO_VOICE_CACHE=1` para não guardar transcrição/áudio no cache privado do motor.

Contrato esperado:
1. O comando é `project narration <storyboard.json> --generate-audio --voice <id> --allow-paid`.
2. O comando de geração exige voz real e `--allow-paid`, força `ELEVENLABS_MODEL=eleven_v4` e valida o storyboard e a equivalência das palavras antes de qualquer chamada paga.
3. Use `scene.audio.spokenText` quando presente; preserve tags de áudio Eleven v4 (por exemplo `[whispers]`, `[excited]`) e fonética IPA inline entre barras (`/…/`). Não envie SSML. Tags não mudam as palavras comparadas; uma transcrição IPA pode substituir o nome difícil correspondente.
4. Gere um áudio por cena com `scene.narration` preenchido. Copie respostas válidas para uma pasta temporária local do projeto, valide faixa e duração, e só publique a pasta final e atualize o storyboard depois que todas as cenas forem geradas com sucesso. Falha parcial não pode deixar storyboard alterado nem clipes parciais publicados.
5. Grave no storyboard a referência local já suportada: `scene.audio.narration = { "assetPath": "assets/audio/narration/<id>/<scene>.mp3", "startOffsetSeconds": 0, "gain": 1 }`. Mantenha `scene.narration` e `scene.audio.spokenText`.
6. O render deve continuar a consumir as faixas externas sem duplicar voz, respeitar offset/duração/ganho, mixar música, SFX e áudio original existentes, e recusar arquivos inválidos ou caminhos fora do projeto sem fallback silencioso.
7. O Studio já é responsável pela aprovação humana e impede que sua ação de geração seja iniciada antes dela. O CLI não consegue provar uma aprovação visual externa; em uso direto ele exige confirmação explícita `--allow-paid`. Não afirme que essa flag autentica a aprovação do Studio.
8. Nenhuma transcrição ou chave deve aparecer em log ou cache do caminho privado do Studio. Não altere a governança de aprovação dos projetos no motor.

Antes de editar, examine CLI, `VoiceService`, schema, render, cache, testes e documentação. Faça mudanças compatíveis com projetos antigos e aproveite padrões existentes. Não toque na listagem/clonagem de vozes atual do mantenedor. Não faça chamadas pagas reais.

Testes determinísticos offline devem cobrir IPA/tags e rejeição de palavras divergentes, geração completa e falha parcial atômica, associação de áudio externo, compatibilidade legada, rejeição de caminho/asset inválido, e `--voice demo` sem duplicação. Use geradores/probes injetados ou fixtures locais; não teste apenas cópias/encaminhamento.

Rode os comandos disponíveis de typecheck, teste, build e smoke local de áudio externo. Não alegue validação de voz real sem chamada aprovada e evidência auditiva.

Ao concluir, informe arquivos, contrato gravado, comando e condição de autorização, cache/privacidade, precedência e mixagem, verificações e limites. Não faça commit nem push sem pedido expresso.
```