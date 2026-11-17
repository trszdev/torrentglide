import type { Signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Language, RqbitClient } from 'range-player/core';
import type { Settings } from '../services/settings.ts';
import type { StorageArea } from '../services/storage.ts';
import type { AppState } from '../state/app.ts';
export interface Page {
    app: AppState;
    client: RqbitClient;
    settings: Signal<Settings>;
    local: StorageArea;
    language: Language;
    browserLanguage: Language;
    wasmUrl: string;
    openId: string | null;
    debug: boolean;
}
export const PageContext = createContext<Page | null>(null);
export function usePage(): Page {
    const page = useContext(PageContext);
    if (!page)
        throw new Error('usePage outside PageContext');
    return page;
}
