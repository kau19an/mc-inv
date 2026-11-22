// componentes de texto do jogo ({"translate": "...", "with": [...], "color": "...", "extra": [...]}) viram
// pedaços de texto com estilo, prontos pra desenhar. as traduções seguem o formato do java (%s, %1$s, %%),
// e cada argumento herda o estilo de quem o contém, como no jogo
import { FORMAT_COLORS } from './colors.ts';

export interface TextStyle {
  color?: number;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export interface TextRun {
  text: string;
  style: TextStyle;
}

type Json = string | number | boolean | null | JsonObject | Json[];
interface JsonObject {
  [key: string]: Json;
}

export interface Translations {
  lang: Record<string, string>;
  fallbackLang: Record<string, string>;
}

function parseColor(value: Json): number | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('#')) return Number.parseInt(value.slice(1), 16);
  return FORMAT_COLORS[value as keyof typeof FORMAT_COLORS];
}

function styleOf(component: JsonObject, parent: TextStyle): TextStyle {
  const style: TextStyle = { ...parent };
  const color = parseColor(component.color ?? null);
  if (color !== undefined) style.color = color;
  for (const key of ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'] as const) if (typeof component[key] === 'boolean') style[key] = component[key] as boolean;
  return style;
}

function push(out: TextRun[], text: string, style: TextStyle) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && JSON.stringify(last.style) === JSON.stringify(style)) last.text += text;
  else out.push({ text, style });
}

function flatten(component: Json, translations: Translations, parent: TextStyle, out: TextRun[]): void {
  if (component === null || component === undefined) return;
  if (typeof component !== 'object') return push(out, String(component), parent);
  if (Array.isArray(component)) {
    // lista: o primeiro é o "pai" dos demais
    const [head, ...rest] = component;
    if (head === undefined) return;
    const style = head && typeof head === 'object' && !Array.isArray(head) ? styleOf(head, parent) : parent;
    flatten(head, translations, parent, out);
    for (const child of rest) flatten(child, translations, style, out);
    return;
  }
  const style = styleOf(component, parent);
  if (typeof component.text === 'string') push(out, component.text, style);
  else if (typeof component.translate === 'string') {
    const key = component.translate;
    const template = translations.lang[key] ?? translations.fallbackLang[key] ?? (typeof component.fallback === 'string' ? component.fallback : key);
    const args = Array.isArray(component.with) ? component.with : [];
    let next = 0;
    // %s, %1$s, %% (o jogo só aceita "s")
    const pattern = /%(?:(\d+)\$)?([s%])/g;
    let cursor = 0;
    for (const match of template.matchAll(pattern)) {
      push(out, template.slice(cursor, match.index), style);
      cursor = match.index! + match[0].length;
      if (match[2] === '%') push(out, '%', style);
      else {
        const index = match[1] ? Number(match[1]) - 1 : next++;
        flatten(args[index] ?? '', translations, style, out);
      }
    }
    push(out, template.slice(cursor), style);
  }
  if (Array.isArray(component.extra)) for (const child of component.extra) flatten(child, translations, style, out);
}

export function textRuns(component: unknown, translations: Translations, base: TextStyle = {}): TextRun[] {
  const out: TextRun[] = [];
  flatten(component as Json, translations, base, out);
  return out;
}

export const plainText = (runs: TextRun[]) => runs.map((run) => run.text).join('');
