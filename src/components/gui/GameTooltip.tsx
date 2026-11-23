// tooltip do jogo (TooltipRenderUtil + DefaultTooltipPositioner, 26.3), em html:
// - fundo e moldura são os sprites tooltip/background e tooltip/frame, desenhados 12 px pra fora do texto
//   (3 px de folga + 9 px de margem transparente do próprio sprite). versões de antes da 1.21.2 não têm esses
//   sprites: o jogo pintava por código (LegacyTooltipBox)
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

// fundo antigo (TooltipRenderUtil até a 1.21.1): retângulo 3 px pra fora do texto em 0xF0100010, com uma linha a
// mais de cada lado sem os cantos (o "arredondado"), e por cima a moldura de 1 px em degradê, de 0x505000FF
// (em cima) a 0x5028007F (embaixo). coordenadas a partir da caixa da tooltip (o texto começa em 12, 12)
const LEGACY_BACKGROUND = 'rgba(16, 0, 16, 0.941)';
const LEGACY_BORDER_TOP = 'rgba(80, 0, 255, 0.314)';
const LEGACY_BORDER_BOTTOM = 'rgba(40, 0, 127, 0.314)';

function LegacyTooltipBox({ width, height }: { width: number; height: number }) {
  const w = width + 6;
  const h = height + 6;
  const rect = (left: number, top: number, rectWidth: number, rectHeight: number, background: string) => (
    <div class="absolute" style={{ left: u(left), top: u(top), width: u(rectWidth), height: u(rectHeight), background }} />
  );
  const gradient = `linear-gradient(${LEGACY_BORDER_TOP}, ${LEGACY_BORDER_BOTTOM})`;
  return (
    <>
      {rect(9, 9, w, h, LEGACY_BACKGROUND)}
      {rect(9, 8, w, 1, LEGACY_BACKGROUND)}
      {rect(9, 9 + h, w, 1, LEGACY_BACKGROUND)}
      {rect(8, 9, 1, h, LEGACY_BACKGROUND)}
      {rect(9 + w, 9, 1, h, LEGACY_BACKGROUND)}
      {rect(9, 9, w, 1, LEGACY_BORDER_TOP)}
      {rect(9, 8 + h, w, 1, LEGACY_BORDER_BOTTOM)}
      {rect(9, 10, 1, h - 2, gradient)}
      {rect(8 + w, 10, 1, h - 2, gradient)}
    </>
  );
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
      {data.gui.frames?.tooltip_background ? (
        <>
          <div class={`${FRAME_CLASS} absolute inset-0`} style={frameStyle(data, 'tooltip_background')} />
          <div class={`${FRAME_CLASS} absolute inset-0`} style={frameStyle(data, 'tooltip_frame')} />
        </>
      ) : (
        <LegacyTooltipBox width={width} height={height} />
      )}
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
