// caixa de seleção do jogo (Checkbox): sprite widget/checkbox(_selected), com a versão _highlighted ao passar o
// mouse ou focar, e o texto à direita. a caixa tem a altura da linha + 8 (17 px), com o sprite de 20 px reduzido
// a esse tamanho como o jogo faz; o texto fica 4 px depois dela, em 0xE0E0E0 com sombra
import { FRAME_CLASS, frameStyle, gameText, hex, textShadow, u } from './GuiParts.tsx';
import type { VersionData } from '@/lib/gui/data.ts';

const BOX = 17;
const LABEL_GAP = 4;
const TEXT_COLOR = 0xe0e0e0;

interface Props {
  data: VersionData;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function GameCheckbox({ data, label, checked, onChange }: Props) {
  const sprite = checked ? 'checkbox_selected' : 'checkbox';
  const frame = data.gui.frames?.[sprite];
  const hover = data.gui.frames?.[`${sprite}_highlighted`];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      class="group flex cursor-pointer items-center bg-transparent p-0 text-left outline-none"
      style={{ ...gameText, height: u(BOX), gap: u(LABEL_GAP), color: hex(TEXT_COLOR), textShadow: textShadow(TEXT_COLOR) }}
      onClick={() => onChange(!checked)}
    >
      {frame ? (
        <span
          aria-hidden="true"
          class="shrink-0 bg-[image:var(--box)] bg-size-[100%_100%] [image-rendering:pixelated] group-hover:bg-[image:var(--box-hover)] group-focus-visible:bg-[image:var(--box-hover)]"
          style={{ width: u(BOX), height: u(BOX), '--box': `url("${frame.src}")`, '--box-hover': `url("${(hover ?? frame).src}")` }}
        />
      ) : (
        // versão publicada antes dos sprites de caixa: uma caixa simples no lugar
        <span aria-hidden="true" class={`${FRAME_CLASS} shrink-0 text-center`} style={{ ...frameStyle(data, 'text_field', 'text_field_highlighted'), width: u(BOX), height: u(BOX), lineHeight: u(BOX - 2) }}>
          {checked ? '✓' : ''}
        </span>
      )}
      <span class="whitespace-nowrap">{label}</span>
    </button>
  );
}
