import { useId, useState } from 'react';
import { Palette } from 'lucide-react';
import type { VisualStyle } from '../shared/contracts';
import { MAX_CUSTOM_VIDEO_STYLE, videoStyles } from '../shared/prompt-library';

export interface VideoStyleChoice { styleId?: string; custom?: string; }

const PRESETS = videoStyles();

/** Troca do estilo visual do vídeo: estilos prontos e/ou texto livre. Usado na etapa de render e na revisão do vídeo. */
export function VideoStylePanel({ current, disabled, defaultOpen, onApply }: { current?: VisualStyle; disabled: boolean; defaultOpen: boolean; onApply: (choice: VideoStyleChoice) => void }) {
  const [styleId, setStyleId] = useState('');
  const [custom, setCustom] = useState('');
  const fieldId = useId();
  const canApply = !disabled && (styleId !== '' || custom.trim() !== '');
  const picked = PRESETS.find(style => style.id === styleId);
  return (
    <details className="video-production video-style-panel" open={defaultOpen || undefined}>
      <summary className="assets-summary"><h2><Palette size={16} /> Estilo visual do vídeo</h2></summary>
      <p className="field-help">
        {current ? `Estilo atual: ${current.title}. ` : 'Este vídeo ainda não tem um estilo escolhido. '}
        Escolha um estilo pronto, descreva o seu ou combine os dois. O agente refaz só a linguagem visual (cenas, cores, tipografia, ritmo e transições) e mantém roteiro, fatos, fontes e a narração já gerada. Depois você aprova e renderiza de novo.
      </p>
      <div className="studio-styles" role="group" aria-label="Estilos prontos">
        {PRESETS.map(style => (
          <button key={style.id} type="button" disabled={disabled} aria-pressed={styleId === style.id} className={`studio-chip ${styleId === style.id ? 'active' : ''}`} onClick={() => setStyleId(value => (value === style.id ? '' : style.id))}>
            {style.title}
          </button>
        ))}
      </div>
      {picked && <p className="field-help">{picked.direction}</p>}
      <label htmlFor={fieldId}>{picked ? 'Ajustes ao estilo (opcional)' : 'Ou descreva o estilo que você quer'}</label>
      <textarea id={fieldId} className="project-editor" rows={3} maxLength={MAX_CUSTOM_VIDEO_STYLE} value={custom} disabled={disabled} onChange={event => setCustom(event.target.value)} placeholder="Ex.: visual minimalista, fundo escuro, texto grande em amarelo, cortes secos; ou cole aqui um prompt de estilo." />
      <div className="heading-actions">
        <button type="button" className="button small secondary" disabled={!canApply} onClick={() => { onApply({ ...(styleId ? { styleId } : {}), ...(custom.trim() ? { custom } : {}) }); }}>
          <Palette size={15} />Aplicar estilo ao vídeo
        </button>
      </div>
    </details>
  );
}
