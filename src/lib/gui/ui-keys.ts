// chaves de tradução do próprio jogo usadas na interface (opções, botões). o build-data publica essas chaves
// nos arquivos de idioma de cada versão, então os textos saem exatamente como no jogo (traduções do Crowdin)
export const UI_KEYS = {
  optionsButton: 'menu.options', // "Opções..." / "Options..." (menu de pausa)
  optionsTitle: 'options.title', // "Opções" / "Options"
  languageTitle: 'options.language.title', // "Idioma" / "Language"
  genericValue: 'options.generic_value', // "%s: %s"
  on: 'options.on', // "Sim" / "ON"
  off: 'options.off', // "Não" / "OFF"
  programmerArt: 'resourcePack.programmer_art.name', // "Arte do programador" / "Programmer Art"
  advancedTooltipsOn: 'debug.advanced_tooltips.on', // "Descrições avançadas: Visíveis" / "Advanced tooltips: shown"
  advancedTooltipsOff: 'debug.advanced_tooltips.off', // "Descrições avançadas: Ocultas" / "Advanced tooltips: hidden"
  operatorItemsTab: 'options.operatorItemsTab', // "Inventário de operador" / "Operator Items Tab"
  done: 'gui.done', // "Concluído" / "Done"
  languageName: 'language.name', // "Português" / "English"
  languageRegion: 'language.region', // "Brasil" / "United States"
  binSlot: 'inventory.binSlot', // "Destruir item" / "Destroy Item" (slot de destruir, aba "Inventário")
  hotbarInfo: 'inventory.hotbarInfo', // "Salve a barra rápida com %1$s + %2$s" (barras salvas vazias)
} as const;
