# Prompt — Adaptar o VideoGo para narração ElevenLabs externa

Copie o prompt abaixo e execute-o com um agente dentro do repositório do **VideoGo**.

```text
Adapte este repositório do VideoGo para receber e renderizar narração gerada externamente pelo Máquina de Conteúdo (Studio).

Objetivo: o Studio será responsável por configurar a API key, selecionar ou clonar a voz, obter aprovação humana da narração e chamar o ElevenLabs v4. O VideoGo deve consumir os arquivos de áudio locais já gerados e incorporá-los ao vídeo. NÃO implemente chamadas à API ElevenLabs no VideoGo e NÃO receba, armazene, leia ou repasse API keys.

Antes de alterar:
1. Inspecione o CLI de renderização, o schema real do storyboard, a implementação de áudio/mixagem, os testes e a documentação.
2. Identifique os arquivos e interfaces reais envolvidos. Não presuma que nomes ou formatos descritos abaixo já existem.
3. Preserve o comportamento de projetos antigos e o fluxo atual sem áudio.
4. Depois da inspeção, implemente a integração completa — não pare em um plano ou scaffold.

Contrato desejado com o Studio:
- O Studio usa o storyboard `videogo.storyboard/v1`, que já contém `scenes[].narration` e `scenes[].audio`.
- Estenda esse contrato de forma opcional e compatível para aceitar áudio externo de narração por cena. Preferência inicial:
  `scene.audio.narration = { "assetPath": "assets/audio/narration/scene-1.mp3", "startOffsetSeconds": 0, "gain": 1 }`
- `assetPath` deve ser relativo à raiz do projeto. Documente claramente o campo final escolhido, seus valores e defaults. Se a estrutura existente pedir outro formato, use o formato natural do VideoGo, mas mantenha um contrato explícito e estável para o Studio.
- O storyboard deve continuar carregando o texto original em `scene.narration`; o áudio associado não substitui a narração textual.
- Quando houver narração externa configurada, o render deve usar esse arquivo e NÃO sintetizar uma segunda voz demo. O argumento atual `--voice demo` não pode sobrescrever nem duplicar áudio externo.
- Se o campo de narração externa estiver ausente, projetos antigos e o fluxo atual devem continuar funcionando.
- Se estiver presente mas o arquivo estiver ausente, inválido ou fora da pasta do projeto, interrompa o render com erro acionável. Não faça fallback silencioso para demo ou para outro arquivo.
- Restrinja caminhos à raiz do projeto; rejeite caminhos absolutos, traversal (`..`), symlinks escapando do projeto e arquivos não suportados.
- Integre a faixa de voz ao render final e à sincronização das cenas com as ferramentas de mídia já usadas pelo VideoGo. Preserve o comportamento de trilha, SFX, áudio original e mixagem existentes; não os descarte sem uma opção documentada.
- Trate offsets, ganho/volume, duração e finalização de áudio conforme o pipeline real. Não corte a fala de forma silenciosa quando ela exceder a duração visual da cena; defina e documente o comportamento adotado.
- Não registre texto da narração, conteúdo de áudio, nomes pessoais ou credenciais nos logs.

Requisitos de implementação:
- Atualize schema/validação, CLI de render, composição/mixagem, tipos e documentação onde necessário.
- Mantenha o caminho antigo para projetos sem os novos campos.
- Se houver opções de render/CLI relevantes, mantenha argumentos existentes e documente a precedência entre configuração do storyboard e flags.
- Não altere nem autoaprove o estado de aprovação do projeto: aprovação da narração e do áudio é responsabilidade do Studio.
- Não acople o motor a Electron, IPC, settings do Studio ou endpoints ElevenLabs.
- Escreva testes determinísticos com arquivos de áudio de fixture; testes não podem chamar APIs pagas nem depender de rede.
- Inclua testes para: storyboard legado sem áudio; storyboard com áudio válido produzindo render audível; campo presente com arquivo ausente; caminho inseguro fora do projeto; formato inválido; interação com áudio de origem/SFX/música já existentes; e garantia de que `--voice demo` não duplica uma faixa externa.
- Rode os comandos reais de teste, lint, typecheck e build disponíveis neste repositório. Corrija falhas relacionadas à mudança.

Critérios de conclusão:
1. Um storyboard válido com `scene.audio.narration.assetPath` renderiza um vídeo que contém a voz fornecida, usando o pipeline suportado pelo VideoGo.
2. Projetos antigos continuam renderizando como antes.
3. Áudio configurado mas inválido nunca é ignorado nem substituído silenciosamente.
4. Caminhos externos à raiz do projeto são recusados.
5. Nenhuma API key ou chamada ElevenLabs foi adicionada ao motor.
6. Testes e verificações do repositório passam.

Ao terminar, responda com:
- arquivos alterados;
- contrato exato que o Studio deve gravar no storyboard;
- comando/argumentos de render e precedência do `--voice`;
- comportamento de sincronização e mixagem;
- testes e verificações executados, com resultados;
- limitações restantes.
```
