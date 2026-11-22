// caixa de texto do jogo (EditBox), usada nas telas de opções e de versões
import { FRAME_CLASS, frameStyle, hex, u } from './GuiParts.tsx';
import type { VersionData } from '@/lib/gui/data.ts';

const TEXT_COLOR = 0xe0e0e0; // texto dentro do EditBox

// caixa de texto do jogo (EditBox com moldura): moldura widget/text_field (clara com foco), texto a 4 px da borda.
// fonte de 16 px encolhida por escala até o tamanho da gui (abaixo de 16 px, o iphone dá zoom ao focar)
interface Props {
  data: VersionData;
  value: string;
  label: string; // nome acessível
  width: number; // em pixels da gui
  placeholder?: string; // dica cinza com a caixa vazia (EditBox.setHint)
  maxLength?: number;
  onInput: (value: string) => void;
  onEnter?: () => void;
}

export default function GameTextField({ data, value, label, width, placeholder, maxLength, onInput, onEnter }: Props) {
  return (
    <div
      class={
        data.gui.frames?.text_field
          ? `${FRAME_CLASS} relative shrink-0 focus-within:[border-image-source:var(--frame-hover)]`
          : // reserva (versão publicada sem a moldura): o EditBox do jogo é fundo preto com borda cinza, branca com foco
            'relative shrink-0 border-solid border-[#a0a0a0] bg-black focus-within:border-white'
      }
      style={{ ...(data.gui.frames?.text_field ? frameStyle(data, 'text_field', 'text_field_highlighted') : { borderWidth: u(1) }), width: u(width), height: u(20) }}
    >
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellcheck={false}
        enterKeyHint="done"
        aria-label={label}
        class="absolute top-0 left-0 origin-top-left cursor-text border-0 bg-transparent p-0 outline-none selection:bg-[#0000ff] selection:text-white placeholder:text-[#808080]"
        style={{
          fontFamily: "'Minecraft GUI', monospace",
          fontSize: '16px',
          color: hex(TEXT_COLOR),
          textShadow: `2px 2px 0 ${hex((TEXT_COLOR & 0xfcfcfc) >> 2)}`,
          caretColor: hex(TEXT_COLOR),
          letterSpacing: '0',
          // 16 px = 2× a fonte da gui (8 px): medidas em dobro, e a caixa é encolhida pra metade de --u
          width: `${(width - 8) * 2}px`,
          height: '36px',
          paddingLeft: '6px',
          transform: 'scale(calc(var(--u-raw) / 2))',
        }}
        onInput={(event) => onInput(event.currentTarget.value)}
        onKeyDown={(event) => event.key === 'Enter' && onEnter?.()}
      />
    </div>
  );
}

