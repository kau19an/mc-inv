// opções do inventário, salvas neste navegador (localStorage). se o armazenamento estiver bloqueado,
// tudo funciona igual — só não lembra na próxima visita
import type { Locale } from './data.ts';

export interface Settings {
  locale: Locale;
  programmerArt: boolean;
  advancedTooltips: boolean; // também liga/desliga com F3+H
  playerName: string; // nick da Edição Java pra skin na aba "Inventário" ('' = Steve)
}

const KEY = 'mc-inv:settings';
const LEGACY_ADVANCED_KEY = 'mc-inv:advanced-tooltips'; // antes das opções, o F3+H salvava só isso

// nome de jogador válido no jogo: letras, números e sublinhado, até 16
export const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;

export const DEFAULT_SETTINGS: Settings = { locale: 'pt_br', programmerArt: false, advancedTooltips: false, playerName: '' };

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    const legacyAdvanced = localStorage.getItem(LEGACY_ADVANCED_KEY) === '1';
    return {
      locale: saved?.locale === 'en_us' ? 'en_us' : 'pt_br',
      programmerArt: saved?.programmerArt === true,
      advancedTooltips: saved?.advancedTooltips ?? legacyAdvanced,
      playerName: typeof saved?.playerName === 'string' && PLAYER_NAME.test(saved.playerName) ? saved.playerName : '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_ADVANCED_KEY);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}
