import { render as renderLit, html } from 'lit-html';
import { mediaFiles } from '../core/media.ts';
import type { Intent, MediaEvent, MediaSource, Surface } from '../controller/ports.ts';
import { initialState, isBusy, markedFile, type PlayerState } from '../controller/state.ts';
import type { PlayerText } from './i18n.ts';
import { watchLayout } from './layout.ts';
import { createMovi, type MoviAdapter } from './movi-adapter.ts';
import { STYLE } from './style.ts';
import { busyText, connectionRows, errorText, withElapsed } from './text.ts';
import { fileMenuTemplate } from './templates/file-menu.ts';
import { messageTemplate, type MessageView } from './templates/message.ts';
export interface SurfaceOptions {
    wasmUrl: string;
    text: PlayerText;
    emptyText?: {
        title: string;
        hint?: string;
    };
}
export class MoviSurface implements Surface {
    private movi: MoviAdapter | null = null;
    private state: PlayerState = initialState;
    private readonly root = document.createElement('div');
    private readonly layer = document.createElement('div');
    private readonly mediaListeners = new Set<(event: MediaEvent) => void>();
    private readonly intentListeners = new Set<(intent: Intent) => void>();
    private stopMovi = () => { };
    private ticker: ReturnType<typeof setInterval> | undefined;
    private menuWasVisible = false;
    constructor(private readonly host: HTMLElement, private readonly options: SurfaceOptions) {
        addDocumentStyle();
        host.classList.add('rp-host');
        const style = document.createElement('style');
        style.textContent = STYLE;
        this.root.className = 'rp-root is-bare';
        this.root.append(style, this.layer);
        host.append(this.root);
        for (const type of ['click', 'dblclick', 'wheel', 'contextmenu'] as const) {
            this.root.addEventListener(type, (event) => event.stopPropagation());
        }
        this.root.addEventListener('keydown', (event) => this.onMenuKey(event));
        this.draw();
    }
    get moviElement(): HTMLElement | null {
        return this.movi?.element ?? null;
    }
    closeMenu(): boolean {
        if (!this.menuOpenByButton())
            return false;
        this.emit({ type: 'menu', open: false });
        return true;
    }
    render(state: PlayerState): void {
        this.state = state;
        this.draw();
    }
    load(source: MediaSource): void {
        if (!this.movi) {
            const movi = createMovi(this.host, this.options.wasmUrl);
            const offMedia = movi.onMedia((event) => {
                for (const listener of this.mediaListeners)
                    listener(event);
            });
            movi.mountOverlay(this.root);
            const stopLayout = watchLayout(this.root, movi);
            this.root.classList.remove('is-bare');
            this.stopMovi = () => {
                offMedia();
                stopLayout();
            };
            this.movi = movi;
        }
        this.movi.load(source);
        this.draw();
    }
    reset(): void {
        if (!this.movi)
            return;
        this.stopMovi();
        this.stopMovi = () => { };
        this.movi.destroy();
        this.movi = null;
        this.root.classList.add('is-bare');
        this.host.append(this.root);
        this.draw();
    }
    onMedia(listener: (event: MediaEvent) => void): () => void {
        this.mediaListeners.add(listener);
        return () => this.mediaListeners.delete(listener);
    }
    onIntent(listener: (intent: Intent) => void): () => void {
        this.intentListeners.add(listener);
        return () => this.intentListeners.delete(listener);
    }
    dispose(): void {
        clearInterval(this.ticker);
        this.reset();
        this.root.remove();
        this.host.classList.remove('rp-host');
    }
    private emit(intent: Intent): void {
        for (const listener of this.intentListeners)
            listener(intent);
    }
    private listedCount(): number {
        return this.state.torrent ? mediaFiles(this.state.torrent.files).length : 0;
    }
    private menuPinned(): boolean {
        const { state } = this;
        return !!state.torrent && state.shown === null && state.phase.name !== 'idle' && this.listedCount() !== 1;
    }
    private menuOpenByButton(): boolean {
        return this.state.menuOpen && this.state.shown !== null && this.listedCount() > 1;
    }
    private draw(): void {
        const { state, movi } = this;
        const { text } = this.options;
        const pinned = this.menuPinned();
        const menuVisible = pinned || this.menuOpenByButton();
        const message = this.message();
        renderLit(html `${state.torrent && menuVisible
            ? fileMenuTemplate({
                torrent: state.torrent,
                marked: markedFile(state),
                pinned,
                collapsed: state.collapsed,
                stats: state.stats,
                text,
                onPlay: (index) => this.emit({ type: 'play', index }),
                onClose: () => this.emit({ type: 'menu', open: false }),
                onToggleGroup: (key) => this.emit({ type: 'toggle-group', key }),
            })
            : null}${messageTemplate(message)}`, this.layer);
        if (movi) {
            movi.setFlags({ menuOpen: menuVisible, busy: message?.kind === 'busy', message: message !== null });
            movi.setFilesButton(this.listedCount() > 1
                ? { label: text.t('files.label'), active: menuVisible && !pinned, onToggle: (open) => this.emit({ type: 'menu', open }) }
                : null);
            const { torrent, shown } = state;
            movi.setConnection(torrent && shown !== null ? { label: text.t('stats.section'), rows: connectionRows(text, torrent, shown, state.stats) } : null);
        }
        if (menuVisible && !this.menuWasVisible) {
            this.layer.querySelector('.rp-file.is-playing')?.scrollIntoView({ block: 'nearest' });
        }
        this.menuWasVisible = menuVisible;
        const ticking = message?.kind === 'busy' && state.busySince !== null && !state.hostNotice;
        if (ticking && this.ticker === undefined)
            this.ticker = setInterval(() => this.draw(), 1000);
        if (!ticking && this.ticker !== undefined) {
            clearInterval(this.ticker);
            this.ticker = undefined;
        }
    }
    private message(): MessageView | null {
        const { state, movi } = this;
        const { text, emptyText } = this.options;
        const close = { closeLabel: text.t('files.close'), onClose: () => this.emit({ type: 'dismiss-error' }) };
        if (state.hostNotice) {
            return state.hostNotice.kind === 'busy'
                ? { kind: 'busy', text: state.hostNotice.text }
                : { kind: 'error', text: state.hostNotice.text, ...close };
        }
        if (state.error)
            return { kind: 'error', text: errorText(text, state.error), ...close };
        const busy = isBusy(state.phase) ? busyText(text, state.phase) : null;
        if (busy)
            return { kind: 'busy', text: withElapsed(text, busy, state.busySince, Date.now()) };
        if (state.phase.name === 'idle' && !movi) {
            return { kind: 'empty', title: emptyText?.title ?? text.t('player.empty'), hint: emptyText ? emptyText.hint : text.t('player.emptyHint') };
        }
        return null;
    }
    private onMenuKey(event: KeyboardEvent): void {
        if (event.key === 'Escape')
            return;
        event.stopPropagation();
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
            return;
        event.preventDefault();
        const items = [...this.layer.querySelectorAll<HTMLElement>('.rp-group-header, .rp-file')];
        const active = (this.root.getRootNode() as Document | ShadowRoot).activeElement;
        const at = items.findIndex((item) => item === active);
        const next = at < 0 ? 0 : Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
        items[next]?.focus();
    }
}
function addDocumentStyle(): void {
    if (document.getElementById('rp-style'))
        return;
    const style = document.createElement('style');
    style.id = 'rp-style';
    style.textContent = STYLE;
    document.head.append(style);
}
