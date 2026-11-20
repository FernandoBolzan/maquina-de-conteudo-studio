import { useState, type FormEvent } from 'react';
import { ArrowRight, ExternalLink, FileImage, FileText, Image as ImageIcon, Palette, Pencil, Plus, Shapes, Upload, User, X } from 'lucide-react';
import { ELEMENT_ATTACH_LIMIT, IMAGEGEN_REFERENCE_LIMIT, PORTRAIT_ATTACH_LIMIT } from '../shared/brand-references';
import type { Brand, BrandReference } from '../shared/contracts';
import { Empty, Modal, PageHeading } from './components';
import { invoke, type ScreenProps } from './state';

interface DraftReference {
  id?: string;
  name: string;
  path: string;
  kind: BrandReference['kind'];
  url?: string;
  portrait?: boolean;
  element?: boolean;
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

/** Logo salva no cofre tem nome UUID; mostra um rótulo legível em vez dele. */
function logoLabel(path: string): string {
  const name = fileName(path);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(name) ? 'Logo salva na marca' : name;
}

interface ReferenceTileProps {
  reference: DraftReference;
  index: number;
  mode: 'person' | 'reference';
  primary?: boolean;
  onChange: (index: number, patch: Partial<DraftReference>) => void;
  onRemove: (index: number) => void;
}

/** Um arquivo da marca: a mesma peça serve para a seção de fotos da pessoa e para a de referências, só muda o papel. */
function ReferenceTile({ reference: ref, index, mode, primary = false, onChange, onRemove }: ReferenceTileProps) {
  return (
    <div className="reference-item">
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
        {mode === 'person' ? (
          <div className="reference-roles">
            <small>{primary ? 'Retrato oficial da pessoa' : 'Foto da pessoa'}</small>
            <button type="button" className="portrait-toggle" title="Esta imagem não mostra a pessoa: mover para as referências" onClick={() => onChange(index, { portrait: false })}>Mover para referências</button>
          </div>
        ) : ref.kind === 'image' ? (
          <div className="reference-roles">
            {!ref.element && <small>Arte de referência</small>}
            <button
              type="button"
              className={`portrait-toggle${ref.element ? ' is-on' : ''}`}
              aria-pressed={ref.element === true}
              title={ref.element ? 'Clique para voltar a ser arte de referência' : 'Usar esta imagem dentro das artes (logo ou produto de outra marca)'}
              onClick={() => onChange(index, { element: !ref.element })}
            >
              <Shapes size={11} aria-hidden="true" />{ref.element ? 'Elemento da arte' : 'Usar na arte'}
            </button>
            <button type="button" className="portrait-toggle" title="Esta imagem mostra a pessoa da marca: mover para as fotos da pessoa" onClick={() => onChange(index, { portrait: true, element: false })}>
              <User size={11} aria-hidden="true" />É foto da pessoa
            </button>
          </div>
        ) : null}
      </div>
      <div className="reference-actions">
        {ref.url && (
          <button type="button" className="icon-button" title="Abrir arquivo" aria-label={`Abrir ${ref.name}`} onClick={() => { void invoke('app.open', { path: ref.path }); }}>
            <ExternalLink size={13} />
          </button>
        )}
        <button type="button" className="icon-button" title="Remover" aria-label={`Remover ${ref.name}`} onClick={() => onRemove(index)}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
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
        portrait: ref.portrait === true,
        element: ref.element === true,
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

  /** Envio separado: as fotos da pessoa entram com o papel de retrato; as referências entram como arte de referência (ou documento). */
  async function pick(kind: 'people' | 'references') {
    const people = kind === 'people';
    const picked = await run(people ? 'brand-people' : 'brand-refs', () =>
      invoke<string[] | string | undefined>('app.pick', {
        multiple: true,
        extensions: people ? ['png', 'jpg', 'jpeg', 'webp'] : ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif', 'pdf', 'md', 'txt', 'json'],
      }),
    );
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    setReferences(current => {
      const known = new Set(current.map(item => item.path));
      const added: DraftReference[] = [];
      for (const path of paths) {
        if (!path || known.has(path)) continue;
        known.add(path);
        added.push({ name: fileName(path), path, kind: inferKind(path), ...(people ? { portrait: true } : {}) });
      }
      return [...current, ...added];
    });
  }
  // Uma imagem que passa a ser foto da pessoa vai para o fim da lista: o retrato oficial é a primeira foto, e mover uma imagem não pode trocá-lo sem querer.
  const changeReference = (index: number, patch: Partial<DraftReference>) => setReferences(current => {
    const updated = current.map((item, i) => (i === index ? { ...item, ...patch } : item));
    return patch.portrait === true ? [...updated.filter((_, i) => i !== index), updated[index]!] : updated;
  });
  const removeReference = (index: number) => setReferences(current => current.filter((_, i) => i !== index));

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
          references: references.map(ref => ({ id: ref.id, name: ref.name, path: ref.path, portrait: ref.portrait === true, element: ref.element === true })),
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
                  <strong>{logo ? logoLabel(logo) : 'Nenhuma logo selecionada'}</strong>
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

              <div className="references-section people-section">
                <div className="references-header">
                  <div>
                    <div className="field-label">Fotos da pessoa ({references.filter(ref => ref.portrait).length})</div>
                    <small className="field-help">Envie uma ou mais fotos de rosto da pessoa da marca. É só com elas que a IA mostra a pessoa nas artes.</small>
                  </div>
                  <button type="button" className="button small secondary" onClick={() => { void pick('people'); }} disabled={busy.has('brand-people')}>
                    <Plus size={14} />Adicionar fotos da pessoa
                  </button>
                </div>
                <p className="field-help references-portrait-help">
                  A primeira foto é o retrato oficial e a IA recebe até {PORTRAIT_ATTACH_LIMIT} fotos por vez. Com pelo menos uma foto da pessoa, a capa e o último slide passam a mostrar essa pessoa.
                </p>
                {references.some(ref => ref.portrait) ? (
                  <div className="reference-grid">
                    {references.map((ref, index) => ref.portrait ? (
                      <ReferenceTile key={`${ref.path}-${index}`} reference={ref} index={index} mode="person" primary={references.findIndex(item => item.portrait) === index} onChange={changeReference} onRemove={removeReference} />
                    ) : null)}
                  </div>
                ) : (
                  <div className="references-empty">
                    <span>Nenhuma foto da pessoa ainda. Sem foto, as artes não mostram a pessoa.</span>
                  </div>
                )}
              </div>

              <div className="references-section">
                <div className="references-header">
                  <div>
                    <div className="field-label">Referências da marca ({references.filter(ref => !ref.portrait).length})</div>
                    <small className="field-help">Artes, PDFs e documentos que mostram o nosso padrão visual. Servem só de estilo: as pessoas que aparecem nelas não são usadas nas artes.</small>
                  </div>
                  <button type="button" className="button small secondary" onClick={() => { void pick('references'); }} disabled={busy.has('brand-refs')}>
                    <Plus size={14} />Adicionar referências
                  </button>
                </div>
                {references.some(ref => !ref.portrait && ref.kind === 'image') && (
                  <div className="field-help references-roles-legend">
                    <ul>
                      <li><b>Arte de referência</b> (sem marcação): o nosso padrão visual, que a IA segue ao criar.</li>
                      <li><b>Usar na arte</b>: algo que deve aparecer nas artes, como a logo de outra marca (até {ELEMENT_ATTACH_LIMIT} por vez).</li>
                    </ul>
                    <span>
                      O gerador recebe até {IMAGEGEN_REFERENCE_LIMIT} imagens por vez: primeiro as fotos da pessoa e os elementos, depois as artes na ordem da lista.
                      {references.filter(ref => !ref.portrait && ref.kind === 'image').length > IMAGEGEN_REFERENCE_LIMIT ? ` Esta marca tem ${references.filter(ref => !ref.portrait && ref.kind === 'image').length} artes; as que não couberem ficam só como texto.` : ''}
                    </span>
                  </div>
                )}
                {references.some(ref => !ref.portrait) ? (
                  <div className="reference-grid">
                    {references.map((ref, index) => !ref.portrait ? (
                      <ReferenceTile key={`${ref.path}-${index}`} reference={ref} index={index} mode="reference" onChange={changeReference} onRemove={removeReference} />
                    ) : null)}
                  </div>
                ) : (
                  <div className="references-empty">
                    <span>Nenhuma referência adicionada ainda.</span>
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
