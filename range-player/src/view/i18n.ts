import { createTranslator, type Language, type Translator } from '../core/i18n.ts';
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
export type { MessageKey };
export type PlayerText = Translator<MessageKey>;
export const CATALOGS = { en, de, es, fr, it, ja, pl, 'pt-BR': ptBR, ru, tr, uk, 'zh-CN': zhCN } as const;
export function playerText(language: Language): PlayerText {
    return createTranslator(language, en, CATALOGS);
}
