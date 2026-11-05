import { useState, type FormEvent } from 'react';
import { ArrowRight, ExternalLink, FileImage, FileText, Image as ImageIcon, Palette, Pencil, Plus, Upload, X } from 'lucide-react';
import type { Brand, BrandReference } from '../shared/contracts';
import { Empty, Modal, PageHeading } from './components';
import { invoke, type ScreenProps } from './state';

interface DraftReference {
  id?: string;
  name: string;
  path: string;
  kind: BrandReference['kind'];
  url?: string;
}

const initialColors = ['#F97316', '#121110', '#FAFAFA'];

function inferKind(path: string): BrandReference['kind'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json')) return 'document';
  return 'image';
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function Brands({ snapshot, run, refresh, busy }: ScreenProps) {
  const [editing, setEditing] = useState<Partial<Brand> | null>(null);
  const [name, setName] = useState('');
  const [tone, setTone] = useState('');
  const [colors, setColors] = useState<string[]>(initialColors);
  const [logo, setLogo] = useState<string | undefined>();
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [references, setReferences] = useState<DraftReference[]>([]);

  function edit(brand?: Brand) {
    setEditing(brand ?? {});
    setName(brand?.name ?? '');
    setTone(brand?.tone ?? '');
    setColors(brand?.colors.length ? [...brand.colors] : [...initialColors]);
    setLogo(brand?.logo);
    setLogoUrl(brand?.logoUrl);
    setReferences(
      brand?.references?.map(ref => ({
        id: ref.id,
        name: ref.name,
        path: ref.path,
        kind: ref.kind,
        url: ref.url,
      })) ?? [],
    );
  }

  async function pickLogo() {
    const path = await run('logo', () => invoke<string | undefined>('app.pick', { extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif'] }));
    if (path) {
      setLogo(path);
      setLogoUrl(undefined);
    }
  }

  async function pickReferences() {
    const picked = await run('brand-refs', () =>
      invoke<string[] | string | undefined>('app.pick', {
        multiple: true,
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif', 'pdf', 'md', 'txt', 'json'],
      }),
    );
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    setReferences(current => {
      const existingPaths = new Set(current.map(item => item.path));
      const added: DraftReference[] = [];
      for (const path of paths) {
        if (!path || existingPaths.has(path)) continue;
        existingPaths.add(path);
        added.push({ name: fileName(path), path, kind: inferKind(path) });
      }
      return [...current, ...added];
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const saved = await run(
      'brand-save',
      () =>
        invoke<Brand>('brands.save', {
          id: editing?.id,
          name,
          tone,
          colors,
          logo: logo ?? '',
          references: references.map(ref => ({ id: ref.id, name: ref.name, path: ref.path })),
        }),
      'Identidade e referências da marca salvas.',
    );
    if (saved) {
      setEditing(null);
      await refresh();
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="CONSISTÊNCIA EM CADA CRIAÇÃO"
        title="Marcas & Referências"
        description="Guarde logo, paleta, tom de voz, fotos de referência e PDFs de manual de marca para guiar o PostNow e o VideoGo."
        actions={
          <button className="button primary" onClick={() => edit()}>
            <Plus size={16} />Nova marca
          </button>
        }
      />

      {snapshot.brands.length === 0 ? (
        <Empty
          icon={<Palette />}
          title="Dê uma identidade às suas ideias"
          action={
            <button className="button primary" onClick={() => edit()}>
              <Plus size={16} />Criar primeira marca
            </button>
          }
        >
          Cadastre logo oficial, paleta de cores, fotos do especialista, referências visuais e PDFs de brandbook para que os agentes criem sempre no estilo da marca.
        </Empty>
      ) : (
        <div className="brand-grid">
          {snapshot.brands.map(brand => {
            const photos = brand.references.filter(ref => ref.kind === 'image');
            const docs = brand.references.filter(ref => ref.kind !== 'image');
            return (
              <article className="brand-card" key={brand.id}>
                <div className="brand-card-top">
                  <div className="brand-identity-head">
                    {brand.logoUrl ? (
                      <img className="brand-logo-thumb" src={brand.logoUrl} alt={`Logo ${brand.name}`} />
                    ) : (
                      <div className="brand-monogram">{brand.name.slice(0, 2).toLocaleUpperCase('pt-BR')}</div>
                    )}
                    <div>
                      <h2>{brand.name}</h2>
                      <span className="muted">{snapshot.projects.filter(project => project.brandId === brand.id).length} projeto(s) vinculado(s)</span>
                    </div>
                  </div>
                  <button className="icon-button" aria-label={`Editar marca ${brand.name}`} onClick={() => edit(brand)}>
                    <Pencil size={15} />
                  </button>
                </div>

                <p>{brand.tone || 'Tom de voz ainda não definido.'}</p>

                <div className="brand-swatches">
                  {brand.colors.map((color, index) => (
                    <span key={`${color}-${index}`} style={{ background: color }} title={color} aria-label={`Cor ${color}`} />
                  ))}
                </div>

                {brand.references.length > 0 && (
                  <div className="brand-refs-strip" aria-label="Referências anexadas">
                    {photos.slice(0, 4).map(ref => (
                      <button
                        key={ref.id}
                        type="button"
                        className="brand-ref-Mini"
                        title={`Abrir foto: ${ref.name}`}
                        onClick={() => { void run(`open-${ref.id}`, () => invoke('app.open', { path: ref.path })); }}
                      >
                        <img src={ref.url} alt={ref.name} loading="lazy" />
                      </button>
                    ))}
                    {docs.map(ref => (
                      <button
                        key={ref.id}
                        type="button"
                        className="brand-doc-pill"
                        title={`Abrir documento: ${ref.name}`}
                        onClick={() => { void run(`open-${ref.id}`, () => invoke('app.open', { path: ref.path })); }}
                      >
                        <FileText size={13} />
                        <span>{ref.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="brand-card-footer">
                  <span>{brand.logo ? '✓ Logo oficial' : 'Sem logo'}</span>
                  <span>
                    {photos.length} foto(s) · {docs.length} PDF/doc(s)
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal wide title={editing.id ? 'Editar identidade e referências' : 'Nova identidade de marca'} onClose={() => { if (!busy.has('brand-save')) setEditing(null); }}>
          <form onSubmit={event => { void save(event); }}>
            <fieldset disabled={busy.has('brand-save')}>
              <label>
                Nome da marca
                <input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={120} required placeholder="Como sua marca ou cliente se chama?" />
              </label>

              <label>
                Tom de voz e diretrizes
                <textarea rows={3} value={tone} onChange={event => setTone(event.target.value)} maxLength={10000} placeholder="Ex.: Direto, acolhedor e técnico. Sem jargões; foco em autoridade e clareza visual." />
              </label>

              <div className="field-label">Paleta de cores</div>
              <div className="palette-editor">
                {colors.map((color, index) => (
                  <div className="palette-item" key={index}>
                    <input type="color" aria-label={`Escolher cor ${index + 1}`} value={color} onChange={event => setColors(current => current.map((entry, i) => i === index ? event.target.value : entry))} />
                    <span>{color.toUpperCase()}</span>
                    <button type="button" className="icon-button" aria-label={`Remover cor ${index + 1}`} disabled={colors.length === 1} onClick={() => setColors(current => current.filter((_, i) => i !== index))}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {colors.length < 8 && (
                  <button type="button" className="button small secondary" onClick={() => setColors(current => [...current, '#FFFFFF'])}>
                    <Plus size={14} />Cor
                  </button>
                )}
              </div>

              <div className="field-label">Logo oficial da marca</div>
              <div className="logo-picker">
                {logoUrl ? (
                  <img className="brand-logo-thumb" src={logoUrl} alt="Prévia da logo" />
                ) : (
                  <FileImage size={24} className="icon-ok" />
                )}
                <span>
                  <strong>{logo ? fileName(logo) : 'Nenhuma logo selecionada'}</strong>
                  <small>PNG, JPG, WebP ou SVG · cópia isolada no cofre da marca</small>
                </span>
                <button className="button small secondary" type="button" onClick={() => { void pickLogo(); }} disabled={busy.has('logo')}>
                  <Upload size={14} />{logo ? 'Trocar logo' : 'Escolher logo'}
                </button>
                {logo && (
                  <button className="icon-button" type="button" aria-label="Remover logo" onClick={() => { setLogo(undefined); setLogoUrl(undefined); }}>
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="references-section">
                <div className="references-header">
                  <div>
                    <div className="field-label">Fotos, PDFs e Referências Visuais ({references.length})</div>
                    <small className="field-help">Adicione fotos do especialista, referências de carrossel/estilo, PDFs de manual da marca ou guias em texto.</small>
                  </div>
                  <button type="button" className="button small secondary" onClick={() => { void pickReferences(); }} disabled={busy.has('brand-refs')}>
                    <Plus size={14} />Adicionar fotos ou PDFs
                  </button>
                </div>

                {references.length === 0 ? (
                  <div className="references-empty">
                    <span>Nenhuma foto ou PDF de referência adicionado ainda.</span>
                  </div>
                ) : (
                  <div className="reference-grid">
                    {references.map((ref, index) => (
                      <div className="reference-item" key={`${ref.path}-${index}`}>
                        <div className="reference-thumb">
                          {ref.kind === 'image' && ref.url ? (
                            <img src={ref.url} alt={ref.name} loading="lazy" />
                          ) : ref.kind === 'image' ? (
                            <ImageIcon size={20} className="icon-ok" />
                          ) : (
                            <FileText size={20} className="icon-ok" />
                          )}
                          <span className="reference-badge">{ref.kind === 'pdf' ? 'PDF' : ref.kind === 'image' ? 'FOTO' : 'DOC'}</span>
                        </div>
                        <div className="reference-info">
                          <strong title={ref.name}>{ref.name}</strong>
                          <small>{ref.url ? 'Salvo na marca' : 'Novo arquivo · será copiado ao salvar'}</small>
                        </div>
                        <div className="reference-actions">
                          {ref.url && (
                            <button
                              type="button"
                              className="icon-button"
                              title="Abrir arquivo"
                              aria-label={`Abrir ${ref.name}`}
                              onClick={() => { void invoke('app.open', { path: ref.path }); }}
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-button"
                            title="Remover referência"
                            aria-label={`Remover ${ref.name}`}
                            onClick={() => setReferences(current => current.filter((_, i) => i !== index))}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancelar</button>
                <button className="button primary" type="submit">
                  {busy.has('brand-save') ? 'Salvando…' : 'Salvar marca'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
