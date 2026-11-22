// transforma a fonte bitmap do jogo numa fonte web (woff2): cada pixel aceso vira um quadradinho vetorial.
// assim o texto do painel sai com a letra do minecraft e continua sendo texto de verdade (selecionável, acessível).
// medidas: 1 pixel da gui = 128 unidades e 1 em = 8 pixels → com font-size = 8 × (px de css por pixel da gui),
// cada pixel da fonte cai exatamente num quadrado de pixels da tela, igual ao canvas
import opentype from 'opentype.js';
import { compress } from 'wawoff2';
import { PNG } from 'pngjs';
import type { FontDefinition } from '../../src/lib/gui/types.ts';

const UNIT = 128;
export const FONT_FAMILY = 'Minecraft GUI';

export async function buildFontFace(definition: FontDefinition, files: Record<string, Buffer>): Promise<Buffer> {
  const glyphs: opentype.Glyph[] = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 6 * UNIT, path: new opentype.Path() })];
  const seen = new Set<string>();

  for (const [char, advance] of Object.entries(definition.spaces)) {
    seen.add(char);
    glyphs.push(new opentype.Glyph({ name: `space${char.codePointAt(0)}`, unicode: char.codePointAt(0)!, advanceWidth: advance * UNIT, path: new opentype.Path() }));
  }

  for (const provider of definition.bitmaps) {
    const png = PNG.sync.read(files[provider.file]!);
    const rows = provider.chars.map((row) => [...row]);
    const cellWidth = png.width / rows[0]!.length;
    const cellHeight = png.height / rows.length;
    const scale = provider.height / cellHeight;
    const opaque = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3]! > 0;

    rows.forEach((row, rowIndex) => {
      row.forEach((char, column) => {
        if (char === '\u0000' || seen.has(char)) return;
        seen.add(char);
        const sx = column * cellWidth;
        const sy = rowIndex * cellHeight;
        let width = 0;
        for (let x = cellWidth - 1; x >= 0 && !width; x--) for (let y = 0; y < cellHeight; y++) if (opaque(sx + x, sy + y)) { width = x + 1; break; }

        // cada sequência horizontal de pixels acesos vira um retângulo (todos no mesmo contorno: sem emendas)
        const path = new opentype.Path();
        const unit = UNIT * scale;
        for (let y = 0; y < cellHeight; y++) {
          let x = 0;
          while (x < width) {
            if (!opaque(sx + x, sy + y)) { x++; continue; }
            const start = x;
            while (x < width && opaque(sx + x, sy + y)) x++;
            const top = (provider.ascent - y * scale) * UNIT;
            const bottom = top - unit;
            path.moveTo(start * unit, bottom);
            path.lineTo(x * unit, bottom);
            path.lineTo(x * unit, top);
            path.lineTo(start * unit, top);
            path.close();
          }
        }
        const advance = Math.floor(0.5 + width * scale) + 1;
        glyphs.push(new opentype.Glyph({ name: `u${char.codePointAt(0)!.toString(16)}`, unicode: char.codePointAt(0)!, advanceWidth: width ? advance * UNIT : 0, path }));
      });
    });
  }

  const font = new opentype.Font({
    familyName: FONT_FAMILY,
    styleName: 'Regular',
    unitsPerEm: 8 * UNIT,
    // caixa da linha = 10 px (a altura de linha das tooltips do jogo): linha de base a 8 px do topo,
    // então o topo das letras sem acento fica 1 px abaixo do topo da linha
    ascender: 8 * UNIT,
    descender: -2 * UNIT,
    glyphs,
  });
  // woff2: ~39 KB em vez de ~500 KB do otf cru
  return Buffer.from(await compress(new Uint8Array(font.toArrayBuffer() as ArrayBuffer)));
}
