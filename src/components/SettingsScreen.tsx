// tela de opções, no estilo do menu de opções do jogo: fundo escurecido, título branco no topo, botões de alternar
// e "Concluído" embaixo. os textos são os do próprio jogo (ui-keys.ts), então saem como no jogo em cada idioma.
// é um <dialog> nativo: prende o foco do teclado lá dentro e fecha com Esc, como o jogo
import { useEffect, useRef } from 'preact/hooks';
import { GuiButton, gameText, textShadow, u } from './gui/GuiParts.tsx';
import { LOCALES, type VersionData } from '@/lib/gui/data.ts';
import type { Settings } from '@/lib/gui/settings.ts';
import { HTML_LANG } from '@/lib/gui/strings.ts';
import { translate } from '@/lib/gui/text.ts';
import { UI_KEYS } from '@/lib/gui/ui-keys.ts';

// medidas do jogo (OptionsScreen): botões de 150×20 em duas colunas, 4 px entre eles (ou uma coluna, se não couber);
// "Concluído" com 200 de largura
const BUTTON_WIDTH = 150;
const DONE_WIDTH = 200;
const GAP = 4;

interface Props {
  data: VersionData;
  settings: Settings;
  onChange: (change: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsScreen({ data, settings, onChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const t = (key: string, ...args: string[]) => translate(data, key, ...args);
  const option = (label: string, value: string) => t(UI_KEYS.genericValue, label, value);
  // nome do idioma no próprio idioma, como na tela de idiomas do jogo: "Português (Brasil)"
  const languageName = `${data.lang[UI_KEYS.languageName] ?? settings.locale} (${data.lang[UI_KEYS.languageRegion] ?? ''})`;
  const nextLocale = LOCALES[(LOCALES.indexOf(settings.locale) + 1) % LOCALES.length]!;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      lang={HTML_LANG[settings.locale]}
      class="m-0 h-dvh max-h-none w-dvw max-w-none bg-black/70 p-0 text-white backdrop-blur-sm backdrop:bg-transparent"
      style={gameText}
      onClose={onClose}
    >
      <div class="flex h-full flex-col items-center overflow-y-auto" style={{ padding: `${u(15)} ${u(8)}`, gap: u(20) }}>
        <h2 id="settings-title" style={{ textShadow: textShadow(0xffffff) }}>
          {t(UI_KEYS.optionsTitle)}
        </h2>

        <div class="grid w-full justify-center" style={{ gridTemplateColumns: `repeat(auto-fit, ${u(BUTTON_WIDTH)})`, gap: u(GAP), maxWidth: u(BUTTON_WIDTH * 2 + GAP) }}>
          <GuiButton data={data} width={BUTTON_WIDTH} label={option(t(UI_KEYS.languageTitle), languageName)} onClick={() => onChange({ locale: nextLocale })} />
          <GuiButton
            data={data}
            width={BUTTON_WIDTH}
            aria-pressed={settings.programmerArt}
            label={option(t(UI_KEYS.programmerArt), t(settings.programmerArt ? UI_KEYS.on : UI_KEYS.off))}
            onClick={() => onChange({ programmerArt: !settings.programmerArt })}
          />
          <GuiButton
            data={data}
            width={BUTTON_WIDTH}
            aria-pressed={settings.advancedTooltips}
            label={t(settings.advancedTooltips ? UI_KEYS.advancedTooltipsOn : UI_KEYS.advancedTooltipsOff)}
            onClick={() => onChange({ advancedTooltips: !settings.advancedTooltips })}
          />
        </div>

        <GuiButton data={data} width={DONE_WIDTH} class="mt-auto shrink-0" label={t(UI_KEYS.done)} onClick={() => dialogRef.current?.close()} />
      </div>
    </dialog>
  );
}
