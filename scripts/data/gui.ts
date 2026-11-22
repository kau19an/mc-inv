// pacote de interface de uma versão: os sprites e fundos que a tela do inventário criativo usa + a fonte do jogo
//   gui.webp     atlas com fundos das abas, abas, barra de rolagem e destaque do slot
//   gui.json     posição de cada imagem no atlas + definição da fonte (provedores bitmap e espaços)
//   font/*.png   as folhas de caracteres da fonte (bitmap)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { AtlasRect } from '../../src/lib/icons/bundle.ts';
import type { FontDefinition, GuiBundle } from '../../src/lib/gui/types.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ATLAS_WIDTH = 512;
const SPRITES = 'textures/gui/sprites/';

// o que a tela do criativo desenha (conferido em CreativeModeInventoryScreen, 26.3)
function wantedImages(backgrounds: string[]): string[] {
  const tabs = ['top', 'bottom'].flatMap((row) => ['selected', 'unselected'].flatMap((state) => [1, 2, 3, 4, 5, 6, 7].map((n) => `container/creative_inventory/tab_${row}_${state}_${n}`)));
  const sprites = [...tabs, 'container/creative_inventory/scroller', 'container/creative_inventory/scroller_disabled', 'container/slot_highlight_back', 'container/slot_highlight_front'];
  // fundos vêm como "minecraft:textures/gui/container/creative_inventory/tab_items.png"
  const backgroundPaths = backgrounds.map((id) => id.replace(/^minecraft:/, '').replace(/\.png$/, ''));
  return [...new Set([...backgroundPaths, ...sprites.map((sprite) => `${SPRITES}${sprite}`)])];
}

export function buildGuiBundle(versionDir: string, backgrounds: string[]): { bundle: GuiBundle; atlas: Buffer; fontFiles: Record<string, Buffer> } {
  const assets = join(versionDir, 'assets/minecraft');
  const images = new Map<string, PNG>();
  for (const path of wantedImages(backgrounds)) {
    const file = join(assets, `${path}.png`);
    if (!existsSync(file)) throw new Error(`imagem da interface não encontrada: ${path}`);
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

  return { bundle: { images: rects, font }, atlas: PNG.sync.write(atlas), fontFiles };
}
