// tooltip do jogo (TooltipRenderUtil + DefaultTooltipPositioner, 26.3), em html:
// - fundo e moldura são os sprites tooltip/background e tooltip/frame, desenhados 12 px pra fora do texto
//   (3 px de folga + 9 px de margem transparente do próprio sprite)
// - aparece 12 px à direita e 12 px acima do ponteiro; se não couber à direita, vai pra esquerda
// - linhas de 10 px; a primeira ganha 2 px a mais quando há outras embaixo (é o "título")
import { FRAME_CLASS, frameStyle, gameText, hex, textShadow, u } from './GuiParts.tsx';
import type { VersionData } from '@/lib/gui/data.ts';

export interface TooltipLine {
  text: string;
  color: number;
}

// cores de formatação do jogo (§) usadas nas tooltips
export const FORMAT = { white: 0xffffff, blue: 0x5555ff, darkGray: 0x555555, darkPurple: 0xaa00aa, gray: 0xaaaaaa, yellow: 0xffff55, aqua: 0x55ffff, lightPurple: 0xff55ff } as const;

interface Props {
  data: VersionData;
  lines: TooltipLine[];
  pointerX: number; // posição do ponteiro na janela, em px de css
  pointerY: number;
  unit: number; // px de css por pixel da gui
}

export default function GameTooltip({ data, lines, pointerX, pointerY, unit }: Props) {
  if (!lines.length) return null;
  const width = Math.max(...lines.map((line) => data.font.width(line.text))) - 1; // o último avanço inclui 1 px de espaço
  const height = lines.length === 1 ? 8 : lines.length * 10;
  const screenWidth = window.innerWidth / unit;
  const screenHeight = window.innerHeight / unit;
  const mouseX = Math.floor(pointerX / unit);
  const mouseY = Math.floor(pointerY / unit);
  let x = mouseX + 12;
  let y = mouseY - 12;
  if (x + width > screenWidth) x = Math.max(mouseX - 24 - width, 4);
  if (y + height + 3 > screenHeight) y = screenHeight - height - 3;
  y = Math.max(y, 4);

  const box = { position: 'fixed', left: `${(x - 12) * unit}px`, top: `${(y - 12) * unit}px`, width: `${(width + 24) * unit}px`, height: `${(height + 24) * unit}px` } as const;

  return (
    <div class="pointer-events-none z-50" style={box} aria-hidden="true">
      <div class={`${FRAME_CLASS} absolute inset-0`} style={frameStyle(data, 'tooltip_background')} />
      <div class={`${FRAME_CLASS} absolute inset-0`} style={frameStyle(data, 'tooltip_frame')} />
      {/* a caixa da linha começa 1 px acima do topo das letras (ver fontface.ts) */}
      <div class="absolute whitespace-pre" style={{ ...gameText, left: u(12), top: u(11) }}>
        {lines.map((line, index) => (
          <div key={index} style={{ color: hex(line.color), textShadow: textShadow(line.color), height: u(10), marginBottom: index === 0 && lines.length > 1 ? u(2) : '0' }}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
