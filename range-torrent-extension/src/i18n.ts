import { createTranslator, resolveLanguage, type Language, type Translator } from 'range-player/core';
import { de } from './locales/de.ts';
import { en, type MessageKey } from './locales/en.ts';
import { es } from './locales/es.ts';
import { fr } from './locales/fr.ts';
import { it } from './locales/it.ts';
import { ja } from './locales/ja.ts';
import { pl } from './locales/pl.ts';
import { ptBR } from './locales/pt-BR.ts';
import { ru } from './locales/ru.ts';
import { tr } from './locales/tr.ts';
import { uk } from './locales/uk.ts';
import { zhCN } from './locales/zh-CN.ts';
import type { LanguageSetting } from './services/settings.ts';
export type { MessageKey };
export type ExtensionText = Translator<MessageKey>;
export const CATALOGS = { en, de, es, fr, it, ja, pl, 'pt-BR': ptBR, ru, tr, uk, 'zh-CN': zhCN } as const;
export function extensionText(language: Language): ExtensionText {
    return createTranslator(language, en, CATALOGS);
}
export function languageFor(setting: LanguageSetting, preferred: readonly string[]): Language {
    return setting === 'auto' ? resolveLanguage(preferred) : setting;
}
