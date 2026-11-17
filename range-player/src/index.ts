import type { Language } from './core/i18n.ts';
import type { RqbitClient } from './core/rqbit.ts';
import { createController, type Current, type HostEvent, type PlayerController } from './controller/controller.ts';
import type { Notice } from './controller/state.ts';
import type { TorrentInputError } from './core/torrent-input.ts';
import { browserEnv } from './view/env.ts';
import { playerText } from './view/i18n.ts';
import { attachKeyboard } from './view/keyboard.ts';
import { enableMoviDebug } from './view/movi-adapter.ts';
import { MoviSurface } from './view/surface.ts';
import { inputErrorText as wordInputError } from './view/text.ts';
export type { Current, Notice };
export interface RangePlayerOptions {
    client: RqbitClient;
    wasmUrl: string;
    language: Language;
    debug?: boolean;
    subFolder?: string;
    emptyText?: {
        title: string;
        hint?: string;
    };
}
export interface RangePlayerEventMap {
    current: CustomEvent<Current | null>;
    torrentschange: CustomEvent<undefined>;
    added: CustomEvent<{
        infoHash: string;
    }>;
    opened: CustomEvent<{
        infoHash: string;
        managed: boolean;
    }>;
}
export interface RangePlayer extends EventTarget {
    openText(text: string): void;
    openTorrentFile(bytes: Uint8Array, fileName: string): void;
    openManaged(infoHash: string, fileIndex?: number): void;
    play(fileIndex: number): void;
    close(): void;
    notify(notice: Notice | null): void;
    readonly current: Current | null;
    destroy(): void;
    addEventListener<K extends keyof RangePlayerEventMap>(type: K, listener: (event: RangePlayerEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RangePlayerEventMap>(type: K, listener: (event: RangePlayerEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
}
export function inputErrorText(error: TorrentInputError, language: Language): string {
    return wordInputError(playerText(language), error);
}
export function createRangePlayer(host: HTMLElement, options: RangePlayerOptions): RangePlayer {
    if (options.debug)
        enableMoviDebug();
    return new Player(host, options);
}
class Player extends EventTarget implements RangePlayer {
    private readonly surface: MoviSurface;
    private readonly controller: PlayerController;
    private readonly detachKeys: () => void;
    constructor(host: HTMLElement, { client, wasmUrl, language, emptyText, subFolder }: RangePlayerOptions) {
        super();
        this.surface = new MoviSurface(host, { wasmUrl, text: playerText(language), emptyText });
        this.controller = createController({
            client,
            surface: this.surface,
            env: browserEnv(),
            subFolder,
            onEvent: (event: HostEvent) => this.dispatchEvent(new CustomEvent(event.type, { detail: 'detail' in event ? event.detail : undefined })),
        });
        this.detachKeys = attachKeyboard(host, {
            target: () => this.surface.moviElement,
            escape: () => this.surface.closeMenu(),
        });
    }
    openText(text: string): void {
        this.controller.openText(text);
    }
    openTorrentFile(bytes: Uint8Array, fileName: string): void {
        this.controller.openTorrentFile(bytes, fileName);
    }
    openManaged(infoHash: string, fileIndex?: number): void {
        this.controller.openManaged(infoHash, fileIndex);
    }
    play(fileIndex: number): void {
        this.controller.play(fileIndex);
    }
    close(): void {
        this.controller.close();
    }
    notify(notice: Notice | null): void {
        this.controller.notify(notice);
    }
    get current(): Current | null {
        return this.controller.current;
    }
    destroy(): void {
        this.controller.destroy();
        this.detachKeys();
        this.surface.dispose();
    }
}
