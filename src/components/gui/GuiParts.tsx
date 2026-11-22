// peças de interface em html com a cara do jogo: molduras "nine slice" (painel, slot, botão, tooltip) e texto
// com a fonte do jogo. tudo medido em pixels da gui: `--u` (px de css por pixel da gui) vem do inventário
import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import type { VersionData } from '@/lib/gui/data.ts';

// n pixels da gui em css
export const u = (n: number) => `calc(var(--u) * ${n})`;

// sombra do texto: 1 pixel abaixo/à direita, com a cor a 25% (igual ao jogo)
export const textShadow = (color: number) => `${u(1)} ${u(1)} 0 #${((color & 0xfcfcfc) >> 2).toString(16).padStart(6, '0')}`;
export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// a fonte vira o tamanho de 1 pixel da gui por pixel da fonte; linha de 10 px como nas tooltips
export const gameText: Record<string, string> = { fontFamily: "'Minecraft GUI', ui-monospace, monospace", fontSize: u(8), lineHeight: u(10), letterSpacing: '0' };

// a imagem da moldura vai em --frame (e --frame-hover): assim o hover/foco troca a imagem só com css
export const FRAME_CLASS = '[border-image-source:var(--frame)] [image-rendering:pixelated]';
export const FRAME_HOVER_CLASS = 'hover:[border-image-source:var(--frame-hover)] focus-visible:[border-image-source:var(--frame-hover)]';

export function frameStyle(data: VersionData, name: string, hover?: string): Record<string, string> {
  const frame = data.gui.frames?.[name];
  if (!frame) return {};
  const url = (file: string) => `url("${data.baseUrl}/frames/${file}.png")`;
  return {
    '--frame': url(name),
    ...(hover && data.gui.frames?.[hover] ? { '--frame-hover': url(hover) } : {}),
    borderStyle: 'solid',
    borderWidth: u(frame.border),
    borderImageSlice: `${frame.border} fill`,
    borderImageRepeat: 'repeat',
  };
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & { data: VersionData; style?: Record<string, string>; children: ComponentChildren };

// botão do jogo: textura widget/button (widget/button_highlighted ao passar o mouse ou focar), texto branco com sombra
export function GuiButton({ data, style, children, class: className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      class={`${FRAME_CLASS} ${FRAME_HOVER_CLASS} cursor-pointer whitespace-nowrap text-white outline-none ${className}`}
      style={{ ...gameText, ...frameStyle(data, 'button', 'button_highlighted'), textShadow: textShadow(0xffffff), padding: `${u(1)} ${u(3)}`, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

// botão "x" do jogo (widget/cross_button, 14×14)
export function CrossButton({ data, label, onClick, style }: { data: VersionData; label: string; onClick: () => void; style?: Record<string, string> }) {
  const url = (file: string) => `url("${data.baseUrl}/frames/${file}.png")`;
  return (
    <button
      type="button"
      aria-label={label}
      class="cursor-pointer bg-size-[100%_100%] [background-image:var(--frame)] [image-rendering:pixelated] outline-none hover:[background-image:var(--frame-hover)] focus-visible:[background-image:var(--frame-hover)]"
      style={{ '--frame': url('cross_button'), '--frame-hover': url('cross_button_highlighted'), width: u(14), height: u(14), ...style }}
      onClick={onClick}
    />
  );
}
