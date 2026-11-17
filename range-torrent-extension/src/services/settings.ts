import { isLanguage, type Language } from 'range-player/core';
import { hostPermissionFor } from './permissions.ts';
import type { StorageArea } from './storage.ts';
export const DEFAULT_RQBIT_URL = 'http://localhost:3030';
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export type LanguageSetting = 'auto' | Language;
export interface Settings {
    rqbitUrl: string;
    theme: Theme;
    language: LanguageSetting;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = {
    rqbitUrl: DEFAULT_RQBIT_URL,
    theme: 'system',
    language: 'auto',
};
const VALID: {
    [K in keyof Settings]: (value: unknown) => value is Settings[K];
} = {
    rqbitUrl: (value): value is string => typeof value === 'string' && isRqbitUrl(value),
    theme: (value): value is Theme => THEMES.includes(value as Theme),
    language: (value): value is LanguageSetting => value === 'auto' || isLanguage(value),
};
const KEYS = Object.keys(VALID) as (keyof Settings)[];
export async function readSettings(area: StorageArea): Promise<Settings> {
    const stored = await area.get(KEYS);
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of KEYS) {
        const value = stored[key];
        if (VALID[key](value))
            (settings as Record<keyof Settings, unknown>)[key] = value;
    }
    return settings;
}
export function saveSettings(area: StorageArea, settings: Partial<Settings>): Promise<void> {
    return area.set(settings);
}
export function watchSettings(area: StorageArea, listener: (settings: Settings) => void): () => void {
    let latest = 0;
    return area.watch((changes) => {
        if (!KEYS.some((key) => key in changes))
            return;
        const call = ++latest;
        void readSettings(area).then((settings) => {
            if (call === latest)
                listener(settings);
        });
    });
}
export type SaveOutcome = {
    kind: 'close';
} | {
    kind: 'reload';
} | {
    kind: 'reopen';
    permission: string;
};
export function saveOutcome(saved: Settings, next: Settings): SaveOutcome {
    if (next.rqbitUrl !== saved.rqbitUrl)
        return { kind: 'reopen', permission: hostPermissionFor(next.rqbitUrl) };
    if (next.language !== saved.language)
        return { kind: 'reload' };
    return { kind: 'close' };
}
export class RqbitUrlError extends Error {
    override name = 'RqbitUrlError';
    constructor(readonly code: 'empty' | 'invalid' | 'not-http', readonly detail = '') {
        super(detail ? `${code}: ${detail}` : code);
    }
}
export function normalizeRqbitUrl(text: string): string {
    const value = text.trim();
    if (!value)
        throw new RqbitUrlError('empty');
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    if (!URL.canParse(withScheme))
        throw new RqbitUrlError('invalid', value);
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new RqbitUrlError('not-http');
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}
export function rqbitUrlFromField(text: string): string {
    return text.trim() ? normalizeRqbitUrl(text) : DEFAULT_RQBIT_URL;
}
function isRqbitUrl(value: string): boolean {
    try {
        return normalizeRqbitUrl(value) === value;
    }
    catch {
        return false;
    }
}
