// tela de opções, no estilo do menu de opções do jogo: fundo escurecido, título branco no topo, botões de alternar
// e "Concluído" embaixo. os textos são os do próprio jogo (ui-keys.ts), então saem como no jogo em cada idioma.
// é um <dialog> nativo: prende o foco do teclado lá dentro e fecha com Esc, como o jogo
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FRAME_CLASS, GuiButton, fitWidth, frameStyle, gameText, hex, textShadow, u } from './gui/GuiParts.tsx';
import GameTextField from './gui/GameTextField.tsx';
import { useWidgetTooltip } from './gui/useWidgetTooltip.tsx';
import { LOCALES, type VersionData } from '@/lib/gui/data.ts';
import { PLAYER_NAME, type Settings } from '@/lib/gui/settings.ts';
import { DEFAULT_PLAYER_NAME, fetchPlayerSkin, skinFace, type SkinError } from '@/lib/gui/skin.ts';
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
const ERROR_COLOR = 0xff5555; // §c
const SUCCESS_COLOR = 0x55ff55; // §a

// situação da busca da skin (mostrada embaixo do campo)
export type SkinStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; name: string }
  | { kind: 'default'; name: string } // jogador existe, mas não tem skin própria
  | { kind: 'reset' } // campo vazio: volta pra skin padrão (Faariaz)
  | { kind: 'error'; error: SkinError };

interface Props {
  data: VersionData;
  settings: Settings;
  strings: Strings;
  skinStatus: SkinStatus;
  appliedName: string; // nome cuja skin está aplicada agora ('' = skin padrão, a do Faariaz)
  unit: number; // px de css por pixel da gui
  onChange: (change: Partial<Settings>) => void;
  onPlayerName: (name: string) => void;
  onClose: () => void;
}

// só duas mensagens (decisão do Kauan): deu certo (verde) ou não achou (vermelho). buscando e campo vazio: nada
function statusText(strings: Strings, status: SkinStatus): { text: string; color: number } | null {
  if (status.kind === 'found' || status.kind === 'default') return { text: strings.skinSuccess, color: SUCCESS_COLOR };
  if (status.kind === 'error') return { text: strings.skinNotFound, color: ERROR_COLOR };
  return null;
}

// fundo das telas de menu do jogo: o que está atrás desfocado (--menu-blur) e, por cima, a textura
// menu_background repetida (preto a 25%). versão publicada sem ela: preto a 70%
export function menuBackground(data: VersionData) {
  const tile = data.gui.tiles?.menu_background;
  if (!tile) return { background: 'rgb(0 0 0 / 0.7)' };
  return { backgroundImage: `url("${tile.src}")`, backgroundSize: `${u(tile.width)} ${u(tile.height)}` };
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

  // tooltips dos botões, como as das opções do jogo
  const { tooltip, renderTooltip } = useWidgetTooltip(data, unit);

  const t = (key: string, ...args: string[]) => translate(data, key, ...args);
  // linha da skin: as duas colunas (304) ou, em tela estreita, o que couber
  const rowWidth = fitWidth(ROW_WIDTH, unit);
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
  // Confirmar depois é instantâneo). campo vazio = skin padrão, a do Faariaz (o que vai ser aplicado); enquanto busca, fica o rosto
  // anterior. nome inválido ou que não existe = "?" e Confirmar travado; Mojang fora = quadrado vazio (dá pra tentar)
  const [preview, setPreview] = useState<{ name: string; face: ImageData | null; notFound: boolean }>({ name: '', face: null, notFound: false });
  // ao abrir a tela, o nome já é o aplicado (a skin dele já foi buscada e está guardada): busca na hora, sem a espera
  // de quem está digitando, pra prévia já aparecer pronta
  const typed = useRef(false);
  useEffect(() => {
    const defaultSkin = data.player?.defaultSkin;
    // campo vazio: rosto da skin padrão (a do Faariaz; Steve se a busca falhar), sem a espera da digitação
    if (!trimmed) {
      let current = true;
      fetchPlayerSkin(DEFAULT_PLAYER_NAME).then((result) => {
        if (!current) return;
        const skin = ('error' in result ? null : result.skin) ?? defaultSkin ?? null;
        setPreview({ name: '', face: skin ? skinFace(skin) : null, notFound: false });
      });
      return () => {
        current = false;
      };
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
    }, typed.current ? PREVIEW_DELAY_MS : 0);
    typed.current = true;
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
      class="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 text-white backdrop-blur-[var(--menu-blur)] backdrop:bg-transparent"
      style={{ ...gameText, ...menuBackground(data) }}
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
        <section class="flex w-full flex-col items-center" style={{ maxWidth: u(rowWidth), gap: u(4) }} aria-labelledby="settings-skins">
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
            <GameTextField data={data} value={name} maxLength={16} label={strings.playerName} width={rowWidth - PREVIEW_SIZE - GAP - GAP - CONFIRM_WIDTH} onInput={setName} onEnter={submitName} />
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
        <section class="flex w-full flex-col items-center" style={{ maxWidth: u(rowWidth), gap: u(4) }} aria-labelledby="settings-wiki">
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
      {renderTooltip()}
    </dialog>
  );
}
