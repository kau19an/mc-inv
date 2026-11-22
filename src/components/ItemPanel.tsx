// painel de detalhes do item, com a cara da interface do jogo: moldura recortada do próprio fundo do inventário,
// render ampliada dentro de um slot, texto na fonte do jogo e botões do jogo. tudo medido em pixels da gui (--u).
// cada seção só aparece se houver dado — as próximas fases (receitas, propriedades, quebra…) entram nessa lista
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CrossButton, FRAME_CLASS, GuiButton, frameStyle, gameText, hex, u } from './gui/GuiParts.tsx';
import { textOf, type VersionData } from '@/lib/gui/data.ts';
import { iconCanvas } from '@/lib/gui/icons.ts';
import { baseId } from '@/lib/gui/routes.ts';

const PREVIEW_SCALE = 3; // render ampliada: 3× o tamanho do item no slot
const TEXT = 0x404040; // a cor do título do inventário
const MUTED = 0x707070;
const TAG = 0xaa00aa; // roxo escuro (§5), a cor das marcações na tooltip do jogo

interface Props {
  data: VersionData;
  scale: number; // pixels reais por pixel da gui
  itemKey: string | null;
  onClose: () => void;
  onShowInTab: (tabIndex: number, itemKey: string) => void;
}

// título de seção com um "sulco" embaixo (linha escura + linha clara, como as divisórias do jogo)
function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section style={{ marginTop: u(6) }}>
      <h3 style={{ color: hex(TEXT), borderBottom: `${u(1)} solid #8b8b8b`, boxShadow: `0 ${u(1)} 0 #ffffff`, paddingBottom: u(1), marginBottom: u(4) }}>{title}</h3>
      {children}
    </section>
  );
}

function Preview({ data, scale, itemKey }: { data: VersionData; scale: number; itemKey: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = 16 * PREVIEW_SCALE;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // render direto em pixels reais: blocos 3D nítidos, itens chapados com pixels grandes
    canvas.width = canvas.height = size * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const icon = iconCanvas(data, itemKey, size * scale);
    if (icon) ctx.drawImage(icon, 0, 0);
  }, [data, itemKey, scale]);
  return (
    <div class={`${FRAME_CLASS} mx-auto box-content`} style={{ ...frameStyle(data, 'slot'), width: u(size + 2 * PREVIEW_SCALE - 2), height: u(size + 2 * PREVIEW_SCALE - 2) }}>
      <canvas ref={ref} aria-hidden="true" class="block" style={{ width: u(size), height: u(size), margin: u(PREVIEW_SCALE - 1) }} />
    </div>
  );
}

export default function ItemPanel({ data, scale, itemKey, onClose, onShowInTab }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
    if (itemKey) headingRef.current?.focus({ preventScroll: true });
  }, [itemKey]);

  const panel = { ...gameText, ...frameStyle(data, 'panel'), color: hex(TEXT) };

  if (!itemKey) {
    return (
      <aside class={`${FRAME_CLASS} grid h-full place-items-center text-center`} style={{ ...panel, padding: u(8) }} aria-label="Detalhes do item">
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
  const tabs = data.tabs.map((tab, index) => ({ tab, index })).filter(({ tab }) => tab.type === 'category' && tab.items.some((key) => baseId(key) === id));
  const tags = data.itemTags[id] ?? [];
  const fullId = `minecraft:${id}`;

  return (
    <aside
      class={`${FRAME_CLASS} relative h-full overflow-y-auto [scrollbar-color:#8b8b8b_transparent] [scrollbar-width:thin]`}
      style={{ ...panel, padding: `${u(4)} ${u(4)} ${u(6)}` }}
      aria-labelledby="item-panel-title"
    >
      <CrossButton data={data} label="Fechar detalhes" onClick={onClose} style={{ position: 'absolute', top: u(3), right: u(3) }} />

      <div style={{ marginTop: u(4) }}>
        <Preview data={data} scale={scale} itemKey={itemKey} />
      </div>
      <div class="text-center" style={{ marginTop: u(4) }}>
        <h2 ref={headingRef} id="item-panel-title" tabIndex={-1} class="outline-none">
          {name}
        </h2>
        {englishName !== name && (
          <p lang="en" style={{ color: hex(MUTED) }}>
            {englishName}
          </p>
        )}
        <p class="flex flex-wrap items-center justify-center" style={{ gap: u(3), marginTop: u(2) }}>
          <code class="select-all" style={{ fontFamily: 'inherit', color: hex(MUTED) }}>
            {fullId}
          </code>
          <GuiButton data={data} onClick={() => navigator.clipboard?.writeText(fullId).then(() => setCopied(true))}>
            {copied ? 'Copiado!' : 'Copiar'}
          </GuiButton>
        </p>
      </div>

      {tabs.length > 0 && (
        <Section title="Onde fica no inventário">
          <ul class="flex flex-wrap" style={{ gap: u(2) }}>
            {tabs.map(({ tab, index }) => (
              <li key={tab.id}>
                <GuiButton data={data} onClick={() => onShowInTab(index, itemKey)}>
                  {textOf(data, tab.name)}
                </GuiButton>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tags.length > 0 && (
        <Section title={`Marcações (${tags.length})`}>
          <ul style={{ color: hex(TAG) }}>
            {tags.map((tag) => (
              <li key={tag} class="break-all">
                #{tag.includes(':') ? tag : `minecraft:${tag}`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p style={{ color: hex(MUTED), marginTop: u(6) }}>Receitas, propriedades e mais detalhes chegam nas próximas etapas.</p>
    </aside>
  );
}
