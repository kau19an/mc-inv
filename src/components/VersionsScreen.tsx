// tela "Versões...": escolher a versão do jogo mostrada no inventário. imita as telas de lista do jogo
// (seleção de idioma, de mundo): título e controles no cabeçalho, linha separadora, a lista sobre o fundo de lista,
// outra linha separadora e o "Concluído" no rodapé.
// escolher já aplica (não tem "Confirmar"): clicar numa linha, as setas do teclado ou os atalhos "Mais recente" e
// "Snapshot", que seguem a mais recente de cada tipo (quando sair uma nova, o site passa pra ela)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FRAME_CLASS, GuiButton, fitWidth, frameStyle, gameText, hex, textShadow, u } from './gui/GuiParts.tsx';
import GameTextField from './gui/GameTextField.tsx';
import { LATEST_RELEASE, LATEST_SNAPSHOT, type VersionData, type VersionEntry, type VersionList } from '@/lib/gui/data.ts';
import { HTML_LANG, type Strings } from '@/lib/gui/strings.ts';
import type { Settings } from '@/lib/gui/settings.ts';
import { translate } from '@/lib/gui/text.ts';
import { UI_KEYS } from '@/lib/gui/ui-keys.ts';

const ROW_WIDTH = 304; // a largura das duas colunas de opções (cabe a busca e os dois atalhos alinhados)
const ROW_HEIGHT = 24; // duas linhas de texto: versão e, embaixo, tipo (ou destaque) · data
const BUTTON_WIDTH = 150;
const GAP = 4;
const DONE_WIDTH = 200;
const HEADER_LINE = 2; // header_separator / footer_separator têm 2 px
const FOOTER_HEIGHT = 33; // rodapé do HeaderAndFooterLayout
const SCROLLBAR_WIDTH = 6; // AbstractScrollArea
const SCROLLBAR_GAP = 2; // scrollBarX = direita da linha + largura da barra + 2 → a barra fica 2 px depois de um espaço de 6
const MIN_SCROLLER = 32;
const GRAY = 0xa0a0a0;
const LATEST_RELEASE_COLOR = 0x55ff55; // §a
const LATEST_SNAPSHOT_COLOR = 0xffff55; // §e
const OUTLINE_FOCUSED = 0xffffff; // AbstractSelectionList: contorno branco com a lista em foco, cinza sem foco
const OUTLINE_UNFOCUSED = 0x808080;

interface Props {
  data: VersionData;
  list: VersionList;
  settings: Settings;
  current: string; // id da versão escolhida (a que o contorno marca)
  strings: Strings;
  unit: number; // px de css por pixel da gui
  onChange: (change: Partial<Settings>) => void;
  onClose: () => void;
}

// textura repetida em blocos, no tamanho da gui (fundo de menu, fundo de lista, separadores)
function tileStyle(data: VersionData, name: string, fallback: string) {
  const tile = data.gui.tiles?.[name];
  if (!tile) return { background: fallback };
  return { backgroundImage: `url("${tile.src}")`, backgroundSize: `${u(tile.width)} ${u(tile.height)}`, imageRendering: 'pixelated' as const };
}

export default function VersionsScreen({ data, list, settings, current, strings, unit, onChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [listFocused, setListFocused] = useState(false);
  const [scroll, setScroll] = useState({ top: 0, height: 0, content: 0 });
  const t = (key: string) => translate(data, key);
  const htmlLang = HTML_LANG[settings.locale];
  // largura das linhas: 304 ou, em tela estreita, o que couber (sobrando lugar pra barra de rolagem)
  const rowWidth = fitWidth(ROW_WIDTH, unit) - (fitWidth(ROW_WIDTH, unit) < ROW_WIDTH ? (SCROLLBAR_WIDTH + SCROLLBAR_GAP) * 2 : 0);
  const buttonWidth = Math.min(BUTTON_WIDTH, Math.floor((rowWidth - GAP) / 2));

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(htmlLang, { dateStyle: 'medium' }), [htmlLang]);
  const kindName = (entry: VersionEntry) => strings.versionKinds[entry.kind] ?? entry.kind;

  // busca: todas as palavras no id ou no tipo ("snapshot 26.4", "pré")
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const shown = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return list.versions;
    return list.versions.filter((entry) => {
      const haystack = normalize(`${entry.id} ${kindName(entry)}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [query, list, strings]);

  const select = (id: string) => onChange({ version: id });

  // a versão selecionada fica à vista ao abrir (centralizada, como o centerScrollOn do jogo) e ao mudar pelo teclado
  const rowId = (id: string) => `version-${id.replace(/[^a-z0-9-]/gi, '_')}`;
  const scrollToSelected = (center: boolean) => {
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>(`#${CSS.escape(rowId(current))}`);
    if (!box || !row) return;
    if (center) box.scrollTop = row.offsetTop + row.offsetHeight / 2 - box.clientHeight / 2;
    else row.scrollIntoView({ block: 'nearest' });
  };
  useLayoutEffect(() => scrollToSelected(true), []);
  useLayoutEffect(() => scrollToSelected(false), [current]);

  // barra de rolagem desenhada como a do jogo (widget/scroller sobre widget/scroller_background); a rolagem em si
  // é a do navegador (roda do mouse, toque, teclado), com a barra nativa escondida
  const measure = () => {
    const box = listRef.current;
    if (box) setScroll({ top: box.scrollTop, height: box.clientHeight, content: box.scrollHeight });
  };
  useLayoutEffect(() => {
    measure();
    const box = listRef.current;
    if (!box) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [shown]);
  const maxScroll = Math.max(scroll.content - scroll.height, 0);
  const scrollerHeight = Math.min(Math.max(scroll.height ? (scroll.height * scroll.height) / Math.max(scroll.content, 1) : 0, MIN_SCROLLER * unitOf(listRef.current)), Math.max(scroll.height - 8, 0));
  const scrollerTop = maxScroll ? (scroll.top / maxScroll) * (scroll.height - scrollerHeight) : 0;
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  // teclado na lista: setas, Home e End escolhem a versão (e já aplicam, como o clique)
  const onListKey = (event: KeyboardEvent) => {
    if (!shown.length) return;
    const index = shown.findIndex((entry) => entry.id === current);
    const target =
      event.key === 'ArrowDown' ? Math.min(index + 1, shown.length - 1) : event.key === 'ArrowUp' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? shown.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    select(shown[target === -1 ? 0 : target]!.id);
  };

  const outline = listFocused ? OUTLINE_FOCUSED : OUTLINE_UNFOCUSED;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="versions-title"
      lang={htmlLang}
      class="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 text-white backdrop-blur-[var(--menu-blur)] backdrop:bg-transparent"
      style={{ ...gameText, ...tileStyle(data, 'menu_background', 'rgb(0 0 0 / 0.7)') }}
      onClose={onClose}
    >
      <div class="flex h-full flex-col">
        {/* cabeçalho: título, busca e os dois atalhos */}
        <header class="flex shrink-0 flex-col items-center" style={{ padding: `${u(15)} ${u(8)} ${u(8)}`, gap: u(8) }}>
          <h2 id="versions-title" style={{ textShadow: textShadow(0xffffff) }}>
            {strings.versionsTitle}
          </h2>
          <div class="flex flex-col" style={{ width: u(rowWidth), gap: u(GAP) }}>
            <GameTextField data={data} value={query} label={strings.versionsSearch} placeholder={strings.versionsSearch} width={rowWidth} maxLength={64} onInput={setQuery} />
            <div class="flex" style={{ gap: u(GAP) }}>
              <GuiButton data={data} width={buttonWidth} label={strings.versionsLatest} aria-pressed={settings.version === LATEST_RELEASE} onClick={() => select(LATEST_RELEASE)} disabled={!list.latest.release} />
              <GuiButton data={data} width={buttonWidth} label={strings.versionsSnapshot} aria-pressed={settings.version === LATEST_SNAPSHOT} onClick={() => select(LATEST_SNAPSHOT)} disabled={!list.latest.snapshot} />
            </div>
          </div>
        </header>

        <div class="shrink-0" style={{ height: u(HEADER_LINE), ...tileStyle(data, 'header_separator', 'rgb(255 255 255 / 0.2)') }} />

        {/* a lista, sobre o fundo de lista do jogo */}
        <div class="relative min-h-0 flex-1" style={tileStyle(data, 'menu_list_background', 'rgb(0 0 0 / 0.44)')}>
          <div
            ref={listRef}
            role="listbox"
            tabIndex={0}
            aria-label={strings.versionsList}
            aria-activedescendant={shown.some((entry) => entry.id === current) ? rowId(current) : undefined}
            class="h-full overflow-y-auto outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ paddingBlock: u(4) }}
            onScroll={measure}
            onKeyDown={onListKey}
            onFocus={() => setListFocused(true)}
            onBlur={() => setListFocused(false)}
          >
            {shown.map((entry) => {
              const selected = entry.id === current;
              const latest = entry.id === list.latest.release ? { text: strings.latestReleaseTag, color: LATEST_RELEASE_COLOR } : entry.id === list.latest.snapshot ? { text: strings.latestSnapshotTag, color: LATEST_SNAPSHOT_COLOR } : null;
              return (
                <div
                  key={entry.id}
                  id={rowId(entry.id)}
                  role="option"
                  aria-selected={selected}
                  class="relative mx-auto cursor-pointer"
                  style={{
                    width: u(rowWidth),
                    height: u(ROW_HEIGHT),
                    // seleção do jogo: contorno de 1 px (branco com foco, cinza sem) e preto por dentro
                    ...(selected ? { background: '#000', boxShadow: `inset 0 0 0 ${u(1)} ${hex(outline)}` } : {}),
                  }}
                  onClick={() => {
                    select(entry.id);
                    listRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <span class="absolute" style={{ left: u(4), top: u(3), textShadow: textShadow(0xffffff) }}>
                    {entry.id}
                  </span>
                  {/* segunda linha: o tipo em cinza (ou, nas mais recentes, o destaque colorido no lugar dele) · a data */}
                  <span class="absolute truncate" style={{ left: u(4), right: u(4), top: u(13), color: hex(GRAY), textShadow: textShadow(GRAY) }}>
                    {latest ? <span style={{ color: hex(latest.color), textShadow: textShadow(latest.color) }}>{latest.text}</span> : kindName(entry)} ·{' '}
                    {dateFormat.format(new Date(entry.releaseTime))}
                  </span>
                </div>
              );
            })}
            {!shown.length && (
              <p class="text-center" style={{ marginTop: u(12), color: hex(GRAY), textShadow: textShadow(GRAY) }}>
                {strings.versionsEmpty}
              </p>
            )}
          </div>

          {/* barra de rolagem do jogo, só quando há o que rolar */}
          {maxScroll > 0 && data.gui.frames?.scroller && (
            <div
              aria-hidden="true"
              class={`${FRAME_CLASS} absolute`}
              style={{ ...frameStyle(data, 'scroller_background'), top: 0, bottom: 0, left: `calc(50% + ${u(rowWidth / 2 + SCROLLBAR_GAP)})`, width: u(SCROLLBAR_WIDTH) }}
            >
              <div
                class={`${FRAME_CLASS} absolute left-[calc(var(--u)*-1)] cursor-ns-resize touch-none`}
                style={{ ...frameStyle(data, 'scroller'), top: `calc(${scrollerTop}px - var(--u))`, height: `${scrollerHeight}px`, width: u(SCROLLBAR_WIDTH) }}
                onPointerDown={(event) => {
                  drag.current = { startY: event.clientY, startTop: listRef.current?.scrollTop ?? 0 };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const box = listRef.current;
                  if (!drag.current || !box) return;
                  const track = scroll.height - scrollerHeight;
                  if (track > 0) box.scrollTop = drag.current.startTop + ((event.clientY - drag.current.startY) / track) * maxScroll;
                }}
                onPointerUp={() => (drag.current = null)}
              />
            </div>
          )}
        </div>

        <div class="shrink-0" style={{ height: u(HEADER_LINE), ...tileStyle(data, 'footer_separator', 'rgb(255 255 255 / 0.2)') }} />

        <footer class="flex shrink-0 items-center justify-center" style={{ height: u(FOOTER_HEIGHT) }}>
          <GuiButton data={data} width={DONE_WIDTH} label={t(UI_KEYS.done)} onClick={() => dialogRef.current?.close()} />
        </footer>
      </div>
    </dialog>
  );
}

// px de css por pixel da gui, lido da variável --u (pra converter o tamanho mínimo da barra)
function unitOf(element: Element | null): number {
  if (!element) return 1;
  return parseFloat(getComputedStyle(element).getPropertyValue('--u-raw')) || 1;
}
