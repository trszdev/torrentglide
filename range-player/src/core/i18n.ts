export const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'pl', name: 'Polski' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'ru', name: 'Русский' },
    { code: 'uk', name: 'Українська' },
    { code: 'ja', name: '日本語' },
    { code: 'zh-CN', name: '简体中文' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & {
    other: string;
};
export type Message = string | PluralMessage;
export type Vars = Record<string, string | number>;
export function isLanguage(value: unknown): value is Language {
    return LANGUAGES.some((language) => language.code === value);
}
export function languageName(code: Language): string {
    return LANGUAGES.find((language) => language.code === code)?.name ?? code;
}
export function resolveLanguage(preferred: readonly string[]): Language {
    for (const tag of preferred) {
        const lower = tag.toLowerCase();
        const exact = LANGUAGES.find((language) => language.code.toLowerCase() === lower);
        if (exact)
            return exact.code;
        const [base, ...rest] = lower.split(/[-_]/);
        if (base === 'zh') {
            if (!rest.length || rest.some((part) => ['cn', 'sg', 'my', 'hans'].includes(part)))
                return 'zh-CN';
            continue;
        }
        const sameBase = LANGUAGES.find((language) => language.code.toLowerCase().split('-')[0] === base);
        if (sameBase)
            return sameBase.code;
    }
    return 'en';
}
export interface Translator<K extends string> {
    readonly language: Language;
    t(key: K, vars?: Vars): string;
}
export function createTranslator<K extends string>(language: Language, english: Record<K, Message>, catalogs: Partial<Record<Language, Record<K, Message>>>): Translator<K> {
    const catalog = catalogs[language] ?? english;
    const plurals = new Intl.PluralRules(language);
    return {
        language,
        t(key, vars = {}) {
            const message = catalog[key] ?? english[key];
            const text = typeof message === 'string' ? message : (message[plurals.select(Number(vars.n ?? 0))] ?? message.other);
            return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in vars ? String(vars[name]) : placeholder));
        },
    };
}
