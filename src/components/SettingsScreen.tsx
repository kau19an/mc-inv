// tela de opções, no estilo do menu de opções do jogo: fundo escurecido, título branco no topo, botões de alternar
// ("Programmer Art: LIGADO") e "Concluído" embaixo. é um <dialog> nativo: prende o foco do teclado lá dentro
// e fecha com Esc, como o jogo
import { useEffect, useRef } from 'preact/hooks';
import { GuiButton, gameText, textShadow, u } from './gui/GuiParts.tsx';
import { LOCALES, type VersionData } from '@/lib/gui/data.ts';
import type { Settings } from '@/lib/gui/settings.ts';
import { LANGUAGE_NAMES, type Strings } from '@/lib/gui/strings.ts';

// medidas do jogo (OptionsScreen): botões de 150×20 em duas colunas, 4 px entre eles (ou uma coluna, se não couber);
// "Concluído" com 200 de largura; título 15 px abaixo do topo
const BUTTON_WIDTH = 150;
const BUTTON_HEIGHT = 20;
const GAP = 4;

interface Props {
  data: VersionData;
  settings: Settings;
  strings: Strings;
  onChange: (change: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsScreen({ data, settings, strings, onChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const toggle = (value: boolean) => (value ? strings.on : strings.off);
  const nextLocale = LOCALES[(LOCALES.indexOf(settings.locale) + 1) % LOCALES.length]!;
  const button = { width: u(BUTTON_WIDTH), height: u(BUTTON_HEIGHT), padding: '0' };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      class="m-0 h-dvh max-h-none w-dvw max-w-none bg-black/70 p-0 text-white backdrop-blur-sm backdrop:bg-transparent"
      style={gameText}
      onClose={onClose}
    >
      <div class="flex h-full flex-col items-center overflow-y-auto" style={{ padding: `${u(15)} ${u(8)}`, gap: u(20) }}>
        <h2 id="settings-title" style={{ textShadow: textShadow(0xffffff) }}>
          {strings.optionsTitle}
        </h2>

        <div class="grid w-full justify-center" style={{ gridTemplateColumns: `repeat(auto-fit, ${u(BUTTON_WIDTH)})`, gap: u(GAP), maxWidth: u(BUTTON_WIDTH * 2 + GAP) }}>
          <GuiButton data={data} style={button} onClick={() => onChange({ locale: nextLocale })}>
            {strings.language}: <span lang={settings.locale === 'pt_br' ? 'pt-BR' : 'en-US'}>{LANGUAGE_NAMES[settings.locale]}</span>
          </GuiButton>
          <GuiButton data={data} style={button} aria-pressed={settings.programmerArt} onClick={() => onChange({ programmerArt: !settings.programmerArt })}>
            {strings.programmerArt}: {toggle(settings.programmerArt)}
          </GuiButton>
          <GuiButton data={data} style={button} aria-pressed={settings.advancedTooltips} onClick={() => onChange({ advancedTooltips: !settings.advancedTooltips })}>
            {strings.advancedTooltips}: {toggle(settings.advancedTooltips)}
          </GuiButton>
        </div>

        <GuiButton data={data} class="mt-auto shrink-0" style={{ ...button, width: u(200) }} onClick={() => dialogRef.current?.close()}>
          {strings.done}
        </GuiButton>
      </div>
    </dialog>
  );
}
