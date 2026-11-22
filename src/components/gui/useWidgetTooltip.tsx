import { useState } from 'preact/hooks';
import GameTooltip, { lineOf, wrapText, type TooltipPlacement } from './GameTooltip.tsx';
import type { VersionData } from '@/lib/gui/data.ts';

// tooltips de botão como as das opções do jogo, compartilhadas pelas telas de opções e de versões
// tooltips das opções (WidgetTooltipHolder, 26.3): texto branco quebrado em linhas de até 170 px (Tooltip.MAX_WIDTH),
// sem atraso. com o mouse em cima, MenuTooltipPositioner (ao lado do ponteiro, sem cobrir o botão); só com o foco do
// teclado, BelowOrAboveWidgetTooltipPositioner (embaixo do botão, ou em cima se não couber)
export const TOOLTIP_WIDTH = 170;
interface WidgetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const lerp = (t: number, a: number, b: number) => a + t * (b - a);
const menuOffset = (mouseY: number, widgetY: number, widgetHeight: number) =>
  Math.round(lerp(Math.min(Math.abs(mouseY - widgetY), widgetHeight) / widgetHeight, widgetHeight - 3, 5));

function besideMouse(widget: WidgetRect, mouseX: number, mouseY: number): TooltipPlacement {
  return (screenWidth, screenHeight, width, height) => {
    let x = mouseX + 12;
    if (x + width > screenWidth - 5) x = Math.max(mouseX - 12 - width, 9);
    let y = mouseY + 3;
    const widgetHeight = widget.bottom - widget.top;
    const paddedHeight = height + 3 + 3;
    const lowestPossibleY = widget.bottom + 3 + menuOffset(0, 0, widgetHeight);
    if (lowestPossibleY + paddedHeight <= screenHeight - 5) y += menuOffset(y, widget.top, widgetHeight);
    else y -= paddedHeight + menuOffset(y, widget.bottom, widgetHeight);
    return { x, y };
  };
}

function belowOrAbove(widget: WidgetRect): TooltipPlacement {
  return (screenWidth, screenHeight, width, height) => {
    let x = widget.left + 3;
    let y = widget.bottom + 3 + 1;
    if (y + height + 3 > screenHeight) y = widget.top - height - 3 - 1;
    if (x + width > screenWidth) x = Math.max(widget.right - width - 3, 4);
    return { x, y };
  };
}


// uso: const { tooltip, renderTooltip } = useWidgetTooltip(data, unit);
//      <GuiButton {...tooltip('dono', 'texto')} />  …  {renderTooltip()} no fim do <dialog> (por cima de tudo)
// guarda só de quem é a tooltip aberta; o texto vem do render atual, então ela troca ou some sozinha se o botão
// mudar de texto ou deixar de ter tooltip
export function useWidgetTooltip(data: VersionData, unit: number) {
  const [tip, setTip] = useState<{ owner: string; placement: TooltipPlacement } | null>(null);
  const texts: Record<string, string | undefined> = {};
  const widgetRect = (element: Element): WidgetRect => {
    const rect = element.getBoundingClientRect();
    return { left: Math.floor(rect.left / unit), top: Math.floor(rect.top / unit), right: Math.floor(rect.right / unit), bottom: Math.floor(rect.bottom / unit) };
  };
  // eventos que ligam a tooltip num botão (sem texto, nada)
  const tooltip = (owner: string, text: string | undefined) => {
    texts[owner] = text;
    if (!text) return {};
    return {
      'aria-description': text,
      onPointerMove: (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        setTip({ owner, placement: besideMouse(widgetRect(event.currentTarget as Element), Math.floor(event.clientX / unit), Math.floor(event.clientY / unit)) });
      },
      onPointerLeave: () => setTip(null),
      onFocus: (event: FocusEvent) => {
        if ((event.currentTarget as Element).matches(':focus-visible')) setTip({ owner, placement: belowOrAbove(widgetRect(event.currentTarget as Element)) });
      },
      onBlur: () => setTip(null),
    };
  };
  // chamar no fim do jsx: os botões já registraram os textos deste render
  const renderTooltip = () => {
    const text = tip ? texts[tip.owner] : undefined;
    return tip && text ? <GameTooltip data={data} unit={unit} lines={wrapText(data, text, TOOLTIP_WIDTH).map((line) => lineOf(line, 0xffffff))} placement={tip.placement} /> : null;
  };
  return { tooltip, renderTooltip };
}
