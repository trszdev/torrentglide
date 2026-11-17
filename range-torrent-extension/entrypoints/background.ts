import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { extensionText, languageFor } from '../src/i18n.ts';
import { createMenuUpdater, MENU_ID, openLinkFromMenu } from '../src/services/context-menu.ts';
import { onMessage, sendMessage } from '../src/services/messaging.ts';
import type { OpenRequest } from '../src/services/open-request.ts';
import { openPlayerTab } from '../src/services/player-tab.ts';
import { readSettings, watchSettings } from '../src/services/settings.ts';
import { browserArea, type BrowserStorage } from '../src/services/storage.ts';
export default defineBackground(() => {
    const storage = browser.storage as unknown as BrowserStorage;
    const local = browserArea(storage, 'local');
    const session = browserArea(storage, 'session');
    const playerUrl = browser.runtime.getURL('/player.html');
    const preferred = () => [...navigator.languages, browser.i18n.getUILanguage()];
    const openPlayer = (request: OpenRequest | null, from: Browser.tabs.Tab | undefined) => openPlayerTab({ request, from, session, tabs: browser.tabs, playerUrl });
    const updateMenu = createMenuUpdater(browser.contextMenus, async () => {
        const { language } = await readSettings(local);
        return extensionText(languageFor(language, preferred())).t('menu.openLink');
    });
    browser.runtime.onInstalled.addListener(({ reason }) => {
        void updateMenu();
        if (needsInjection(reason))
            void injectIntoOpenTabs();
    });
    if (browser.extension.inIncognitoContext)
        void updateMenu();
    browser.runtime.onStartup.addListener(() => void updateMenu());
    let language: string | null = null;
    watchSettings(local, (settings) => {
        if (settings.language === language)
            return;
        language = settings.language;
        void updateMenu();
    });
    browser.action.onClicked.addListener((tab) => void openPlayer(null, tab));
    onMessage('openPlayer', async ({ data, sender }) => {
        try {
            await openPlayer(data, sender.tab);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    browser.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId !== MENU_ID || !info.linkUrl)
            return;
        void openLinkFromMenu({
            url: info.linkUrl,
            tab,
            frameId: info.frameId,
            askContentScript: (tabId, frameId, url) => sendMessage('openLink', url, { tabId, frameId }),
            openPlayer,
        });
    });
});
const needsInjection = (reason: string): boolean => {
    const isInstall = reason === 'install';
    const isUpdate = reason === 'update';
    return isInstall || isUpdate;
};
async function injectIntoOpenTabs(): Promise<void> {
    const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.all(tabs.map(async (tab) => {
        if (tab.id === undefined)
            return;
        const target = { tabId: tab.id };
        await browser.scripting
            .executeScript({ target, files: ['/content-scripts/torrent-links.js'] })
            .catch(() => {
        });
    }));
}
