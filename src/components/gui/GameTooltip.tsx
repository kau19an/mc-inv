// tooltip do jogo (TooltipRenderUtil + DefaultTooltipPositioner, 26.3), em html:
// - fundo e moldura são os sprites tooltip/background e tooltip/frame, desenhados 12 px pra fora do texto
//   (3 px de folga + 9 px de margem transparente do próprio sprite)
// - aparece 12 px à direita e 12 px acima do ponteiro; se não couber à direita, vai pra esquerda
// - linhas de 10 px; a primeira ganha 2 px a mais quando há outras embaixo (é o "título")
// - texto sem cor sai branco; negrito é o jogo "redesenhando" a letra 1 px pro lado (e avançando 1 px a mais)
import { FRAME_CLASS, frameStyle, gameText, hex, u } from './GuiParts.tsx';
import type { VersionData } from '@/lib/gui/data.ts';
import type { TextRun } from '@/lib/gui/text.ts';

export type TooltipLine = TextRun[];

const DEFAULT_COLOR = 0xffffff;
const shadowOf = (color: number) => hex((color & 0xfcfcfc) >> 2);

export const lineOf = (text: string, color: number): TooltipLine => [{ text, style: { color } }];

function lineWidth(data: VersionData, line: TooltipLine): number {
  return line.reduce((sum, run) => sum + data.font.width(run.text) + (run.style.bold ? [...run.text].filter((char) => char !== ' ').length : 0), 0);
}

function Run({ run }: { run: TextRun }) {
  const color = run.style.color ?? DEFAULT_COLOR;
  const shadows = [`${u(1)} ${u(1)} 0 ${shadowOf(color)}`];
  if (run.style.bold) shadows.unshift(`${u(1)} 0 0 ${hex(color)}`, `${u(2)} ${u(1)} 0 ${shadowOf(color)}`);
  const decoration = [run.style.underlined && 'underline', run.style.strikethrough && 'line-through'].filter(Boolean).join(' ');
  return (
    <span
      style={{
        color: hex(color),
        textShadow: shadows.join(', '),
        fontStyle: run.style.italic ? 'italic' : 'normal',
        letterSpacing: run.style.bold ? u(1) : '0',
        textDecoration: decoration || 'none',
        textDecorationThickness: u(1),
      }}
    >
      {run.text}
    </span>
  );
}

// quebra um texto em linhas de até maxWidth pixels da gui, nos espaços (como o StringSplitter do jogo);
// palavra maior que a linha é cortada onde não cabe mais
export function wrapText(data: VersionData, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (data.font.width(candidate) - 1 <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    let rest = word;
    while (data.font.width(rest) - 1 > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && data.font.width(rest.slice(0, cut)) - 1 > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

// onde a tooltip vai, em pixels da gui (canto de cima à esquerda do texto). recebe a tela e o tamanho do texto
export type TooltipPlacement = (screenWidth: number, screenHeight: number, width: number, height: number) => { x: number; y: number };

// DefaultTooltipPositioner: 12 px à direita e 12 px acima do ponteiro; se não couber à direita, vai pra esquerda
export const followPointer =
  (pointerX: number, pointerY: number, unit: number): TooltipPlacement =>
  (screenWidth, screenHeight, width, height) => {
    const mouseX = Math.floor(pointerX / unit);
    const mouseY = Math.floor(pointerY / unit);
    let x = mouseX + 12;
    let y = mouseY - 12;
    if (x + width > screenWidth) x = Math.max(mouseX - 24 - width, 4);
    if (y + height + 3 > screenHeight) y = screenHeight - height - 3;
    return { x, y: Math.max(y, 4) };
  };

interface Props {
  data: VersionData;
  lines: TooltipLine[];
  unit: number; // px de css por pixel da gui
  // posição do ponteiro na janela, em px de css (DefaultTooltipPositioner), ou outra regra de posição
  pointerX?: number;
  pointerY?: number;
  placement?: TooltipPlacement;
}

export default function GameTooltip({ data, lines, pointerX = 0, pointerY = 0, unit, placement }: Props) {
  if (!lines.length) return null;
  const width = Math.max(...lines.map((line) => lineWidth(data, line))) - 1; // o último avanço inclui 1 px de espaço
  const height = lines.length === 1 ? 8 : lines.length * 10;
  const screenWidth = window.innerWidth / unit;
  const screenHeight = window.innerHeight / unit;
  const { x, y } = (placement ?? followPointer(pointerX, pointerY, unit))(screenWidth, screenHeight, width, height);

  const box = { position: 'fixed', left: `${(x - 12) * unit}px`, top: `${(y - 12) * unit}px`, width: `${(width + 24) * unit}px`, height: `${(height + 24) * unit}px` } as const;

  return (
    <div class="pointer-events-none z-50" style={box} aria-hidden="true">
      <div class={`${FRAME_CLASS} absolute inset-0`} style={frameStyle(data, 'tooltip_background')} />
      <div class={`${FRAME_CLASS} absolute inset-0`} style={frameStyle(data, 'tooltip_frame')} />
      {/* a caixa da linha começa 1 px acima do topo das letras (ver fontface.ts) */}
      <div class="absolute whitespace-pre" style={{ ...gameText, left: u(12), top: u(11) }}>
        {lines.map((line, index) => (
          <div key={index} style={{ height: u(10), marginBottom: index === 0 && lines.length > 1 ? u(2) : '0' }}>
            {line.map((run, runIndex) => (
              <Run key={runIndex} run={run} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
