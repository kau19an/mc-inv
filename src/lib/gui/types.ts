// pacote de interface de uma versão (public/data/je/<versão>/gui.json + gui.webp + font/*.png)
import type { AtlasRect } from '../icons/bundle.ts';

// provedor bitmap da fonte do jogo: uma folha com uma grade de caracteres
export interface BitmapProvider {
  file: string; // nome do png em font/
  height: number; // altura do caractere na tela, em pixels da gui
  ascent: number; // distância do topo do caractere até a linha de base
  chars: string[]; // linhas da grade ("\u0000" = célula vazia)
}

export interface FontDefinition {
  spaces: Record<string, number>; // caracteres de espaço → avanço
  bitmaps: BitmapProvider[]; // na ordem do jogo: o primeiro que tiver o caractere ganha
}

// moldura "nine slice" pro html: cantos de `border` px fixos, o resto estica. a imagem vem embutida (data url)
export interface FrameInfo {
  width: number;
  height: number;
  border: number;
  src?: string; // data:image/png;base64,… (versões publicadas antes disso usam frames/<nome>.png)
}

export interface GuiBundle {
  images: Record<string, AtlasRect>; // ex.: "container/creative_inventory/tab_items", "sprites/container/creative_inventory/scroller"
  font: FontDefinition;
  frames?: Record<string, FrameInfo>; // panel, slot, button(_highlighted/_disabled), cross_button(_highlighted), tooltip_background, tooltip_frame
}

// tela do inventário criativo (CreativeModeInventoryScreen, 26.3)
export const CREATIVE = {
  width: 195,
  height: 136,
  columns: 9,
  rows: 5,
  slot: 18,
  gridX: 9,
  gridY: 18,
  hotbarY: 112,
  titleX: 8,
  titleY: 6,
  titleColor: 0x404040,
  scrollerX: 175,
  scrollerY: 18,
  scrollerTrack: 112,
  scrollerWidth: 12,
  scrollerHeight: 15,
  tabWidth: 26,
  tabHeight: 32,
  tabSpacing: 27,
  searchX: 82,
  searchY: 6,
  searchWidth: 80,
  searchHeight: 9,
} as const;
