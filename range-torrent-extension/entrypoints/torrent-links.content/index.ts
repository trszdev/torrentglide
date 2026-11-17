import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { extensionText, languageFor, type ExtensionText } from '../../src/i18n.ts';
import { FetchTorrentError, openRequestFor } from '../../src/services/fetch-torrent.ts';
import { onMessage, sendMessage } from '../../src/services/messaging.ts';
import { DEFAULT_SETTINGS, readSettings, watchSettings, type Settings } from '../../src/services/settings.ts';
import { browserArea, type BrowserStorage } from '../../src/services/storage.ts';
import { torrentLink, type TorrentLink } from '../../src/services/torrent-links.ts';
import { showCard, type Card } from './card.ts';
export default defineContentScript({
    matches: ['http://*/*', 'https://*/*'],
    runAt: 'document_start',
    main(ctx) {
        let replaying: HTMLAnchorElement | null = null;
        let card: Card | null = null;
        const local = browserArea(browser.storage as unknown as BrowserStorage, 'local');
        const preferred = [...navigator.languages, browser.i18n.getUILanguage()];
        let settings: Settings = DEFAULT_SETTINGS;
        let text: ExtensionText = extensionText(languageFor(settings.language, preferred));
        const apply = (next: Settings) => {
            settings = next;
            text = extensionText(languageFor(next.language, preferred));
        };
        void readSettings(local).then(apply);
        const stopWatching = watchSettings(local, apply);
        const replay = (anchor: HTMLAnchorElement) => {
            replaying = anchor;
            try {
                anchor.click();
            }
            finally {
                replaying = null;
            }
        };
        const open = async (link: TorrentLink) => {
            let request;
            try {
                request = await openRequestFor(link, (url, init) => fetch(url, init));
            }
            catch (err) {
                throw new Error(fetchErrorText(text, err));
            }
            const reply = await sendMessage('openPlayer', request).catch(() => undefined);
            if (!reply)
                throw new Error(text.t('card.noAnswer'));
            if (!reply.ok)
                throw new Error(reply.error);
        };
        const ask = (link: TorrentLink, useDefault: () => void): Card => {
            card?.close();
            const shown = showCard(link, {
                open: () => open(link),
                useDefault,
                onClose: () => {
                    if (card === shown)
                        card = null;
                },
            }, text, settings.theme);
            card = shown;
            return shown;
        };
        ctx.addEventListener(window, 'click', (event) => {
            if (ctx.isInvalid)
                return;
            if (!event.isTrusted || event.defaultPrevented || event.button !== 0)
                return;
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
                return;
            const anchor = event
                .composedPath()
                .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && node.href !== '');
            if (!anchor || anchor === replaying)
                return;
            const link = torrentLink(anchor.href, {
                type: anchor.type,
                download: anchor.getAttribute('download'),
                text: [anchor.textContent, anchor.title, anchor.getAttribute('aria-label')].join(' '),
            });
            if (!link)
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            ask(link, () => replay(anchor));
        }, { capture: true });
        const stopListening = onMessage('openLink', ({ data: url }) => {
            const link = torrentLink(url) ?? { kind: 'torrent-file', url, name: null };
            open(link).catch((err: unknown) => {
                const anchor = Object.assign(document.createElement('a'), { href: url, download: '' });
                ask(link, () => replay(anchor)).fail(err instanceof Error ? err.message : String(err));
            });
            return { accepted: true };
        });
        ctx.onInvalidated(() => {
            card?.close();
            if (browser.runtime?.id) {
                stopWatching();
                stopListening();
            }
        });
    },
});
function fetchErrorText({ t }: ExtensionText, err: unknown): string {
    if (!(err instanceof FetchTorrentError))
        return err instanceof Error ? err.message : String(err);
    if (err.code === 'site-status')
        return t('card.siteStatus', { status: err.detail });
    return err.detail ? t('card.notTorrentType', { type: err.detail }) : t('card.notTorrent');
}
