// pacote de interface de uma versão: os sprites e fundos que a tela do inventário criativo usa + a fonte do jogo
//   gui.webp     atlas com fundos das abas, abas, barra de rolagem e destaque do slot
//   gui.json     posição de cada imagem no atlas + definição da fonte (provedores bitmap e espaços)
//   font/*.png   as folhas de caracteres da fonte (bitmap) + font/minecraft.woff2 (a mesma fonte, como fonte web)
//   molduras "nine slice" pro html (painel, slot, botões, tooltip) vão dentro do gui.json, em base64: são poucos
//   kb, e sem arquivo separado não tem requisição que possa falhar (moldura que não carrega vira borda branca)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { AtlasRect } from '../../src/lib/icons/bundle.ts';
import type { FontDefinition, FrameInfo, GuiBundle, TileInfo } from '../../src/lib/gui/types.ts';
import { buildFontFace } from './fontface.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ATLAS_WIDTH = 512;
const SPRITES = 'textures/gui/sprites/';

// o que a tela do criativo desenha (conferido em CreativeModeInventoryScreen, 26.3)
function wantedImages(backgrounds: string[]): string[] {
  const tabs = ['top', 'bottom'].flatMap((row) => ['selected', 'unselected'].flatMap((state) => [1, 2, 3, 4, 5, 6, 7].map((n) => `container/creative_inventory/tab_${row}_${state}_${n}`)));
  // aba "Inventário": ícones dos slots vazios de armadura e da segunda mão (InventoryMenu)
  const emptySlots = ['helmet', 'chestplate', 'leggings', 'boots', 'shield'].map((slot) => `container/slot/${slot}`);
  const sprites = [...tabs, 'container/creative_inventory/scroller', 'container/creative_inventory/scroller_disabled', 'container/slot_highlight_back', 'container/slot_highlight_front', ...emptySlots];
  // fundos vêm como "minecraft:textures/gui/container/creative_inventory/tab_items.png"
  const backgroundPaths = backgrounds.map((id) => id.replace(/^minecraft:/, '').replace(/\.png$/, ''));
  return [...new Set([...backgroundPaths, ...sprites.map((sprite) => `${SPRITES}${sprite}`)])];
}

// nomes antigos de imagens que mudaram de lugar (até a 1.21.3)
const LEGACY_IMAGES: Record<string, string> = Object.fromEntries(
  ['helmet', 'chestplate', 'leggings', 'boots', 'shield'].map((slot) => [`${SPRITES}container/slot/${slot}`, `textures/item/empty_armor_slot_${slot}`]),
);
// imagens que versões antigas não têm e o site sabe desenhar sem elas
const OPTIONAL_IMAGES = new Set([`${SPRITES}container/slot_highlight_back`, `${SPRITES}container/slot_highlight_front`]);

// sprites de moldura do jogo (o "nine slice" vem do .mcmeta de cada um)
const FRAME_SPRITES: Record<string, string> = {
  slot: 'container/slot',
  button: 'widget/button',
  button_highlighted: 'widget/button_highlighted',
  button_disabled: 'widget/button_disabled',
  cross_button: 'widget/cross_button',
  cross_button_highlighted: 'widget/cross_button_highlighted',
  text_field: 'widget/text_field',
  text_field_highlighted: 'widget/text_field_highlighted',
  tooltip_background: 'tooltip/background',
  tooltip_frame: 'tooltip/frame',
  scroller: 'widget/scroller', // barra de rolagem das listas (AbstractScrollArea)
  scroller_background: 'widget/scroller_background',
  // caixa de seleção (Checkbox) e fundo de janelinha (PopupScreen): filtro de tipos da tela "Versões..."
  checkbox: 'widget/checkbox',
  checkbox_highlighted: 'widget/checkbox_highlighted',
  checkbox_selected: 'widget/checkbox_selected',
  checkbox_selected_highlighted: 'widget/checkbox_selected_highlighted',
  popup_background: 'popup/background',
  // toast de dica com barra de progresso (TutorialToast): carregamento ao trocar de versão
  toast_tutorial: 'toast/tutorial',
};

// texturas repetidas (em blocos) das telas de menu com lista: fundo da tela, fundo da lista e as linhas que
// separam o cabeçalho e o rodapé (Screen.MENU_BACKGROUND, MENU_LIST_BACKGROUND, HEADER/FOOTER_SEPARATOR)
const TILE_TEXTURES: Record<string, string> = {
  menu_background: 'menu_background',
  menu_list_background: 'menu_list_background',
  header_separator: 'header_separator',
  footer_separator: 'footer_separator',
};
const PANEL_BORDER = 4;

function crop(source: PNG, x: number, y: number, width: number, height: number, target: PNG, tx: number, ty: number) {
  for (let row = 0; row < height; row++) source.data.copy(target.data, ((ty + row) * target.width + tx) * 4, ((y + row) * source.width + x) * 4, ((y + row) * source.width + x + width) * 4);
}

// moldura do painel recortada do próprio fundo do inventário: cantos e bordas de 4 px + o miolo cinza
function panelFrame(background: PNG, width: number, height: number): PNG {
  const b = PANEL_BORDER;
  const size = b * 3;
  const out = new PNG({ width: size, height: size });
  const mid = 20; // trecho de borda reta, longe dos cantos e dos slots
  crop(background, 0, 0, b, b, out, 0, 0);
  crop(background, width - b, 0, b, b, out, 2 * b, 0);
  crop(background, 0, height - b, b, b, out, 0, 2 * b);
  crop(background, width - b, height - b, b, b, out, 2 * b, 2 * b);
  crop(background, mid, 0, b, b, out, b, 0);
  crop(background, mid, height - b, b, b, out, b, 2 * b);
  crop(background, 0, mid, b, b, out, 0, b);
  crop(background, width - b, mid, b, b, out, 2 * b, b);
  crop(background, b + 1, b + 1, b, b, out, b, b);
  return out;
}

export async function buildGuiBundle(versionDir: string, backgrounds: string[]): Promise<{ bundle: GuiBundle; atlas: Buffer; fontFiles: Record<string, Buffer> }> {
  const assets = join(versionDir, 'assets/minecraft');
  const images = new Map<string, PNG>();
  for (const path of wantedImages(backgrounds)) {
    let file = join(assets, `${path}.png`);
    // versões antigas: o ícone do slot vazio era uma textura de item (empty_armor_slot_*), guardada aqui com o nome
    // novo pro site não precisar saber a diferença
    const legacy = LEGACY_IMAGES[path];
    if (!existsSync(file) && legacy && existsSync(join(assets, `${legacy}.png`))) file = join(assets, `${legacy}.png`);
    if (!existsSync(file)) {
      // destaque do slot (sprites só desde a 24w39a: antes o jogo pintava um branco a 50%, e o site faz o mesmo)
      if (OPTIONAL_IMAGES.has(path)) continue;
      throw new Error(`imagem da interface não encontrada: ${path}`);
    }
    const png = PNG.sync.read(readFileSync(file));
    // animadas (ex.: destaque do slot tem .mcmeta de "nine slice", não de animação): só o primeiro quadro quadrado
    images.set(path.replace(SPRITES, 'sprites/').replace('textures/gui/', ''), png);
  }

  // empacota em prateleiras (do mais alto pro mais baixo)
  const entries = [...images.entries()].sort(([a, pa], [b, pb]) => pb.height - pa.height || a.localeCompare(b));
  const rects: Record<string, AtlasRect> = {};
  let x = 0, y = 0, shelf = 0;
  for (const [id, png] of entries) {
    if (x + png.width > ATLAS_WIDTH) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    rects[id] = [x, y, png.width, png.height];
    x += png.width;
    shelf = Math.max(shelf, png.height);
  }
  const atlas = new PNG({ width: ATLAS_WIDTH, height: y + shelf });
  atlas.data.fill(0);
  for (const [id, png] of entries) {
    const [rx, ry, w, h] = rects[id]!;
    for (let row = 0; row < h; row++) png.data.copy(atlas.data, ((ry + row) * ATLAS_WIDTH + rx) * 4, row * png.width * 4, (row * png.width + w) * 4);
  }

  // fonte padrão: segue as referências de font/default.json (espaços + provedores bitmap; o unifont fica de fora por ora)
  const font: FontDefinition = { spaces: {}, bitmaps: [] };
  const fontFiles: Record<string, Buffer> = {};
  const visit = (id: string) => {
    const definition = JSON.parse(readFileSync(join(assets, 'font', `${id.replace(/^minecraft:/, '')}.json`), 'utf8')) as Json;
    for (const provider of definition.providers ?? []) {
      if (provider.type === 'reference') {
        if (provider.id && !String(provider.id).includes('unifont')) visit(provider.id);
      } else if (provider.type === 'space') {
        Object.assign(font.spaces, provider.advances);
      } else if (provider.type === 'bitmap') {
        const file = String(provider.file).replace(/^minecraft:/, '');
        const name = file.split('/').pop()!;
        fontFiles[name] = readFileSync(join(assets, 'textures', file));
        font.bitmaps.push({ file: name, height: provider.height ?? 8, ascent: provider.ascent, chars: provider.chars });
      }
    }
  };
  visit('minecraft:default');

  fontFiles['minecraft.woff2'] = await buildFontFace(font, fontFiles);

  // molduras pro html
  const frames: Record<string, FrameInfo> = {};
  const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;
  for (const [name, sprite] of Object.entries(FRAME_SPRITES)) {
    const file = join(assets, `${SPRITES}${sprite}.png`);
    if (!existsSync(file)) continue;
    const png = PNG.sync.read(readFileSync(file));
    const meta = existsSync(`${file}.mcmeta`) ? (JSON.parse(readFileSync(`${file}.mcmeta`, 'utf8')) as Json) : {};
    const scaling = meta.gui?.scaling;
    // o slot não tem .mcmeta: a borda em relevo dele tem 1 px
    const border = scaling?.type === 'nine_slice' ? (typeof scaling.border === 'number' ? scaling.border : scaling.border.left) : name === 'slot' ? 1 : 0;
    frames[name] = { width: png.width, height: png.height, border, src: dataUrl(readFileSync(file)) };
  }
  const panelBackground = backgrounds.map((id) => id.replace(/^minecraft:/, '').replace(/\.png$/, '')).find((path) => path.endsWith('tab_items')) ?? backgrounds[0]!.replace(/^minecraft:/, '').replace(/\.png$/, '');
  const panel = panelFrame(images.get(panelBackground.replace('textures/gui/', ''))!, 195, 136);
  frames.panel = { width: panel.width, height: panel.height, border: PANEL_BORDER, src: dataUrl(PNG.sync.write(panel)) };

  const tiles: Record<string, TileInfo> = {};
  for (const [name, texture] of Object.entries(TILE_TEXTURES)) {
    const file = join(assets, 'textures/gui', `${texture}.png`);
    if (!existsSync(file)) continue;
    const png = PNG.sync.read(readFileSync(file));
    tiles[name] = { width: png.width, height: png.height, src: dataUrl(readFileSync(file)) };
  }

  return { bundle: { images: rects, font, frames, tiles }, atlas: PNG.sync.write(atlas), fontFiles };
}
