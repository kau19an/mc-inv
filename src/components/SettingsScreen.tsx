// tela de opções, no estilo do menu de opções do jogo: fundo escurecido, título branco no topo, botões de alternar
// e "Concluído" embaixo. os textos são os do próprio jogo (ui-keys.ts), então saem como no jogo em cada idioma.
// é um <dialog> nativo: prende o foco do teclado lá dentro e fecha com Esc, como o jogo
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FRAME_CLASS, GuiButton, frameStyle, gameText, hex, textShadow, u } from './gui/GuiParts.tsx';
import GameTooltip, { lineOf, wrapText, type TooltipPlacement } from './gui/GameTooltip.tsx';
import { LOCALES, type VersionData } from '@/lib/gui/data.ts';
import { PLAYER_NAME, type Settings } from '@/lib/gui/settings.ts';
import { fetchPlayerSkin, skinFace, type SkinError } from '@/lib/gui/skin.ts';
import { HTML_LANG, type Strings } from '@/lib/gui/strings.ts';
import { translate } from '@/lib/gui/text.ts';
import { UI_KEYS } from '@/lib/gui/ui-keys.ts';
import { WIKI_LANGUAGES, resolveWiki, wikiHost, type WikiCode, type WikiLanguage } from '@/lib/gui/wiki.ts';

// medidas do jogo (OptionsScreen): botões de 150×20 em duas colunas, 4 px entre eles (ou uma coluna, se não couber);
// "Concluído" com 200 de largura
const BUTTON_WIDTH = 150;
const DONE_WIDTH = 200;
const GAP = 4;
const ROW_WIDTH = BUTTON_WIDTH * 2 + GAP; // largura das duas colunas juntas
const CONFIRM_WIDTH = 70;
const PREVIEW_SIZE = 20; // quadrado da prévia do rosto: a altura da caixa de texto
const PREVIEW_DELAY_MS = 400; // espera a pessoa parar de digitar antes de buscar
const LABEL_COLOR = 0xa0a0a0; // cor dos rótulos acima das caixas de texto do jogo (ex.: "Nome do mundo")
const TEXT_COLOR = 0xe0e0e0; // texto dentro do EditBox
const ERROR_COLOR = 0xff5555; // §c
const SUCCESS_COLOR = 0x55ff55; // §a

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
  appliedName: string; // nome cuja skin está aplicada agora ('' = Steve)
  unit: number; // px de css por pixel da gui
  onChange: (change: Partial<Settings>) => void;
  onPlayerName: (name: string) => void;
  onClose: () => void;
}

// tooltips das opções (WidgetTooltipHolder, 26.3): texto branco quebrado em linhas de até 170 px (Tooltip.MAX_WIDTH),
// sem atraso. com o mouse em cima, MenuTooltipPositioner (ao lado do ponteiro, sem cobrir o botão); só com o foco do
// teclado, BelowOrAboveWidgetTooltipPositioner (embaixo do botão, ou em cima se não couber)
const TOOLTIP_WIDTH = 170;
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

// só duas mensagens (decisão do Kauan): deu certo (verde) ou não achou (vermelho). buscando e campo vazio: nada
function statusText(strings: Strings, status: SkinStatus): { text: string; color: number } | null {
  if (status.kind === 'found' || status.kind === 'default') return { text: strings.skinSuccess, color: SUCCESS_COLOR };
  if (status.kind === 'error') return { text: strings.skinNotFound, color: ERROR_COLOR };
  return null;
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

// quadradinho com o rosto da skin, na moldura da caixa de texto do jogo (ou no visual reserva dela).
// o rosto tem 8×8 pixels da skin, desenhados a 2 pixels da gui cada (16×16), centralizado
// jogador não encontrado: um "?" no lugar do rosto
function SkinPreview({ data, face, unknown }: { data: VersionData; face: ImageData | null; unknown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 8, 8);
    if (face) ctx.putImageData(face, 0, 0);
  }, [face]);
  const framed = Boolean(data.gui.frames?.text_field);
  return (
    <div
      class={framed ? `${FRAME_CLASS} relative grid shrink-0 place-items-center` : 'relative grid shrink-0 place-items-center border-solid border-[#a0a0a0] bg-black'}
      style={{ ...(framed ? frameStyle(data, 'text_field') : { borderWidth: u(1) }), width: u(PREVIEW_SIZE), height: u(PREVIEW_SIZE) }}
      aria-hidden="true"
    >
      <canvas ref={ref} width={8} height={8} class="[image-rendering:pixelated]" style={{ width: u(16), height: u(16) }} />
      {unknown && (
        <span class="absolute inset-0 grid place-items-center text-white" style={{ ...gameText, textShadow: textShadow(0xffffff) }}>
          ?
        </span>
      )}
    </div>
  );
}

export default function SettingsScreen({ data, settings, strings, skinStatus, appliedName, unit, onChange, onPlayerName, onClose }: Props) {
  const [name, setName] = useState(settings.playerName);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // tooltip aberta: texto e onde (em pixels da gui)
  // (guarda de quem é a tooltip; o texto vem do render atual, então some se o botão deixar de ter tooltip)
  const [tip, setTip] = useState<{ owner: string; placement: TooltipPlacement } | null>(null);
  const tooltipTexts: Record<string, string | undefined> = {};
  const widgetRect = (element: Element): WidgetRect => {
    const rect = element.getBoundingClientRect();
    return { left: Math.floor(rect.left / unit), top: Math.floor(rect.top / unit), right: Math.floor(rect.right / unit), bottom: Math.floor(rect.bottom / unit) };
  };
  // eventos que ligam a tooltip num botão (sem texto, nada)
  const tooltip = (owner: string, text: string | undefined) => {
    tooltipTexts[owner] = text;
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

  const t = (key: string, ...args: string[]) => translate(data, key, ...args);
  const option = (label: string, value: string) => t(UI_KEYS.genericValue, label, value);
  // nome do idioma no próprio idioma, como na tela de idiomas do jogo: "Português (Brasil)"
  const languageName = `${data.lang[UI_KEYS.languageName] ?? settings.locale} (${data.lang[UI_KEYS.languageRegion] ?? ''})`;
  const nextLocale = LOCALES[(LOCALES.indexOf(settings.locale) + 1) % LOCALES.length]!;
  const status = statusText(strings, skinStatus);
  // nome aplicado com sucesso: o campo passa a mostrar a grafia oficial ("kauan" → "Kauan")
  useEffect(() => {
    setName((current) => (current.trim().toLowerCase() === appliedName.toLowerCase() ? appliedName : current));
  }, [appliedName]);
  // confirmar o nome que já está aplicado (ou enquanto busca) não faz nada: o botão fica desativado.
  // nomes do jogo não diferenciam maiúsculas ("kauan" e "Kauan" são o mesmo jogador)
  const trimmed = name.trim();
  const alreadyApplied = trimmed.toLowerCase() === appliedName.toLowerCase();
  const submitName = () => {
    if (confirmDisabled) return;
    setName(trimmed);
    onPlayerName(trimmed);
  };

  // Minecraft Wiki: automático (segue o idioma) ou uma wiki fixa. o nome do idioma vem do navegador, no idioma
  // da interface ("Francês", "French"), e embaixo aparece o endereço da wiki que os itens vão abrir
  const htmlLang = HTML_LANG[settings.locale];
  const languageNames = useMemo(() => new Intl.DisplayNames([htmlLang], { type: 'language', fallback: 'none' }), [htmlLang]);
  const wikiLanguageName = (code: WikiCode) => {
    const name = strings.wikiLanguageNames[code] ?? languageNames.of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(htmlLang) + name.slice(1);
  };
  const wikiValue = settings.wikiLanguage === 'auto' ? strings.wikiAuto : wikiLanguageName(settings.wikiLanguage);
  // ordem do botão: Automático e depois as wikis em ordem alfabética do nome no idioma da interface
  // ("Alemão, Chinês, Chinês clássico…" em português; "Chinese, Czech, Dutch…" em inglês)
  const wikiChoices = useMemo<WikiLanguage[]>(() => {
    const collator = new Intl.Collator(htmlLang);
    const codes = WIKI_LANGUAGES.map((wiki) => wiki.code).sort((a, b) => collator.compare(wikiLanguageName(a), wikiLanguageName(b)));
    return ['auto', ...codes];
  }, [htmlLang]);
  const cycleWiki = (step: number) => {
    const index = wikiChoices.indexOf(settings.wikiLanguage);
    onChange({ wikiLanguage: wikiChoices[(index + step + wikiChoices.length) % wikiChoices.length]! });
  };

  // prévia do rosto do nome digitado: busca quando a pessoa para de digitar (a resposta fica guardada, então o
  // Confirmar depois é instantâneo). campo vazio = Steve (o que vai ser aplicado); enquanto busca, fica o rosto
  // anterior. nome inválido ou que não existe = "?" e Confirmar travado; Mojang fora = quadrado vazio (dá pra tentar)
  const [preview, setPreview] = useState<{ name: string; face: ImageData | null; notFound: boolean }>({ name: '', face: null, notFound: false });
  useEffect(() => {
    const defaultSkin = data.player?.defaultSkin;
    if (!trimmed) {
      setPreview({ name: '', face: defaultSkin ? skinFace(defaultSkin) : null, notFound: false });
      return;
    }
    if (!PLAYER_NAME.test(trimmed)) {
      setPreview({ name: trimmed, face: null, notFound: true });
      return;
    }
    let current = true;
    const timer = setTimeout(async () => {
      const result = await fetchPlayerSkin(trimmed);
      if (!current) return;
      if ('error' in result) {
        setPreview({ name: trimmed, face: null, notFound: result.error === 'not_found' || result.error === 'invalid_name' });
        return;
      }
      const skin = result.skin ?? defaultSkin ?? null;
      setPreview({ name: trimmed, face: skin ? skinFace(skin) : null, notFound: false });
    }, PREVIEW_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, data]);
  // só vale pro nome que está no campo agora (enquanto a busca do nome novo não volta, não trava)
  const notFound = preview.notFound && preview.name === trimmed;
  // Confirmar travado: buscando, nome já aplicado ou jogador que não existe (submitName também confere)
  const confirmDisabled = skinStatus.kind === 'loading' || alreadyApplied || notFound;

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
          <GuiButton
            data={data}
            width={BUTTON_WIDTH}
            label={option(t(UI_KEYS.languageTitle), languageName)}
            onClick={() => onChange({ locale: nextLocale })}
            {...tooltip('language', strings.languageTooltip)}
          />
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
            <SkinPreview data={data} face={notFound ? null : preview.face} unknown={notFound} />
            <GameTextField data={data} value={name} label={strings.playerName} width={ROW_WIDTH - PREVIEW_SIZE - GAP - GAP - CONFIRM_WIDTH} onInput={setName} onEnter={submitName} />
            <GuiButton
              data={data}
              type="submit"
              width={CONFIRM_WIDTH}
              label={strings.confirm}
              disabled={confirmDisabled}
              {...tooltip('confirm', notFound ? strings.playerNotFoundTooltip : alreadyApplied ? strings.confirmDisabledTooltip : undefined)}
            />
          </form>
          {status && (
            <p role="status" class="self-start" style={{ color: hex(status.color), textShadow: textShadow(status.color) }}>
              {status.text}
            </p>
          )}
        </section>

        {/* idioma da Minecraft Wiki que os itens abrem */}
        <section class="flex w-full flex-col items-center" style={{ maxWidth: u(ROW_WIDTH), gap: u(4) }} aria-labelledby="settings-wiki">
          <h3 id="settings-wiki" style={{ textShadow: textShadow(0xffffff) }}>
            Minecraft Wiki
          </h3>
          {/* largura de uma opção, na coluna da esquerda */}
          <GuiButton
            data={data}
            width={BUTTON_WIDTH}
            class="self-start"
            label={option(t(UI_KEYS.languageTitle), wikiValue)}
            {...tooltip('wiki', strings.wikiTooltip)}
            onClick={(event) => cycleWiki(event.shiftKey ? -1 : 1)}
            onContextMenu={(event) => {
              event.preventDefault();
              cycleWiki(-1);
            }}
          />
          <p class="self-start" style={{ color: hex(LABEL_COLOR), textShadow: textShadow(LABEL_COLOR) }}>
            {wikiHost(resolveWiki(settings.wikiLanguage, settings.locale))}
          </p>
        </section>

        <GuiButton data={data} width={DONE_WIDTH} class="mt-auto shrink-0" label={t(UI_KEYS.done)} onClick={() => dialogRef.current?.close()} />
      </div>
      {tip && tooltipTexts[tip.owner] && (
        <GameTooltip data={data} unit={unit} lines={wrapText(data, tooltipTexts[tip.owner]!, TOOLTIP_WIDTH).map((line) => lineOf(line, 0xffffff))} placement={tip.placement} />
      )}
    </dialog>
  );
}
