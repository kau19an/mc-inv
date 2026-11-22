// geometria e regras da tela do inventário criativo (CreativeModeInventoryScreen, 26.3), em pixels da gui.
// o canvas tem a tela inteira + as abas: 28 pixels acima e abaixo do fundo
import { CREATIVE } from './types.ts';

export interface TabInfo {
  id: string;
  type: 'category' | 'search' | 'hotbar' | 'inventory';
  row: 'top' | 'bottom';
  column: number;
  alignedRight: boolean;
  showTitle: boolean;
  canScroll: boolean;
  background: string;
  name: TextComponent;
  icon: string;
  items: string[];
}

export type TextComponent = { translate: string; fallback?: string } | { text: string } | string;

export const TOP = 28; // onde começa o fundo dentro do canvas
export const CANVAS_WIDTH = CREATIVE.width;
export const CANVAS_HEIGHT = CREATIVE.height + TOP * 2;

export function tabX(tab: TabInfo): number {
  return tab.alignedRight ? CREATIVE.width - CREATIVE.tabSpacing * (7 - tab.column) + 1 : CREATIVE.tabSpacing * tab.column;
}

// topo do sprite da aba (as de cima ficam 28 px acima do fundo; as de baixo começam 4 px antes do fim dele)
export function tabY(tab: TabInfo): number {
  return tab.row === 'top' ? TOP - 28 : TOP + CREATIVE.height - 4;
}

export function tabIconPosition(tab: TabInfo): [number, number] {
  return [tabX(tab) + 5, tabY(tab) + 8 + (tab.row === 'top' ? 1 : -1)];
}

// linhas que sobram além das 5 visíveis (CreativeModeInventoryScreen.ItemPickerMenu.calculateRowCount)
export function hiddenRows(itemCount: number): number {
  return Math.max(0, Math.ceil(itemCount / CREATIVE.columns) - CREATIVE.rows);
}

// primeira linha visível pra uma posição de rolagem de 0 a 1
export function firstRow(scroll: number, rows: number): number {
  return Math.max(Math.floor(scroll * rows + 0.5), 0);
}

// topo do botão da barra de rolagem
export function scrollerY(scroll: number): number {
  return TOP + CREATIVE.scrollerY + Math.floor((CREATIVE.scrollerTrack - CREATIVE.scrollerHeight - 2) * scroll);
}

// posição de rolagem a partir de onde o ponteiro está na trilha (o meio do botão segue o dedo)
export function scrollFromPointer(guiY: number): number {
  const track = CREATIVE.scrollerTrack - CREATIVE.scrollerHeight;
  return clamp01((guiY - TOP - CREATIVE.scrollerY - 7.5) / track);
}

export function slotPosition(index: number): [number, number] {
  return [CREATIVE.gridX + (index % CREATIVE.columns) * CREATIVE.slot, TOP + CREATIVE.gridY + Math.floor(index / CREATIVE.columns) * CREATIVE.slot];
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// maior escala inteira que cabe, contada em pixels reais da tela (assim cada pixel da gui vira um quadrado exato)
// (contentHeight: altura total em pixels da gui — o canvas e o que vier embaixo dele, como o botão de opções)
export function guiScale(availableWidth: number, availableHeight: number, devicePixelRatio: number, contentHeight: number = CANVAS_HEIGHT): number {
  return Math.max(1, Math.floor(Math.min((availableWidth * devicePixelRatio) / CANVAS_WIDTH, (availableHeight * devicePixelRatio) / contentHeight)));
}
