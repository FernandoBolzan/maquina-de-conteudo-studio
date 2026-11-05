import type { Provider } from '../shared/contracts.js';

export interface ModelOption {
  id: string;
  name: string;
  profile: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  costTier: 'Baixo' | 'Médio' | 'Alto';
}

// API list rates are reference-only: https://developers.openai.com/api/docs/pricing
// and https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-05).
export const MODEL_CATALOG: Record<Provider, ModelOption[]> = {
  codex: [
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', profile: 'Maior capacidade; raciocínio, código e tarefas difíceis.', inputUsdPerMillion: 10, outputUsdPerMillion: 50, costTier: 'Alto' },
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', profile: 'Quase nível Astra para trabalho complexo, por menor preço.', inputUsdPerMillion: 2, outputUsdPerMillion: 10, costTier: 'Médio' },
    { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', profile: 'Rápido e eficiente; bom para texto, imagens e tarefas visuais.', inputUsdPerMillion: 1, outputUsdPerMillion: 5, costTier: 'Médio' },
    { id: 'gpt-6-sol', name: 'GPT-6 Sol', profile: 'Código complexo e fluxos com agentes; versão anterior ao 6.1 Sol.', inputUsdPerMillion: 2, outputUsdPerMillion: 10, costTier: 'Médio' },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', profile: 'Mais eficiente para tarefas focadas e em alto volume.', inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5, costTier: 'Baixo' },
  ],
  claude: [
    { id: 'fable', name: 'Claude Fable 5.1', profile: 'Mais capaz para tarefas longas, ambíguas e difíceis.', inputUsdPerMillion: 10, outputUsdPerMillion: 50, costTier: 'Alto' },
    { id: 'opus', name: 'Claude Opus 5.5', profile: 'Raciocínio profundo e problemas difíceis.', inputUsdPerMillion: 4, outputUsdPerMillion: 20, costTier: 'Alto' },
    { id: 'sonnet', name: 'Claude Sonnet 5.5', profile: 'Equilíbrio para trabalho diário de criação e código.', inputUsdPerMillion: 2, outputUsdPerMillion: 10, costTier: 'Médio' },
    { id: 'haiku', name: 'Claude Haiku 5.5', profile: 'Rápido e econômico para tarefas simples e objetivas.', inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5, costTier: 'Baixo' },
  ],
};

export const MODEL_CATALOG_CHECKED_AT = '2026-11-05';
