// fonte bitmap do jogo (font/default.json → provedores "bitmap" e "space"), desenhada num canvas 2d.
// cada folha é uma grade de caracteres; a largura de cada um vem da coluna mais à direita com pixel visível,
// e o avanço é largura × escala + 1, igual ao jogo (BitmapProvider). o unifont fica de fora por ora
import type { FontDefinition } from './types.ts';

interface Glyph {
  sheet: HTMLCanvasElement; // folha original (branca)
  file: string;
  sx: number; // recorte na folha
  sy: number;
  width: number; // colunas visíveis
  cellHeight: number;
  scale: number; // altura na tela / altura da célula
  top: number; // deslocamento vertical a partir da linha do texto (7 - ascent)
  advance: number;
}

export interface BitmapFont {
  width(text: string): number; // em pixels da gui
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: { color: number; shadow?: boolean; scale: number }): void;
}

function canvasFrom(image: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return canvas;
}

export async function loadFont(definition: FontDefinition, baseUrl: string): Promise<BitmapFont> {
  const glyphs = new Map<string, Glyph>();
  // ordem do jogo: o primeiro provedor que tem o caractere ganha
  for (const provider of definition.bitmaps) {
    const response = await fetch(`${baseUrl}/font/${provider.file}`);
    const sheet = canvasFrom(await createImageBitmap(await response.blob()));
    const pixels = sheet.getContext('2d')!.getImageData(0, 0, sheet.width, sheet.height).data;
    const rows = provider.chars.map((row) => [...row]);
    const cellWidth = sheet.width / rows[0]!.length;
    const cellHeight = sheet.height / rows.length;
    const scale = provider.height / cellHeight;
    rows.forEach((row, rowIndex) => {
      row.forEach((char, column) => {
        if (char === '\u0000' || glyphs.has(char)) return;
        const sx = column * cellWidth;
        const sy = rowIndex * cellHeight;
        let width = 0;
        for (let x = cellWidth - 1; x >= 0 && !width; x--) {
          for (let y = 0; y < cellHeight; y++) {
            if (pixels[((sy + y) * sheet.width + sx + x) * 4 + 3]! > 0) {
              width = x + 1;
              break;
            }
          }
        }
        glyphs.set(char, { sheet, file: provider.file, sx, sy, width, cellHeight, scale, top: 7 - provider.ascent, advance: Math.floor(0.5 + width * scale) + 1 });
      });
    });
  }

  // folhas pintadas por cor (multiplica o branco pela cor e devolve a transparência original)
  const tinted = new Map<string, HTMLCanvasElement>();
  const tintedSheet = (glyph: Glyph, color: number): HTMLCanvasElement => {
    const key = `${glyph.file}|${color}`;
    let canvas = tinted.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = glyph.sheet.width;
      canvas.height = glyph.sheet.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(glyph.sheet, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(glyph.sheet, 0, 0);
      tinted.set(key, canvas);
    }
    return canvas;
  };

  const advanceOf = (char: string) => definition.spaces[char] ?? glyphs.get(char)?.advance ?? 0;

  const drawRun = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: number, scale: number) => {
    let cursor = x;
    for (const char of text) {
      const glyph = glyphs.get(char);
      if (glyph && glyph.width) {
        ctx.drawImage(
          tintedSheet(glyph, color),
          glyph.sx, glyph.sy, glyph.width, glyph.cellHeight,
          Math.round(cursor * scale), Math.round((y + glyph.top) * scale),
          Math.round(glyph.width * glyph.scale * scale), Math.round(glyph.cellHeight * glyph.scale * scale),
        );
      }
      cursor += advanceOf(char);
    }
  };

  return {
    width: (text) => [...text].reduce((sum, char) => sum + advanceOf(char), 0),
    draw(ctx, text, x, y, { color, shadow = false, scale }) {
      ctx.imageSmoothingEnabled = false;
      // sombra: 1 pixel pra baixo e pra direita, com a cor a 25%
      if (shadow) drawRun(ctx, text, x + 1, y + 1, (color & 0xfcfcfc) >> 2, scale);
      drawRun(ctx, text, x, y, color, scale);
    },
  };
}
