// toast do jogo com barra de progresso (TutorialToast, 26.3): fundo toast/tutorial (160×32, nine slice de 3 px),
// ícone de item em (8, 8), título roxo (0x500050) e mensagem preta a partir de x = 30, sem sombra, e a barra de
// 154×1 px em (3, altura − 4): branca, preenchida em verde-escuro (0x005500) conforme o progresso avança.
// entra e sai deslizando pela direita, no canto de cima da tela, como o ToastManager (600 ms)
import { useEffect, useRef } from 'preact/hooks';
import { FRAME_CLASS, frameStyle, gameText, hex, u } from './GuiParts.tsx';
import type { VersionData } from '@/lib/gui/data.ts';
import { iconCanvas } from '@/lib/gui/icons.ts';

const WIDTH = 160;
const HEIGHT = 32;
const TITLE_COLOR = 0x500050;
const MESSAGE_COLOR = 0x000000;
const BAR_X = 3;
const BAR_WIDTH = 154;
const BAR_COLOR = 0x005500;

interface Props {
  data: VersionData; // de onde vêm o fundo, a fonte e o ícone (a versão que já está na tela)
  icon: string; // item do ícone
  title: string;
  message: string;
  progress: number; // 0 a 1
  visible: boolean;
  unit: number;
}

export default function GameToast({ data, icon, title, message, progress, visible, unit }: Props) {
  const iconRef = useRef<HTMLCanvasElement>(null);
  const pixels = Math.round(16 * unit);
  useEffect(() => {
    const canvas = iconRef.current;
    const source = iconCanvas(data, icon, pixels);
    if (!canvas) return;
    canvas.width = canvas.height = pixels;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, pixels, pixels);
    if (source) context.drawImage(source, 0, 0);
  }, [data, icon, pixels]);

  return (
    <div
      role="status"
      class={`${FRAME_CLASS} pointer-events-none fixed top-0 right-0 z-50 transition-transform duration-[600ms] ease-out motion-reduce:transition-none`}
      style={{
        ...gameText,
        ...frameStyle(data, 'toast_tutorial'),
        ...(data.gui.frames?.toast_tutorial ? {} : { background: '#fff' }),
        width: u(WIDTH),
        height: u(HEIGHT),
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
      }}
      aria-hidden={!visible}
    >
      {/* a moldura ocupa as bordas: as posições abaixo descontam a borda de 3 px */}
      <div class="absolute" style={{ inset: u(-(data.gui.frames?.toast_tutorial?.border ?? 0)) }}>
        <canvas ref={iconRef} aria-hidden="true" class="absolute [image-rendering:pixelated]" style={{ left: u(8), top: u(8), width: u(16), height: u(16) }} />
        <span class="absolute whitespace-nowrap" style={{ left: u(30), top: u(6), color: hex(TITLE_COLOR) }}>
          {title}
        </span>
        <span class="absolute truncate" style={{ left: u(30), top: u(17), width: u(126), color: hex(MESSAGE_COLOR) }}>
          {message}
        </span>
        <span aria-hidden="true" class="absolute bg-white" style={{ left: u(BAR_X), top: u(HEIGHT - 4), width: u(BAR_WIDTH), height: u(1) }} />
        <span
          aria-hidden="true"
          class="absolute transition-[width] duration-100"
          style={{ left: u(BAR_X), top: u(HEIGHT - 4), width: u(Math.floor(BAR_WIDTH * Math.min(Math.max(progress, 0), 1))), height: u(1), background: hex(BAR_COLOR) }}
        />
      </div>
    </div>
  );
}
