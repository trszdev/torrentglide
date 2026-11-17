import '../../src/ui/style.css';
import { signal } from '@preact/signals';
import wasmUrl from 'movi-player/movi.wasm?url';
import { render } from 'preact';
import { RqbitClient } from 'range-player/core';
import { browser } from 'wxt/browser';
import { extensionText, languageFor } from '../../src/i18n.ts';
import { openParam } from '../../src/services/open-request.ts';
import { hostPermissionFor } from '../../src/services/permissions.ts';
import { readSettings, watchSettings } from '../../src/services/settings.ts';
import { browserArea, type BrowserStorage } from '../../src/services/storage.ts';
import { createAppState } from '../../src/state/app.ts';
import { App } from '../../src/ui/App.tsx';
import { PageContext } from '../../src/ui/context.ts';
import { browserEnv } from '../../src/ui/env.ts';
import { applyCached, applyLanguage, applyTheme, cache } from '../../src/ui/theme.ts';
applyCached();
async function main(): Promise<void> {
    const storage = browser.storage as unknown as BrowserStorage;
    const local = browserArea(storage, 'local');
    const session = browserArea(storage, 'session');
    const stored = await readSettings(local);
    const preferred = [...navigator.languages, browser.i18n.getUILanguage()];
    const language = languageFor(stored.language, preferred);
    const browserLanguage = languageFor('auto', preferred);
    applyTheme(stored.theme);
    applyLanguage(language);
    cache(stored.theme, language);
    const settings = signal(stored);
    watchSettings(local, (next) => {
        settings.value = next;
        const theme = next.theme;
        applyTheme(theme);
        cache(theme, language);
    });
    const { id: openId, url } = openParam(location.href);
    if (openId) {
        const current = history.state;
        const target = url;
        history.replaceState(current, '', target);
    }
    const client = new RqbitClient(stored.rqbitUrl);
    const app = createAppState({
        client,
        local,
        session,
        env: browserEnv(),
        allowed: () => browser.permissions.contains({ origins: [hostPermissionFor(client.baseUrl)] }),
        inIncognito: browser.extension.inIncognitoContext,
        text: extensionText(language),
    });
    const root = document.getElementById('app');
    if (!root)
        return;
    render(<PageContext.Provider value={{
            app,
            client,
            settings,
            local,
            language,
            browserLanguage,
            wasmUrl,
            openId,
            debug: new URLSearchParams(location.search).has('debug'),
        }}>
      <App />
    </PageContext.Provider>, root);
}
void main();
