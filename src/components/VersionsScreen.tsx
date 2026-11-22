// tela "Versões...": escolher a versão do jogo mostrada no inventário. imita as telas de lista do jogo
// (seleção de idioma, de mundo): título e controles no cabeçalho, linha separadora, a lista sobre o fundo de lista,
// outra linha separadora e o "Concluído" no rodapé.
// as versões ficam agrupadas por drop ("Deep Freeze", "Wilderness Bound"…), em grupos recolhidos que abrem no "+",
// com a linha vertical de árvore à esquerda das versões de dentro.
// escolher já aplica (não tem "Confirmar"): clicar numa versão, as setas do teclado ou os atalhos "Mais recente" e
// "Snapshot", que seguem a mais recente de cada tipo (quando sair uma nova, o site passa pra ela).
// o botão "Filtro" ao lado da busca abre uma janelinha (fundo popup/background do jogo) com uma caixa de seleção
// por tipo de versão (Lançamento, Snapshot, Pre-Release, Release Candidate…): os desmarcados somem da lista
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FRAME_CLASS, GuiButton, fitWidth, frameStyle, gameText, hex, textShadow, u } from './gui/GuiParts.tsx';
import GameCheckbox from './gui/GameCheckbox.tsx';
import GameTextField from './gui/GameTextField.tsx';
import { useWidgetTooltip } from './gui/useWidgetTooltip.tsx';
import { LATEST_RELEASE, LATEST_SNAPSHOT, type VersionData, type VersionEntry, type VersionList } from '@/lib/gui/data.ts';
import { HTML_LANG, type Strings } from '@/lib/gui/strings.ts';
import type { Settings } from '@/lib/gui/settings.ts';
import { translate } from '@/lib/gui/text.ts';
import { UI_KEYS } from '@/lib/gui/ui-keys.ts';
import { developmentKindName, dropName, dropOf, isUpcoming } from '@/lib/gui/drops.ts';

const ROW_WIDTH = 304; // a largura das duas colunas de opções (cabe a busca e os dois atalhos alinhados)
const ROW_HEIGHT = 24; // duas linhas de texto: versão e, embaixo, tipo (ou destaque) · data
const DROP_HEIGHT = 20; // linha do drop: nome, número e o +/−
const INDENT = 14; // recuo das versões dentro do drop
const TREE_LINE_X = 6; // posição da linha vertical da árvore, dentro do recuo
const TREE_LINE_COLOR = 0x808080;
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
const UPCOMING_COLOR = 0xffaa00; // §6, o "Em breve" dos drops em desenvolvimento
const OUTLINE_FOCUSED = 0xffffff; // AbstractSelectionList: contorno branco com a lista em foco, cinza sem foco
const OUTLINE_UNFOCUSED = 0x808080;
const POPUP_PADDING = 8; // espaço entre a moldura da janelinha (6 px) e as caixas
const CHECKBOX_GAP = 4;
// ordem dos tipos no filtro: do mais estável pro mais experimental, e os antigos/especiais por último
const KIND_ORDER = ['release', 'release_candidate', 'pre_release', 'snapshot', 'april_fools', 'old_beta', 'old_alpha'];

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
  const [usingKeyboard, setUsingKeyboard] = useState(false); // o contorno de cursor só aparece navegando pelo teclado
  const [scroll, setScroll] = useState({ top: 0, height: 0, content: 0 });
  const t = (key: string) => translate(data, key);
  const htmlLang = HTML_LANG[settings.locale];
  const font = (text: string) => data.font.width(text); // largura do texto em pixels da gui
  const { tooltip, renderTooltip } = useWidgetTooltip(data, unit);
  // largura das linhas: 304 ou, em tela estreita, o que couber (sobrando lugar pra barra de rolagem)
  const rowWidth = fitWidth(ROW_WIDTH, unit) - (fitWidth(ROW_WIDTH, unit) < ROW_WIDTH ? (SCROLLBAR_WIDTH + SCROLLBAR_GAP) * 2 : 0);
  const buttonWidth = Math.min(BUTTON_WIDTH, Math.floor((rowWidth - GAP) / 2));
  // "Filtro" do tamanho do texto (com a margem do botão), e a busca ocupa o resto da linha
  const filterWidth = font(strings.versionsFilter) + 16;
  const searchWidth = rowWidth - filterWidth - GAP;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(htmlLang, { dateStyle: 'medium' }), [htmlLang]);
  // tipo da versão: os de desenvolvimento com o nome da Mojang ("Snapshot", "Pre-Release", "Release Candidate")
  const kindName = (entry: VersionEntry) => developmentKindName(entry.kind) ?? strings.versionKinds[entry.kind] ?? entry.kind;

  // filtro: os tipos que existem na lista, com quantas versões cada um tem
  const hidden = new Set(settings.hiddenVersionKinds);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of list.versions) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    const rank = (kind: string) => (KIND_ORDER.includes(kind) ? KIND_ORDER.indexOf(kind) : KIND_ORDER.length);
    return [...counts].sort(([a], [b]) => rank(a) - rank(b)).map(([kind, count]) => ({ kind, count }));
  }, [list]);
  const kindLabel = (kind: string) => developmentKindName(kind as VersionEntry['kind']) ?? strings.versionKinds[kind] ?? kind;
  const setKindShown = (kind: string, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(kind);
    else next.add(kind);
    onChange({ hiddenVersionKinds: [...next] });
  };
  // fecha a janelinha clicando fora dela
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [filterOpen]);

  // busca: todas as palavras no id, no tipo ou no nome do drop ("snapshot 26.4", "pré", "deep")
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const shown = useMemo(() => {
    return list.versions.filter((entry) => {
      if (hidden.has(entry.kind)) return false;
      if (!terms.length) return true;
      const haystack = normalize(`${entry.id} ${kindName(entry)} ${dropName(dropOf(entry.id))}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [query, list, strings, settings.hiddenVersionKinds]);

  // drops na ordem da lista (mais novo primeiro), cada um com as suas versões (também mais nova primeiro)
  const drops = useMemo(() => {
    const groups = new Map<string, VersionEntry[]>();
    for (const entry of shown) {
      const drop = dropOf(entry.id);
      groups.set(drop, [...(groups.get(drop) ?? []), entry]);
    }
    return [...groups].map(([drop, versions]) => ({ drop, versions }));
  }, [shown]);

  // tudo recolhido por padrão (pedido do Kauan); buscando, os drops com resultado abrem sozinhos
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const isOpen = (drop: string) => terms.length > 0 || expanded.has(drop);
  const toggle = (drop: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(drop)) next.delete(drop);
      else next.add(drop);
      return next;
    });

  // linhas visíveis, em ordem: drop, as versões dele (se aberto), próximo drop…
  type Row = { kind: 'drop'; drop: string; count: number; hasCurrent: boolean; upcoming: boolean } | { kind: 'version'; drop: string; entry: VersionEntry };
  const rows: Row[] = drops.flatMap(({ drop, versions }) => [
    { kind: 'drop' as const, drop, count: versions.length, hasCurrent: versions.some((entry) => entry.id === current), upcoming: isUpcoming(drop, list.versions, list.releasedDrops) },
    ...(isOpen(drop) ? versions.map((entry) => ({ kind: 'version' as const, drop, entry })) : []),
  ]);
  const rowKey = (row: Row) => (row.kind === 'drop' ? `drop-${row.drop}` : `version-${row.entry.id}`);
  const rowId = (key: string) => key.replace(/[^a-z0-9-]/gi, '_');

  const select = (id: string) => onChange({ version: id });

  // cursor do teclado (qual linha está "em foco" dentro da árvore). numa versão, mover o cursor também escolhe ela
  const [active, setActive] = useState<string>(() => `version-${current}`);
  const activeIndex = Math.max(
    rows.findIndex((row) => rowKey(row) === active),
    0,
  );

  // a versão escolhida (ou o drop dela, se estiver recolhido) fica à vista ao abrir — centralizada, como o
  // centerScrollOn do jogo — e a linha do cursor, ao andar pelo teclado
  const scrollToRow = (key: string, center: boolean) => {
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>(`#${CSS.escape(rowId(key))}`);
    if (!box || !row) return;
    if (center) box.scrollTop = row.offsetTop + row.offsetHeight / 2 - box.clientHeight / 2;
    else row.scrollIntoView({ block: 'nearest' });
  };
  useLayoutEffect(() => scrollToRow(isOpen(dropOf(current)) ? `version-${current}` : `drop-${dropOf(current)}`, true), []);
  useLayoutEffect(() => scrollToRow(active, false), [active]);

  // atalhos "Mais recente" e "Desenvolvimento": escolhem, abrem o drop da versão e rolam até ela, pra mostrar o que
  // foi escolhido (se a busca esconder a versão, a busca é limpa)
  const pendingScroll = useRef<string | null>(null);
  const choose = (setting: string, target: string | null) => {
    select(setting);
    if (!target) return;
    // a versão escolhida precisa aparecer: o tipo dela volta pro filtro e a busca que a esconde é limpa
    const kind = list.versions.find((entry) => entry.id === target)?.kind;
    if (kind && hidden.has(kind)) setKindShown(kind, true);
    if (!shown.some((entry) => entry.id === target) && terms.length) setQuery('');
    const drop = dropOf(target);
    setExpanded((previous) => (previous.has(drop) ? previous : new Set(previous).add(drop)));
    setActive(`version-${target}`);
    pendingScroll.current = `version-${target}`;
  };
  useLayoutEffect(() => {
    if (!pendingScroll.current) return;
    scrollToRow(pendingScroll.current, true);
    pendingScroll.current = null;
  });

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
  }, [rows.length]);
  const maxScroll = Math.max(scroll.content - scroll.height, 0);
  const scrollerHeight = Math.min(Math.max(scroll.height ? (scroll.height * scroll.height) / Math.max(scroll.content, 1) : 0, MIN_SCROLLER * unitOf(listRef.current)), Math.max(scroll.height - 8, 0));
  const scrollerTop = maxScroll ? (scroll.top / maxScroll) * (scroll.height - scrollerHeight) : 0;
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  // teclado na árvore (como as árvores de arquivos): ↑/↓ andam pelas linhas (numa versão, já escolhem ela);
  // → abre o drop, ← fecha (numa versão, volta pro drop dela); Enter/Espaço abrem e fecham; Home/End
  const moveTo = (index: number) => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (!row) return;
    setActive(rowKey(row));
    if (row.kind === 'version') select(row.entry.id);
  };
  const onListKey = (event: KeyboardEvent) => {
    const row = rows[activeIndex];
    if (!row) return;
    const handled = (() => {
      switch (event.key) {
        case 'ArrowDown':
          return moveTo(activeIndex + 1), true;
        case 'ArrowUp':
          return moveTo(activeIndex - 1), true;
        case 'Home':
          return moveTo(0), true;
        case 'End':
          return moveTo(rows.length - 1), true;
        case 'ArrowRight':
          if (row.kind === 'drop' && !isOpen(row.drop)) toggle(row.drop);
          return true;
        case 'ArrowLeft':
          if (row.kind === 'version') setActive(`drop-${row.drop}`);
          else if (isOpen(row.drop) && !terms.length) toggle(row.drop);
          return true;
        case 'Enter':
        case ' ':
          if (row.kind === 'drop') toggle(row.drop);
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };


  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="versions-title"
      lang={htmlLang}
      class="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 text-white backdrop-blur-[var(--menu-blur)] backdrop:bg-transparent"
      style={{ ...gameText, ...tileStyle(data, 'menu_background', 'rgb(0 0 0 / 0.7)') }}
      onClose={onClose}
      // Esc com a janelinha do filtro aberta fecha só ela, não a tela
      onCancel={(event) => {
        if (!filterOpen) return;
        event.preventDefault();
        setFilterOpen(false);
      }}
    >
      <div class="flex h-full flex-col">
        {/* cabeçalho: título, busca e os dois atalhos */}
        <header class="flex shrink-0 flex-col items-center" style={{ padding: `${u(15)} ${u(8)} ${u(8)}`, gap: u(8) }}>
          <h2 id="versions-title" style={{ textShadow: textShadow(0xffffff) }}>
            {strings.versionsTitle}
          </h2>
          <div class="flex flex-col" style={{ width: u(rowWidth), gap: u(GAP) }}>
            <div class="flex" style={{ gap: u(GAP) }}>
              <GameTextField data={data} value={query} label={strings.versionsSearch} placeholder={strings.versionsSearch} width={searchWidth} maxLength={64} onInput={setQuery} />
              <div ref={filterRef} class="relative">
                <GuiButton
                  data={data}
                  width={filterWidth}
                  label={strings.versionsFilter}
                  aria-haspopup="true"
                  aria-expanded={filterOpen}
                  aria-controls="versions-filter"
                  onClick={() => setFilterOpen((open) => !open)}
                />
                {filterOpen && (
                  <div
                    id="versions-filter"
                    role="group"
                    aria-labelledby="versions-filter-title"
                    class={`${FRAME_CLASS} absolute right-0 z-10 flex flex-col`}
                    style={{
                      ...frameStyle(data, 'popup_background'),
                      ...(data.gui.frames?.popup_background ? {} : { background: 'rgb(0 0 0 / 0.9)' }),
                      top: `calc(100% + ${u(GAP)})`,
                      padding: u(POPUP_PADDING - (data.gui.frames?.popup_background?.border ?? 0)),
                      gap: u(CHECKBOX_GAP),
                    }}
                  >
                    <p id="versions-filter-title" class="whitespace-nowrap" style={{ textShadow: textShadow(0xffffff), marginBottom: u(2) }}>
                      {strings.versionsFilterTitle}
                    </p>
                    {kinds.map(({ kind, count }) => (
                      <GameCheckbox key={kind} data={data} label={`${kindLabel(kind)} (${count})`} checked={!hidden.has(kind)} onChange={(checked) => setKindShown(kind, checked)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div class="flex" style={{ gap: u(GAP) }}>
              <GuiButton data={data} width={buttonWidth} label={strings.versionsLatest} aria-pressed={settings.version === LATEST_RELEASE} onClick={() => choose(LATEST_RELEASE, list.latest.release)} disabled={!list.latest.release} {...tooltip('latest', strings.versionsLatestTooltip)} />
              <GuiButton data={data} width={buttonWidth} label={strings.versionsDevelopment} aria-pressed={settings.version === LATEST_SNAPSHOT} onClick={() => choose(LATEST_SNAPSHOT, list.latest.snapshot)} disabled={!list.latest.snapshot} {...tooltip('development', strings.versionsDevelopmentTooltip)} />
            </div>
          </div>
        </header>

        <div class="shrink-0" style={{ height: u(HEADER_LINE), ...tileStyle(data, 'header_separator', 'rgb(255 255 255 / 0.2)') }} />

        {/* a lista, sobre o fundo de lista do jogo */}
        <div class="relative min-h-0 flex-1" style={tileStyle(data, 'menu_list_background', 'rgb(0 0 0 / 0.44)')}>
          <div
            ref={listRef}
            role="tree"
            tabIndex={0}
            aria-label={strings.versionsList}
            aria-activedescendant={rows.length ? rowId(rowKey(rows[activeIndex]!)) : undefined}
            class="h-full overflow-y-auto outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ paddingBlock: u(4) }}
            onScroll={measure}
            onKeyDown={(event) => {
              setUsingKeyboard(true);
              onListKey(event);
            }}
            onPointerDown={() => setUsingKeyboard(false)}
            onFocus={() => setListFocused(true)}
            onBlur={() => setListFocused(false)}
          >
            {rows.map((row) => {
              const key = rowKey(row);
              const cursor = listFocused && usingKeyboard && key === rowKey(rows[activeIndex]!);
              // contorno do jogo: 1 px (branco com a lista em foco, cinza sem) e preto por dentro
              const outlined = (color: number) => ({ background: '#000', boxShadow: `inset 0 0 0 ${u(1)} ${hex(color)}` });

              if (row.kind === 'drop') {
                const open = isOpen(row.drop);
                // drop recolhido com a versão escolhida dentro: o contorno fica nele, pra não "sumir" a seleção
                const marked = cursor || (row.hasCurrent && !open);
                return (
                  <div
                    key={key}
                    id={rowId(key)}
                    role="treeitem"
                    aria-expanded={open}
                    aria-level={1}
                    aria-label={`${dropName(row.drop)} (${row.drop})${row.upcoming ? `, ${strings.upcomingTag}` : ''}`}
                    class="relative mx-auto cursor-pointer select-none"
                    style={{ width: u(rowWidth), height: u(DROP_HEIGHT), ...(marked ? outlined(cursor ? OUTLINE_FOCUSED : OUTLINE_UNFOCUSED) : {}) }}
                    onClick={() => {
                      setActive(key);
                      if (!terms.length) toggle(row.drop);
                      listRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    <span class="absolute truncate" style={{ left: u(4), right: u(row.upcoming ? 16 + font(strings.upcomingTag) + 6 : 16), top: u(6), textShadow: textShadow(0xffffff) }}>
                      {dropName(row.drop)}
                      {dropName(row.drop) !== row.drop && <span style={{ color: hex(GRAY), textShadow: textShadow(GRAY) }}> {row.drop}</span>}
                    </span>
                    {/* drop em desenvolvimento (sem nenhuma release ainda) */}
                    {row.upcoming && (
                      <span aria-hidden="true" class="absolute" style={{ right: u(16), top: u(6), color: hex(UPCOMING_COLOR), textShadow: textShadow(UPCOMING_COLOR) }}>
                        {strings.upcomingTag}
                      </span>
                    )}
                    <span aria-hidden="true" class="absolute" style={{ right: u(4), top: u(6), textShadow: textShadow(0xffffff) }}>
                      {open ? '-' : '+'}
                    </span>
                  </div>
                );
              }

              const { entry } = row;
              const selected = entry.id === current;
              // destaque: a release mais recente vira "Mais recente" em verde; a de desenvolvimento mais recente mantém o
              // nome do tipo, só que em amarelo
              const latest = entry.id === list.latest.release ? { text: strings.latestReleaseTag, color: LATEST_RELEASE_COLOR } : entry.id === list.latest.snapshot ? { text: kindName(entry), color: LATEST_SNAPSHOT_COLOR } : null;
              return (
                <div key={key} class="relative mx-auto" style={{ width: u(rowWidth), height: u(ROW_HEIGHT) }}>
                  {/* linha vertical da árvore, ligando as versões do drop */}
                  <span aria-hidden="true" class="absolute top-0 bottom-0" style={{ left: u(TREE_LINE_X), width: u(1), background: hex(TREE_LINE_COLOR) }} />
                  <div
                    id={rowId(key)}
                    role="treeitem"
                    aria-level={2}
                    aria-selected={selected}
                    class="absolute top-0 right-0 bottom-0 cursor-pointer"
                    style={{ left: u(INDENT), ...(selected || cursor ? outlined(listFocused ? OUTLINE_FOCUSED : OUTLINE_UNFOCUSED) : {}) }}
                    onClick={() => {
                      setActive(key);
                      select(entry.id);
                      listRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    <span class="absolute" style={{ left: u(4), top: u(3), textShadow: textShadow(0xffffff) }}>
                      {entry.id}
                    </span>
                    {/* segunda linha: o tipo em cinza (ou o destaque colorido das mais recentes) · a data */}
                    <span class="absolute truncate" style={{ left: u(4), right: u(4), top: u(13), color: hex(GRAY), textShadow: textShadow(GRAY) }}>
                      {latest ? <span style={{ color: hex(latest.color), textShadow: textShadow(latest.color) }}>{latest.text}</span> : kindName(entry)} ·{' '}
                      {dateFormat.format(new Date(entry.releaseTime))}
                    </span>
                  </div>
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
      {renderTooltip()}
    </dialog>
  );
}

// px de css por pixel da gui, lido da variável --u (pra converter o tamanho mínimo da barra)
function unitOf(element: Element | null): number {
  if (!element) return 1;
  return parseFloat(getComputedStyle(element).getPropertyValue('--u-raw')) || 1;
}
