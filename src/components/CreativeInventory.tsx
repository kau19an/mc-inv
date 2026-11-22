// inventário do modo criativo: a tela é desenhada num canvas (pixel a pixel, em escala inteira) e, por cima,
// ficam botões transparentes nas mesmas posições — eles cuidam do mouse, do toque, do teclado e dos leitores de tela.
// clicar num item abre a página dele na minecraft wiki em outra aba; a url acompanha a aba escolhida, e
// /inv/je/<item> abre a aba do item já rolada até ele, com o slot destacado
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import GameTooltip, { lineOf, type TooltipLine } from './gui/GameTooltip.tsx';
import { FORMAT_COLORS } from '@/lib/gui/colors.ts';
import { textRuns } from '@/lib/gui/text.ts';
import { iconCanvas } from '@/lib/gui/icons.ts';
import { SITE_SECTION, baseId, documentTitle, parseRoute, pathOf, type Route } from '@/lib/gui/routes.ts';
import { wikiUrl } from '@/lib/gui/wiki.ts';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  TOP,
  clamp01,
  firstRow,
  guiScale,
  hiddenRows,
  scrollFromPointer,
  scrollerY,
  slotPosition,
  tabIconPosition,
  tabX,
  tabY,
  type TabInfo,
} from '@/lib/gui/creative.ts';
import { latestRelease, loadVersion, textOf, type VersionData } from '@/lib/gui/data.ts';
import { CREATIVE } from '@/lib/gui/types.ts';

const LOCALE = 'pt_br';
const ADVANCED_TOOLTIPS_KEY = 'mc-inv:advanced-tooltips';
const PAGE = CREATIVE.columns * CREATIVE.rows;
const SEARCH_MAX_LENGTH = 50; // o mesmo limite da caixa de pesquisa do jogo
const CARET_BLINK_MS = 300;
const WHEEL_STEP = 40; // quanto de rolagem (em px) vira uma linha; mouse comum manda ~100 por clique

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

interface Metrics {
  scale: number; // pixels reais por pixel da gui
  dpr: number;
}

interface Drag {
  pointerId: number;
  startY: number;
  startScroll: number;
  moved: boolean;
}

interface Props {
  initial?: Route; // vem da página estática (/inv/je, /inv/je/<aba>, /inv/je/<item>)
}

export default function CreativeInventory({ initial = { kind: 'home' } }: Props) {
  const [data, setData] = useState<VersionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState(-1);
  const [hoveredTab, setHoveredTab] = useState(-1);
  // onde a tooltip se ancora: o ponteiro do mouse, ou o centro do slot/aba focado pelo teclado
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [advancedTooltips, setAdvancedTooltips] = useState(false);

  // tooltips avançadas: F3+H, como no jogo (fica salvo neste navegador)
  useEffect(() => {
    try {
      setAdvancedTooltips(localStorage.getItem(ADVANCED_TOOLTIPS_KEY) === '1');
    } catch {
      // armazenamento bloqueado: começa desligado
    }
    let f3Held = false;
    const onDown = (event: KeyboardEvent) => {
      if (event.key === 'F3') {
        f3Held = true;
        event.preventDefault(); // F3 é "localizar próximo" em alguns navegadores
      } else if (f3Held && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        event.stopImmediatePropagation(); // não deixa o "h" pular pra pesquisa
        setAdvancedTooltips((value) => {
          try {
            localStorage.setItem(ADVANCED_TOOLTIPS_KEY, value ? '0' : '1');
          } catch {
            // sem armazenamento: vale só nesta visita
          }
          return !value;
        });
      }
    };
    const onUp = (event: KeyboardEvent) => event.key === 'F3' && (f3Held = false);
    const onBlur = () => (f3Held = false);
    window.addEventListener('keydown', onDown, { capture: true });
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, { capture: true });
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  const [focusedSlot, setFocusedSlot] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [caretVisible, setCaretVisible] = useState(true);
  const [metrics, setMetrics] = useState<Metrics>({ scale: 2, dpr: 1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const wheel = useRef(0);
  const drag = useRef<Drag | null>(null);
  const focusAfterRender = useRef<'slot' | 'tab' | null>(null);

  // carrega a versão mais recente
  useEffect(() => {
    latestRelease()
      .then((id) => loadVersion(id, LOCALE))
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  // escala inteira que cabe na tela, recalculada ao girar o celular, redimensionar ou mudar de monitor
  useEffect(() => {
    let media: MediaQueryList | null = null;
    const update = () => {
      const dpr = window.devicePixelRatio || 1;
      const margin = 16;
      setMetrics({ dpr, scale: guiScale(window.innerWidth - margin, window.innerHeight - margin, dpr) });
      media?.removeEventListener('change', update);
      media = window.matchMedia(`(resolution: ${dpr}dppx)`);
      media.addEventListener('change', update);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      media?.removeEventListener('change', update);
    };
  }, []);

  const tab: TabInfo | undefined = data?.tabs[tabIndex];

  // índice da pesquisa: nome no idioma da interface + em inglês + id do jogo (sem acentos, sem maiúsculas)
  const searchIndex = useMemo(() => {
    if (!data) return [];
    const searchTab = data.tabs.find((candidate) => candidate.type === 'search');
    return (searchTab?.items ?? []).map((key) => {
      const item = data.items[key];
      const names = item ? [textOf(data, item.name), textOf(data, item.name, data.fallbackLang)] : [];
      return { key, text: normalize([...names, key.split('~')[0]!.replace(/_/g, ' ')].join('\n')) };
    });
  }, [data]);

  const items = useMemo(() => {
    if (!tab) return [];
    if (tab.type === 'search') {
      // "#" pesquisa por marcação, como no jogo: "#logs" acha tudo que está em alguma tag com "logs" no id
      const trimmed = query.trim().toLowerCase();
      if (trimmed.startsWith('#') && data) {
        const wanted = trimmed.slice(1).replace(/^minecraft:/, '');
        return tab.items.filter((key) => (data.itemTags[baseId(key)] ?? []).some((tag) => tag.includes(wanted)));
      }
      const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
      return terms.length ? searchIndex.filter(({ text }) => terms.every((term) => text.includes(term))).map(({ key }) => key) : tab.items;
    }
    return tab.type === 'category' ? tab.items : [];
  }, [tab, query, searchIndex, data]);

  const rows = tab?.canScroll ? hiddenRows(items.length) : 0;
  const first = firstRow(scroll, rows);
  const visible = items.slice(first * CREATIVE.columns, first * CREATIVE.columns + PAGE);
  const unit = metrics.scale / metrics.dpr; // px de css por pixel da gui

  const itemName = (key: string) => {
    const item = data?.items[key];
    return data && item ? textOf(data, item.name) : key;
  };

  // pisca o cursor da pesquisa enquanto ela tem foco
  useEffect(() => {
    if (!searchFocused) return;
    setCaretVisible(true);
    const timer = window.setInterval(() => setCaretVisible((value) => !value), CARET_BLINK_MS);
    return () => window.clearInterval(timer);
  }, [searchFocused, query]);

  // desenho
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!data || !tab || !canvas) return;
    const { scale } = metrics;
    canvas.width = CANVAS_WIDTH * scale;
    canvas.height = CANVAS_HEIGHT * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sprite = (id: string, x: number, y: number, width?: number, height?: number) => {
      const rect = data.gui.images[id];
      if (!rect) return;
      const w = width ?? rect[2];
      const h = height ?? rect[3];
      ctx.drawImage(data.guiAtlas, rect[0], rect[1], w, h, x * scale, y * scale, w * scale, h * scale);
    };

    const icon = (key: string, x: number, y: number) => {
      const canvas = iconCanvas(data, key, 16 * scale);
      if (canvas) ctx.drawImage(canvas, x * scale, y * scale);
    };

    const tabSprite = (candidate: TabInfo, selected: boolean) => {
      sprite(`sprites/container/creative_inventory/tab_${candidate.row}_${selected ? 'selected' : 'unselected'}_${candidate.column + 1}`, tabX(candidate), tabY(candidate));
      const [ix, iy] = tabIconPosition(candidate);
      icon(candidate.icon, ix, iy);
    };

    // mesma ordem do jogo: abas de trás, fundo, pesquisa, título, rolagem, itens, aba selecionada
    data.tabs.forEach((candidate) => candidate !== tab && tabSprite(candidate, false));
    sprite(tab.background.replace(/^minecraft:textures\/gui\//, '').replace(/\.png$/, ''), 0, TOP, CREATIVE.width, CREATIVE.height);

    if (tab.type === 'search') {
      const caret = searchFocused && caretVisible ? '_' : '';
      let text = query;
      while (text && data.font.width(text + caret) > CREATIVE.searchWidth) text = text.slice(1);
      data.font.draw(ctx, text + caret, CREATIVE.searchX, TOP + CREATIVE.searchY, { color: 0xffffff, shadow: true, scale });
    }
    if (tab.showTitle) data.font.draw(ctx, textOf(data, tab.name), CREATIVE.titleX, TOP + CREATIVE.titleY, { color: CREATIVE.titleColor, scale });
    if (tab.canScroll) sprite(`sprites/container/creative_inventory/${rows > 0 ? 'scroller' : 'scroller_disabled'}`, CREATIVE.scrollerX, scrollerY(scroll));

    // o item aberto no painel fica destacado como se o mouse estivesse em cima dele
    visible.forEach((key, index) => {
      const [x, y] = slotPosition(index);
      const lit = index === hovered || key === selectedKey;
      if (lit) sprite('sprites/container/slot_highlight_back', x - 4, y - 4);
      icon(key, x, y);
      if (lit) sprite('sprites/container/slot_highlight_front', x - 4, y - 4);
    });
    if (hovered >= visible.length && hovered < PAGE) {
      const [x, y] = slotPosition(hovered);
      sprite('sprites/container/slot_highlight_back', x - 4, y - 4);
      sprite('sprites/container/slot_highlight_front', x - 4, y - 4);
    }

    tabSprite(tab, true);
  }, [data, tab, metrics, scroll, rows, visible.join(), hovered, selectedKey, query, searchFocused, caretVisible]);

  // move o foco do teclado depois que a tela redesenha
  useEffect(() => {
    if (focusAfterRender.current === 'slot') gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    if (focusAfterRender.current === 'tab') tabsRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    focusAfterRender.current = null;
  });

  // onde um item "mora": a primeira aba de categoria que o tem (senão, a pesquisa) e a posição dele lá
  const homeOf = (id: string, preferredTab?: number) => {
    if (!data) return null;
    const order = data.tabs.map((_, index) => index).sort((a, b) => (a === preferredTab ? -1 : b === preferredTab ? 1 : 0));
    const candidates = [...order.filter((index) => data.tabs[index]!.type === 'category'), ...order.filter((index) => data.tabs[index]!.type === 'search')];
    for (const index of candidates) {
      const position = data.tabs[index]!.items.findIndex((key) => baseId(key) === id);
      if (position >= 0) return { tabIndex: index, position, key: data.tabs[index]!.items[position]! };
    }
    return null;
  };

  // rola só o necessário pra linha do item ficar visível (de preferência na terceira linha, no meio da grade)
  const scrollToShow = (tabItems: number, position: number) => {
    const hidden = hiddenRows(tabItems);
    if (hidden <= 0) return 0;
    const row = Math.floor(position / CREATIVE.columns);
    return Math.min(Math.max(row - 2, 0), hidden) / hidden;
  };

  const titleOf = (route: Route) => {
    if (!data || route.kind === 'home') return documentTitle(SITE_SECTION);
    if (route.kind === 'tab') {
      const found = data.tabs.find((candidate) => candidate.id === route.id);
      return documentTitle(`${found ? textOf(data, found.name) : route.id} · ${SITE_SECTION}`);
    }
    const item = data.items[route.id] ?? Object.values(data.items).find((candidate) => baseId(candidate.id.replace(/^minecraft:/, '')) === route.id);
    return documentTitle(`${item ? textOf(data, item.name) : route.id} · ${SITE_SECTION}`);
  };

  const navigate = (route: Route) => {
    const path = pathOf(route);
    if (path !== window.location.pathname) window.history.pushState(null, '', path);
    document.title = titleOf(route);
  };

  // estado da tela a partir de uma rota (carregamento, voltar/avançar do navegador)
  const applyRoute = (route: Route) => {
    if (!data) return;
    setHovered(-1);
    setFocusedSlot(0);
    if (route.kind === 'item') {
      const home = homeOf(route.id);
      if (home) {
        setTabIndex(home.tabIndex);
        setScroll(scrollToShow(data.tabs[home.tabIndex]!.items.length, home.position));
        setSelectedKey(home.key);
        return;
      }
    }
    const index = route.kind === 'tab' ? data.tabs.findIndex((candidate) => candidate.id === route.id) : 0;
    setTabIndex(Math.max(index, 0));
    setScroll(0);
    setSelectedKey(null);
  };

  useEffect(() => {
    if (!data) return;
    applyRoute(initial);
    document.title = titleOf(initial);
    const tabIds = new Set(data.tabs.map((candidate) => candidate.id));
    const itemIds = new Set(Object.keys(data.items).map(baseId));
    const onPopState = () => applyRoute(parseRoute(window.location.pathname, tabIds, itemIds) ?? { kind: 'home' });
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [data]);

  // foco pelo teclado (não pelo clique) também mostra a tooltip, ancorada no centro do elemento
  const focusTooltip = (element: HTMLElement, then?: () => void) => {
    if (!element.matches(':focus-visible')) return;
    const rect = element.getBoundingClientRect();
    setPointer({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    then?.();
  };

  const selectTab = (index: number) => {
    if (!data) return;
    setTabIndex(index);
    setScroll(0);
    setHovered(-1);
    setFocusedSlot(0);
    setSelectedKey(null);
    navigate(index === 0 ? { kind: 'home' } : { kind: 'tab', id: data.tabs[index]!.id });
    // no celular não abre o teclado sozinho; no computador a pesquisa já começa focada, como no jogo
    if (data.tabs[index]?.type === 'search' && window.matchMedia('(pointer: fine)').matches) requestAnimationFrame(() => searchRef.current?.focus());
  };

  const scrollByRows = (delta: number) => {
    if (rows > 0) setScroll((value) => clamp01(value + delta / rows));
  };

  // digitar em qualquer lugar pula pra pesquisa, como no jogo — e a letra digitada já entra na caixa
  // (em outra aba, a pesquisa começa do zero com ela; na própria pesquisa, ela vai pro fim do texto)
  useEffect(() => {
    if (!data) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.key === ' ') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const searchIndexInTabs = data.tabs.findIndex((candidate) => candidate.type === 'search');
      if (searchIndexInTabs < 0) return;
      event.preventDefault();
      const switching = tabIndex !== searchIndexInTabs;
      if (switching) {
        setTabIndex(searchIndexInTabs);
        setHovered(-1);
        setSelectedKey(null);
        navigate({ kind: 'tab', id: data.tabs[searchIndexInTabs]!.id });
      }
      setQuery((previous) => ((switching ? '' : previous) + event.key).slice(0, SEARCH_MAX_LENGTH));
      setScroll(0);
      setFocusedSlot(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, tabIndex]);

  if (error) {
    return (
      <p role="alert" class="text-center text-red-300">
        Não deu pra carregar o inventário: {error}
      </p>
    );
  }

  const box = (x: number, y: number, width: number, height: number): Record<string, string> => ({
    left: `${x * unit}px`,
    top: `${y * unit}px`,
    width: `${width * unit}px`,
    height: `${height * unit}px`,
  });

  if (!data || !tab) {
    return (
      <div class="grid place-items-center text-neutral-400" style={{ width: `${CANVAS_WIDTH * unit}px`, height: `${CANVAS_HEIGHT * unit}px` }} aria-busy="true">
        Carregando…
      </div>
    );
  }

  const onWheel = (event: WheelEvent) => {
    if (rows <= 0) return;
    event.preventDefault();
    wheel.current += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (Math.abs(wheel.current) >= WHEEL_STEP) {
      scrollByRows(Math.sign(wheel.current));
      wheel.current = 0;
    }
  };

  const guiY = (event: PointerEvent) => (event.clientY - canvasRef.current!.getBoundingClientRect().top) / unit;

  // arrastar o dedo na grade rola as linhas (no mouse, quem rola é a rodinha)
  const onGridPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || rows <= 0) return;
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startScroll: scroll, moved: false };
  };
  const onGridPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaGui = (event.clientY - current.startY) / unit;
    if (!current.moved && Math.abs(deltaGui) > 4) {
      current.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setHovered(-1);
    }
    if (current.moved) setScroll(clamp01(current.startScroll - deltaGui / CREATIVE.slot / rows));
  };
  const onGridPointerUp = (event: PointerEvent) => {
    if (drag.current?.pointerId === event.pointerId && !drag.current.moved) drag.current = null;
  };
  const onGridClickCapture = (event: MouseEvent) => {
    // um arraste não conta como toque no item
    if (drag.current?.moved) {
      event.stopPropagation();
      event.preventDefault();
    }
    drag.current = null;
  };

  const onScrollbarPointerDown = (event: PointerEvent) => {
    if (rows <= 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setScroll(scrollFromPointer(guiY(event)));
  };
  const onScrollbarPointerMove = (event: PointerEvent) => {
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) setScroll(scrollFromPointer(guiY(event)));
  };

  // setas andam entre os itens; passar da borda de cima/baixo rola uma linha
  const onGridKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -CREATIVE.columns, ArrowDown: CREATIVE.columns };
    let target = focusedSlot;
    if (event.key in moves) target += moves[event.key]!;
    else if (event.key === 'PageDown' || event.key === 'PageUp') {
      scrollByRows(event.key === 'PageDown' ? CREATIVE.rows : -CREATIVE.rows);
      event.preventDefault();
      focusAfterRender.current = 'slot';
      return;
    } else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = visible.length - 1;
    else return;
    event.preventDefault();
    if (target >= PAGE && first < rows) {
      scrollByRows(1);
      target -= CREATIVE.columns;
    } else if (target < 0 && first > 0) {
      scrollByRows(-1);
      target += CREATIVE.columns;
    }
    const next = Math.min(Math.max(target, 0), Math.max(visible.length - 1, 0));
    setFocusedSlot(next);
    setHovered(next);
    focusAfterRender.current = 'slot';
  };

  const onTabsKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    selectTab((tabIndex + step + data.tabs.length) % data.tabs.length);
    focusAfterRender.current = 'tab';
  };

  const tabName = textOf(data, tab.name);
  const slotIndex = Math.min(focusedSlot, Math.max(visible.length - 1, 0));

  // tooltip: nome da aba ao passar na aba; no item, o nome — e, na aba de pesquisa, as abas onde ele fica (em azul)
  // as linhas vêm prontas do jogo (exportadas no dump); versões publicadas antes disso mostram só o nome
  const tooltipLines: TooltipLine[] = (() => {
    if (hoveredTab >= 0) return [lineOf(textOf(data, data.tabs[hoveredTab]!.name), FORMAT_COLORS.white)];
    const key = hovered >= 0 ? visible[hovered] : undefined;
    if (!key) return [];
    const item = data.items[key];
    const source = item?.tooltip ? (advancedTooltips ? (item.advanced ?? [...item.tooltip, ...(item.advancedExtra ?? [])]) : item.tooltip) : null;
    const lines: TooltipLine[] = source ? source.map((line) => textRuns(line, data)) : [lineOf(itemName(key), FORMAT_COLORS.white)];
    // na pesquisa, o jogo põe as abas do item logo abaixo do nome, em azul
    if (tab.type === 'search') {
      const tabNames = data.tabs.filter((candidate) => candidate.type === 'category' && candidate.items.includes(key)).map((candidate) => lineOf(textOf(data, candidate.name), FORMAT_COLORS.blue));
      lines.splice(1, 0, ...tabNames);
    }
    return lines;
  })();

  const inventoryHeight = `${CANVAS_HEIGHT * unit}px`;

  return (
    <div class="flex w-full justify-center" style={{ '--u': `${unit}px` }}>
      <div
        class="relative shrink-0 touch-none select-none"
        style={{ width: `${CANVAS_WIDTH * unit}px`, height: inventoryHeight }}
        onWheel={onWheel}
        onPointerMove={(event) => event.pointerType === 'mouse' && setPointer({ x: event.clientX, y: event.clientY })}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setPointer(null)}
      >
        <canvas ref={canvasRef} class="absolute inset-0 h-full w-full" aria-hidden="true" />
        {pointer && tooltipLines.length > 0 && <GameTooltip data={data} lines={tooltipLines} pointerX={pointer.x} pointerY={pointer.y} unit={unit} />}

        <div ref={tabsRef} role="tablist" aria-label="Abas do inventário" onKeyDown={onTabsKeyDown}>
          {data.tabs.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              id={`tab-${candidate.id}`}
              aria-selected={index === tabIndex}
              aria-controls="inventory-panel"
              tabIndex={index === tabIndex ? 0 : -1}
              class="absolute cursor-pointer focus-visible:outline-2 focus-visible:outline-yellow-300"
              style={box(tabX(candidate), tabY(candidate), CREATIVE.tabWidth, CREATIVE.tabHeight)}
              onClick={() => selectTab(index)}
              onPointerEnter={(event) => event.pointerType === 'mouse' && setHoveredTab(index)}
              onPointerLeave={() => setHoveredTab(-1)}
              onFocus={(event) => focusTooltip(event.currentTarget, () => setHoveredTab(index))}
              onBlur={() => setHoveredTab(-1)}
            >
              <span class="sr-only">{textOf(data, candidate.name)}</span>
            </button>
          ))}
        </div>

        <div id="inventory-panel" role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
          {tab.type === 'search' && (
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              value={query}
              maxLength={SEARCH_MAX_LENGTH}
              aria-label="Pesquisar itens"
              autoComplete="off"
              spellcheck={false}
              enterKeyHint="search"
              class="absolute appearance-none border-0 bg-transparent p-0 text-base text-transparent caret-transparent outline-none"
              style={box(CREATIVE.searchX, TOP + CREATIVE.searchY - 1, CREATIVE.searchWidth, CREATIVE.searchHeight + 2)}
              onInput={(event) => {
                setQuery(event.currentTarget.value.slice(0, SEARCH_MAX_LENGTH));
                setScroll(0);
                setFocusedSlot(0);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
          )}

          <div
            ref={gridRef}
            role="group"
            aria-label={`Itens: ${tabName}`}
            class="absolute"
            style={box(CREATIVE.gridX - 1, TOP + CREATIVE.gridY - 1, CREATIVE.columns * CREATIVE.slot, CREATIVE.rows * CREATIVE.slot)}
            onKeyDown={onGridKeyDown}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onClickCapture={onGridClickCapture}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(-1)}
          >
            {visible.map((key, index) => (
              <a
                key={`${first}-${index}`}
                href={wikiUrl(itemName(key))}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={index === slotIndex ? 0 : -1}
                aria-label={`${itemName(key)} (abre a Minecraft Wiki em outra aba)`}
                class="absolute cursor-pointer outline-none"
                style={box((index % CREATIVE.columns) * CREATIVE.slot, Math.floor(index / CREATIVE.columns) * CREATIVE.slot, CREATIVE.slot, CREATIVE.slot)}
                draggable={false}
                onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(index)}
                onFocus={(event) => {
                  setFocusedSlot(index);
                  setHovered(index);
                  focusTooltip(event.currentTarget);
                }}
                onBlur={() => setHovered(-1)}
              />
            ))}
          </div>

          {tab.canScroll && (
            <div
              role="scrollbar"
              aria-controls="inventory-panel"
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={rows}
              aria-valuenow={first}
              aria-label="Rolagem dos itens"
              class="absolute"
              style={box(CREATIVE.scrollerX, TOP + CREATIVE.scrollerY, CREATIVE.scrollerWidth, CREATIVE.scrollerTrack)}
              onPointerDown={onScrollbarPointerDown}
              onPointerMove={onScrollbarPointerMove}
            />
          )}

          <p class="sr-only" aria-live="polite">
            {tab.type === 'search' && query ? `${items.length} ${items.length === 1 ? 'item encontrado' : 'itens encontrados'}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
