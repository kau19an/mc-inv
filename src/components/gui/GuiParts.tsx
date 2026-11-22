// peças de interface em html com a cara do jogo: molduras "nine slice" (painel, slot, botão, tooltip) e texto
// com a fonte do jogo. tudo medido em pixels da gui: `--u` (px de css por pixel da gui) vem do inventário
import type { ButtonHTMLAttributes } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
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

// imagem da moldura: embutida no gui.json (data url) ou, em versões antigas, o arquivo frames/<nome>.png
const frameUrl = (data: VersionData, name: string) => `url("${data.gui.frames?.[name]?.src ?? `${data.baseUrl}/frames/${name}.png`}")`;

export function frameStyle(data: VersionData, name: string, hover?: string): Record<string, string> {
  const frame = data.gui.frames?.[name];
  if (!frame) return {};
  return {
    '--frame': frameUrl(data, name),
    ...(hover && data.gui.frames?.[hover] ? { '--frame-hover': frameUrl(data, hover) } : {}),
    borderStyle: 'solid',
    borderColor: 'transparent', // se a imagem falhar, a borda some em vez de virar um contorno na cor do texto
    borderWidth: u(frame.border),
    borderImageSlice: `${frame.border} fill`,
    borderImageRepeat: 'repeat',
  };
}

// texto que não cabe desliza pra frente e pra trás, pra sempre, como nos botões do jogo
// (AbstractWidget.renderScrollingString): deslocamento = excesso × (sin(π/2 · cos(2π·t / período)) / 2 + 0,5),
// período = máx(excesso × 0,5; 3) segundos, em pixels inteiros da gui. se couber, fica sempre centralizado.
// com "reduzir movimento" ligado no sistema, corta com reticências em vez de deslizar
export function ScrollingText({ data, text, width }: { data: VersionData; text: string; width: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // o avanço da última letra inclui 1 px de espaço depois dela, que não conta como texto
  const overflow = data.font.width(text) - 1 - width;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // sem animação (cabe, ou "reduzir movimento"): limpa o deslocamento que uma animação anterior deixou
    // (ex.: trocou de idioma e o texto novo passou a caber)
    element.style.transform = '';
    if (overflow <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const period = Math.max(overflow * 0.5, 3);
    let frame = 0;
    const tick = () => {
      const time = performance.now() / 1000;
      const progress = Math.sin((Math.PI / 2) * Math.cos((2 * Math.PI * time) / period)) / 2 + 0.5;
      element.style.transform = `translateX(${u(-Math.trunc(progress * overflow))})`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      element.style.transform = '';
    };
  }, [overflow, text]);
  return (
    <span class={`block overflow-hidden text-center whitespace-pre motion-reduce:text-ellipsis ${overflow > 0 ? 'motion-safe:text-left' : ''}`} style={{ width: u(width) }}>
      <span ref={ref} class="motion-safe:inline-block">
        {text}
      </span>
    </span>
  );
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'children' | 'label' | 'width' | 'height'> & {
  data: VersionData;
  label: string;
  width: number; // em pixels da gui (o jogo usa 200, 150, 98…)
  height?: number;
  style?: Record<string, string>;
};

// botão do jogo: textura widget/button (widget/button_highlighted ao passar o mouse ou focar), texto branco com
// sombra, 2 px de margem pro texto de cada lado (a moldura tem 3 px, então o texto avança 1 px sobre ela)
export function GuiButton({ data, label, width, height = 20, style, class: className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      class={`${FRAME_CLASS} ${FRAME_HOVER_CLASS} flex cursor-pointer items-center justify-center text-white outline-none ${className}`}
      style={{ ...gameText, ...frameStyle(data, 'button', 'button_highlighted'), textShadow: textShadow(0xffffff), width: u(width), height: u(height), padding: '0', ...style }}
      {...rest}
    >
      <span style={{ marginInline: u(-1) }}>
        <ScrollingText data={data} text={label} width={width - 4} />
      </span>
    </button>
  );
}

// botão "x" do jogo (widget/cross_button, 14×14)
export function CrossButton({ data, label, onClick, style }: { data: VersionData; label: string; onClick: () => void; style?: Record<string, string> }) {
  return (
    <button
      type="button"
      aria-label={label}
      class="cursor-pointer bg-size-[100%_100%] [background-image:var(--frame)] [image-rendering:pixelated] outline-none hover:[background-image:var(--frame-hover)] focus-visible:[background-image:var(--frame-hover)]"
      style={{ '--frame': frameUrl(data, 'cross_button'), '--frame-hover': frameUrl(data, 'cross_button_highlighted'), width: u(14), height: u(14), ...style }}
      onClick={onClick}
    />
  );
}
