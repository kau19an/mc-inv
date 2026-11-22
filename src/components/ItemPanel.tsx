// painel de detalhes do item: render ampliada, nome e seções de informação. cada seção só aparece se houver
// dado pra ela — as próximas fases (receitas, propriedades, quebra…) entram como novas seções nessa lista
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TabInfo } from '@/lib/gui/creative.ts';
import { textOf, type VersionData } from '@/lib/gui/data.ts';
import { iconCanvas } from '@/lib/gui/icons.ts';
import { baseId } from '@/lib/gui/routes.ts';

const PREVIEW_CSS_SIZE = 96; // px de css da render ampliada (6× o slot)

interface Props {
  data: VersionData;
  itemKey: string | null;
  onClose: () => void;
  onShowInTab: (tabIndex: number, itemKey: string) => void;
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="border-t border-white/10 pt-3">
      <h3 class="mb-2 text-xs font-semibold tracking-wider text-violet-300 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Preview({ data, itemKey }: { data: VersionData; itemKey: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // render direto no tamanho final em pixels reais: blocos 3D ficam nítidos, itens chapados viram pixels grandes
    const size = Math.round(PREVIEW_CSS_SIZE * (window.devicePixelRatio || 1));
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    const icon = iconCanvas(data, itemKey, size);
    if (icon) ctx.drawImage(icon, 0, 0);
  }, [data, itemKey]);
  return <canvas ref={ref} class="mx-auto" style={{ width: `${PREVIEW_CSS_SIZE}px`, height: `${PREVIEW_CSS_SIZE}px` }} aria-hidden="true" />;
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [id]);
  return (
    <button
      type="button"
      class="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-yellow-300"
      onClick={() => navigator.clipboard?.writeText(id).then(() => setCopied(true))}
    >
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  );
}

export default function ItemPanel({ data, itemKey, onClose, onShowInTab }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (itemKey) headingRef.current?.focus({ preventScroll: true });
  }, [itemKey]);

  if (!itemKey) {
    return (
      <aside class="grid place-items-center rounded-lg lg:h-full border border-dashed border-white/15 p-6 text-center text-sm text-neutral-500" aria-label="Detalhes do item">
        <p>
          <span class="pointer-coarse:hidden">Clique</span>
          <span class="hidden pointer-coarse:inline">Toque</span> num item pra ver os detalhes dele.
        </p>
      </aside>
    );
  }

  const item = data.items[itemKey];
  const id = baseId(itemKey);
  const name = item ? textOf(data, item.name) : id;
  const englishName = item ? textOf(data, item.name, data.fallbackLang) : id;
  const tabs = data.tabs.map((tab, index) => ({ tab, index })).filter(({ tab }: { tab: TabInfo }) => tab.type === 'category' && tab.items.some((key) => baseId(key) === id));
  const tags = data.itemTags[id] ?? [];

  return (
    <aside
      class="relative flex flex-col lg:h-full gap-3 overflow-y-auto rounded-lg border-2 border-[#5000ff]/60 bg-[#100010]/95 p-4 text-sm text-neutral-200 shadow-[inset_0_0_0_1px_#28007f]"
      aria-labelledby="item-panel-title"
    >
      <button
        type="button"
        class="absolute top-2 right-2 grid size-8 place-items-center rounded text-lg text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-yellow-300"
        aria-label="Fechar detalhes"
        onClick={onClose}
      >
        ×
      </button>

      <Preview data={data} itemKey={itemKey} />
      <div class="text-center">
        <h2 ref={headingRef} id="item-panel-title" tabIndex={-1} class="text-lg font-semibold text-white outline-none">
          {name}
        </h2>
        {englishName !== name && (
          <p class="text-neutral-400" lang="en">
            {englishName}
          </p>
        )}
        <p class="mt-1 flex items-center justify-center gap-1">
          <code class="text-xs text-neutral-300">minecraft:{id}</code>
          <CopyId id={`minecraft:${id}`} />
        </p>
      </div>

      {tabs.length > 0 && (
        <Section title="Onde fica no inventário">
          <ul class="flex flex-wrap gap-2">
            {tabs.map(({ tab, index }) => (
              <li key={tab.id}>
                <button
                  type="button"
                  class="rounded border border-white/15 px-2 py-1 hover:border-violet-400 hover:text-white focus-visible:outline-2 focus-visible:outline-yellow-300"
                  onClick={() => onShowInTab(index, itemKey)}
                >
                  {textOf(data, tab.name)}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tags.length > 0 && (
        <Section title={`Marcações (${tags.length})`}>
          <ul class="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag}>
                <code class="rounded bg-white/5 px-1.5 py-0.5 text-xs text-fuchsia-300">#{tag.includes(':') ? tag : `minecraft:${tag}`}</code>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p class="border-t border-white/10 pt-3 text-xs text-neutral-500">Receitas, propriedades e mais detalhes chegam nas próximas etapas.</p>
    </aside>
  );
}
