import LOGO from '../../assets/icon.svg?raw';
import type { ExtensionText } from '../../src/i18n.ts';
import type { Theme } from '../../src/services/settings.ts';
import type { TorrentLink } from '../../src/services/torrent-links.ts';
export interface CardHandlers {
    open(): Promise<void>;
    useDefault(): void;
    onClose(): void;
}
export interface Card {
    fail(message: string): void;
    close(): void;
}
export function showCard(link: TorrentLink, handlers: CardHandlers, { t }: ExtensionText, theme: Theme): Card {
    const host = document.createElement('torrentglide-card');
    if (theme !== 'system')
        host.dataset.theme = theme;
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
    <style>${STYLE}</style>
    <div class="card" role="dialog" aria-labelledby="title" aria-describedby="name">
      <div class="head">
        <span class="logo" aria-hidden="true">${LOGO}</span>
        <div class="titles">
          <p class="title" id="title"></p>
          <p class="name" id="name"></p>
        </div>
        <button class="close" type="button">${ICON_CLOSE}</button>
      </div>
      <p class="message" role="alert" hidden></p>
      <div class="actions">
        <button class="primary" type="button"></button>
        <button class="secondary" type="button"></button>
      </div>
    </div>`;
    const $ = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
    const title = $('.title');
    const message = $('.message');
    const primary = $<HTMLButtonElement>('.primary');
    const secondary = $<HTMLButtonElement>('.secondary');
    const closeButton = $<HTMLButtonElement>('.close');
    title.textContent = t('card.ask');
    $('.name').textContent = link.name ?? (link.kind === 'magnet' ? t('card.magnet') : link.url);
    closeButton.setAttribute('aria-label', t('card.close'));
    primary.textContent = t('card.open');
    secondary.textContent = t(link.kind === 'magnet' ? 'card.defaultApp' : 'card.download');
    let closed = false;
    const close = () => {
        if (closed)
            return;
        closed = true;
        host.remove();
        document.removeEventListener('keydown', onKeydown, true);
        handlers.onClose();
    };
    const fail = (text: string) => {
        if (closed)
            return;
        title.textContent = t('card.failed');
        message.textContent = text;
        message.hidden = false;
        primary.disabled = false;
        primary.textContent = t('card.retry');
    };
    const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && event.isTrusted)
            close();
    };
    primary.addEventListener('click', (event) => {
        if (!event.isTrusted || primary.disabled)
            return;
        primary.disabled = true;
        message.hidden = true;
        title.textContent = t(link.kind === 'magnet' ? 'card.opening' : 'card.fetching');
        handlers.open().then(close, (err: unknown) => fail(err instanceof Error ? err.message : String(err)));
    });
    secondary.addEventListener('click', (event) => {
        if (!event.isTrusted)
            return;
        close();
        handlers.useDefault();
    });
    closeButton.addEventListener('click', (event) => {
        if (event.isTrusted)
            close();
    });
    root.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('keydown', onKeydown, true);
    document.documentElement.append(host);
    primary.focus();
    return { fail, close };
}
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6.5 6.5 11 11m0-11-11 11"/></svg>`;
const LIGHT = `
    --bg: #ffffff;
    --border: #d9dee5;
    --text: #15191e;
    --muted: #5c6670;
    --button: #f1f3f6;
    --accent: #3d6ff0;
    --accent-strong: #2f5fd8;
    --error: #c93636;`;
const STYLE = `
  :host {
    all: initial;
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    --bg: #161a1f;
    --border: #2a3038;
    --text: #e8ebef;
    --muted: #9099a4;
    --button: #1d2228;
    --accent: #5b8cff;
    --accent-strong: #7aa2ff;
    --error: #ff6b6b;
  }
  @media (prefers-color-scheme: light) {
    :host(:not([data-theme='dark'])) {${LIGHT}
    }
  }
  :host([data-theme='light']) {${LIGHT}
  }
  .card {
    box-sizing: border-box;
    width: min(360px, calc(100vw - 32px));
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.3);
    font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .logo {
    flex: none;
    width: 32px;
    height: 32px;
  }
  .logo svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  p {
    margin: 0;
  }
  .title {
    font-weight: 600;
  }
  .name {
    overflow: hidden;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message {
    margin-top: 10px;
    color: var(--error);
    overflow-wrap: anywhere;
  }
  .message[hidden] {
    display: none;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .primary,
  .secondary {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--button);
  }
  .primary {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .primary:hover:not(:disabled) {
    border-color: var(--accent-strong);
    background: var(--accent-strong);
  }
  .primary:disabled {
    cursor: progress;
    opacity: 0.7;
  }
  .secondary:hover {
    border-color: var(--muted);
  }
  .close {
    flex: none;
    width: 24px;
    height: 24px;
    padding: 2px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
  }
  .close:hover {
    background: var(--button);
    color: var(--text);
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;
