import { isLanguage, type Language } from 'range-player/core';
import { THEMES, type Theme } from '../services/settings.ts';
const THEME_KEY = 'theme';
const LANGUAGE_KEY = 'language';
export function applyTheme(theme: Theme): void {
    if (theme === 'system')
        delete document.documentElement.dataset.theme;
    else
        document.documentElement.dataset.theme = theme;
}
export function applyLanguage(language: Language): void {
    document.documentElement.lang = language;
}
export function applyCached(): void {
    const theme = read(THEME_KEY);
    if (THEMES.includes(theme as Theme))
        applyTheme(theme as Theme);
    const language = read(LANGUAGE_KEY);
    if (isLanguage(language))
        applyLanguage(language);
}
export function cache(theme: Theme, language: Language): void {
    try {
        localStorage.setItem(THEME_KEY, theme);
        localStorage.setItem(LANGUAGE_KEY, language);
    }
    catch {
    }
}
function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
