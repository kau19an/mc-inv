// tela de opções, no estilo do menu de opções do jogo: fundo escurecido, título branco no topo, botões de alternar
// e "Concluído" embaixo. os textos são os do próprio jogo (ui-keys.ts), então saem como no jogo em cada idioma.
// é um <dialog> nativo: prende o foco do teclado lá dentro e fecha com Esc, como o jogo
import { useEffect, useRef, useState } from 'preact/hooks';
import { FRAME_CLASS, GuiButton, frameStyle, gameText, hex, textShadow, u } from './gui/GuiParts.tsx';
import { LOCALES, type VersionData } from '@/lib/gui/data.ts';
import type { Settings } from '@/lib/gui/settings.ts';
import type { SkinError } from '@/lib/gui/skin.ts';
import { HTML_LANG, type Strings } from '@/lib/gui/strings.ts';
import { translate } from '@/lib/gui/text.ts';
import { UI_KEYS } from '@/lib/gui/ui-keys.ts';

// medidas do jogo (OptionsScreen): botões de 150×20 em duas colunas, 4 px entre eles (ou uma coluna, se não couber);
// "Concluído" com 200 de largura
const BUTTON_WIDTH = 150;
const DONE_WIDTH = 200;
const GAP = 4;
const ROW_WIDTH = BUTTON_WIDTH * 2 + GAP; // largura das duas colunas juntas
const CONFIRM_WIDTH = 70;
const LABEL_COLOR = 0xa0a0a0; // cor dos rótulos acima das caixas de texto do jogo (ex.: "Nome do mundo")
const TEXT_COLOR = 0xe0e0e0; // texto dentro do EditBox
const ERROR_COLOR = 0xff5555;

// situação da busca da skin (mostrada embaixo do campo)
export type SkinStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; name: string }
  | { kind: 'default'; name: string } // jogador existe, mas não tem skin própria
  | { kind: 'reset' } // campo vazio: volta pro Steve
  | { kind: 'error'; error: SkinError };

interface Props {
  data: VersionData;
  settings: Settings;
  strings: Strings;
  skinStatus: SkinStatus;
  onChange: (change: Partial<Settings>) => void;
  onPlayerName: (name: string) => void;
  onClose: () => void;
}

function statusText(strings: Strings, status: SkinStatus): { text: string; error: boolean } | null {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'loading':
      return { text: strings.skinLoading, error: false };
    case 'found':
      return { text: strings.skinFound(status.name), error: false };
    case 'default':
      return { text: strings.skinDefault(status.name), error: false };
    case 'reset':
      return { text: strings.skinReset, error: false };
    case 'error': {
      const messages: Record<SkinError, string> = { invalid_name: strings.skinInvalid, not_found: strings.skinNotFound, upstream: strings.skinUpstream, unavailable: strings.skinUnavailable };
      return { text: messages[status.error], error: true };
    }
  }
}

// caixa de texto do jogo (EditBox com moldura): moldura widget/text_field (clara com foco), texto a 4 px da borda.
// fonte de 16 px encolhida por escala até o tamanho da gui (abaixo de 16 px, o iphone dá zoom ao focar)
function GameTextField({ data, value, label, width, onInput, onEnter }: { data: VersionData; value: string; label: string; width: number; onInput: (value: string) => void; onEnter: () => void }) {
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
        maxLength={16}
        autoComplete="off"
        autoCapitalize="none"
        spellcheck={false}
        enterKeyHint="done"
        aria-label={label}
        class="absolute top-0 left-0 origin-top-left cursor-text border-0 bg-transparent p-0 outline-none selection:bg-[#0000ff] selection:text-white"
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
        onKeyDown={(event) => event.key === 'Enter' && onEnter()}
      />
    </div>
  );
}

export default function SettingsScreen({ data, settings, strings, skinStatus, onChange, onPlayerName, onClose }: Props) {
  const [name, setName] = useState(settings.playerName);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const t = (key: string, ...args: string[]) => translate(data, key, ...args);
  const option = (label: string, value: string) => t(UI_KEYS.genericValue, label, value);
  // nome do idioma no próprio idioma, como na tela de idiomas do jogo: "Português (Brasil)"
  const languageName = `${data.lang[UI_KEYS.languageName] ?? settings.locale} (${data.lang[UI_KEYS.languageRegion] ?? ''})`;
  const nextLocale = LOCALES[(LOCALES.indexOf(settings.locale) + 1) % LOCALES.length]!;
  const status = statusText(strings, skinStatus);
  const submitName = () => {
    const trimmed = name.trim();
    setName(trimmed);
    onPlayerName(trimmed);
  };

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
          <GuiButton
            data={data}
            width={BUTTON_WIDTH}
            aria-pressed={settings.operatorItemsTab}
            label={option(t(UI_KEYS.operatorItemsTab), t(settings.operatorItemsTab ? UI_KEYS.on : UI_KEYS.off))}
            onClick={() => onChange({ operatorItemsTab: !settings.operatorItemsTab })}
          />
        </div>

        {/* skin do jogador na aba "Inventário" */}
        <section class="flex w-full flex-col items-center" style={{ maxWidth: u(ROW_WIDTH), gap: u(4) }} aria-labelledby="settings-skins">
          <h3 id="settings-skins" style={{ textShadow: textShadow(0xffffff) }}>
            {strings.skins}
          </h3>
          <label class="self-start" style={{ color: hex(LABEL_COLOR), textShadow: textShadow(LABEL_COLOR) }}>
            {strings.playerName}
          </label>
          <form
            class="flex w-full justify-center"
            style={{ gap: u(GAP) }}
            onSubmit={(event) => {
              event.preventDefault();
              submitName();
            }}
          >
            <GameTextField data={data} value={name} label={strings.playerName} width={ROW_WIDTH - GAP - CONFIRM_WIDTH} onInput={setName} onEnter={submitName} />
            <GuiButton data={data} type="submit" width={CONFIRM_WIDTH} label={strings.confirm} />
          </form>
          {status && (
            <p role="status" class="self-start" style={{ color: hex(status.error ? ERROR_COLOR : LABEL_COLOR), textShadow: textShadow(status.error ? ERROR_COLOR : LABEL_COLOR) }}>
              {status.text}
            </p>
          )}
        </section>

        <GuiButton data={data} width={DONE_WIDTH} class="mt-auto shrink-0" label={t(UI_KEYS.done)} onClick={() => dialogRef.current?.close()} />
      </div>
    </dialog>
  );
}
