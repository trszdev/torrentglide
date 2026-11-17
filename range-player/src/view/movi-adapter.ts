import 'movi-player/element/slim';
import { Logger, LogLevel, WasmBindings, type MoviElement } from 'movi-player/element/slim';
import type { MediaEvent, MediaSource } from '../controller/ports.ts';
import { createDecoderTimestamps, createFrameTimestamps, type DecoderTimestamps, type FrameTimestamps, } from '../core/frame-timestamps.ts';
import type { StatRow } from './text.ts';
const OVERLAY_ID = 'rp-overlay';
const FILES_ID = 'rp-files';
const STATS_ATTRIBUTE = 'data-rp-stats';
export interface FilesButton {
    label: string;
    active: boolean;
    onToggle: (open: boolean) => void;
}
export interface MoviAdapter {
    readonly element: MoviElement;
    load(source: MediaSource): void;
    mountOverlay(root: HTMLElement): void;
    setFilesButton(button: FilesButton | null): void;
    setFlags(flags: {
        menuOpen: boolean;
        busy: boolean;
        message: boolean;
    }): void;
    setConnection(section: {
        label: string;
        rows: StatRow[];
    } | null): void;
    controlsBar(): HTMLElement | null;
    onMedia(listener: (event: MediaEvent) => void): () => void;
    destroy(): void;
}
function fixFrameTimestamps(): void {
    const bindings = WasmBindings.prototype;
    const { sendPacket, getFramePts, flushDecoder } = bindings;
    const streams = new WeakMap<WasmBindings, Map<number, {
        dts: number;
        timestamps: FrameTimestamps;
    }>>();
    function stream(owner: WasmBindings, index: number) {
        let byIndex = streams.get(owner);
        if (!byIndex)
            streams.set(owner, (byIndex = new Map()));
        let state = byIndex.get(index);
        if (!state)
            byIndex.set(index, (state = { dts: Number.NaN, timestamps: createFrameTimestamps() }));
        return state;
    }
    bindings.sendPacket = function (index, data, pts, dts, keyframe) {
        stream(this, index).dts = dts;
        return sendPacket.call(this, index, data, pts, dts, keyframe);
    };
    bindings.getFramePts = function (index) {
        const state = stream(this, index);
        return state.timestamps.frame(getFramePts.call(this, index), state.dts);
    };
    bindings.flushDecoder = function (index) {
        const state = stream(this, index);
        state.timestamps.reset();
        state.dts = Number.NaN;
        flushDecoder.call(this, index);
    };
}
fixFrameTimestamps();
function fixDecoderTimestamps(): void {
    if (typeof VideoDecoder === 'undefined')
        return;
    globalThis.VideoDecoder = class extends VideoDecoder {
        private readonly timestamps: DecoderTimestamps;
        constructor(init: VideoDecoderInit) {
            const timestamps = createDecoderTimestamps();
            super({
                ...init,
                output: (frame) => {
                    const timestamp = timestamps.output(frame.timestamp);
                    if (timestamp === frame.timestamp)
                        return init.output(frame);
                    const restamped = new VideoFrame(frame, { timestamp });
                    frame.close();
                    init.output(restamped);
                },
            });
            this.timestamps = timestamps;
        }
        override decode(chunk: EncodedVideoChunk): void {
            super.decode(chunk);
            this.timestamps.input(chunk.timestamp);
        }
        override reset(): void {
            this.timestamps.reset();
            super.reset();
        }
    };
}
fixDecoderTimestamps();
export function enableMoviDebug(): void {
    ;
    (globalThis as {
        __movilog?: Console;
    }).__movilog = console;
    Logger.setLevel(LogLevel.DEBUG);
}
export function createMovi(host: HTMLElement, wasmUrl: string): MoviAdapter {
    const element = document.createElement('movi-player');
    for (const [name, value] of Object.entries({
        wasmurl: wasmUrl,
        controls: '',
        autoplay: '',
        playsinline: '',
        showtitle: '',
        fastseek: 'keys',
        theme: 'dark',
        resume: '',
        persist: 'volume muted speed audiolang subtitlelang',
        persistkey: 'range-player',
    })) {
        element.setAttribute(name, value);
    }
    element.setShortcut('rotate', null);
    element.setShortcut('seekback', ['arrowleft', 'ctrl+arrowleft', 'meta+arrowleft']);
    element.setShortcut('seekforward', ['arrowright', 'ctrl+arrowright', 'meta+arrowright']);
    host.append(element);
    let filesButton = false;
    let filesActive = false;
    let connection: {
        label: string;
        rows: StatRow[];
    } | null = null;
    let statsObserver: MutationObserver | null = null;
    let keyTimer: ReturnType<typeof setTimeout> | undefined;
    function settingsRoot(): HTMLElement | null {
        return element.shadowRoot?.querySelector<HTMLElement>('.movi-settings-root') ?? null;
    }
    function renderConnection(): void {
        const root = settingsRoot();
        if (!root)
            return;
        let section = root.querySelector<HTMLElement>(`:scope > [${STATS_ATTRIBUTE}]`);
        if (!connection) {
            section?.remove();
            return;
        }
        if (!section) {
            section = document.createElement('div');
            section.setAttribute(STATS_ATTRIBUTE, '');
            section.style.display = 'contents';
            root.append(section);
        }
        const label = document.createElement('div');
        label.className = 'movi-settings-section-label movi-settings-section-label-secondary';
        label.textContent = connection.label;
        section.replaceChildren(label, ...connection.rows.map(statRow));
    }
    function watchSettings(): void {
        const root = settingsRoot();
        if (!root || statsObserver)
            return;
        statsObserver = new MutationObserver(() => {
            if (connection && !root.querySelector(`:scope > [${STATS_ATTRIBUTE}]`))
                renderConnection();
        });
        statsObserver.observe(root, { childList: true });
    }
    return {
        element,
        load(source) {
            const src = document.createElement('source');
            src.setAttribute('src', source.url);
            const tracks = source.subtitles.map((subtitle) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = subtitle.label;
                if (subtitle.lang)
                    track.srclang = subtitle.lang;
                track.dataset.format = subtitle.format;
                track.setAttribute('src', subtitle.url);
                return track;
            });
            element.replaceChildren(src, ...tracks);
            clearTimeout(keyTimer);
            keyTimer = setTimeout(() => {
                element.setAttribute('resumekey', source.resumeKey);
                element.setAttribute('title', source.title);
            });
            watchSettings();
        },
        mountOverlay(root) {
            if (element.isOverlayVisible(OVERLAY_ID))
                element.hideOverlay(OVERLAY_ID);
            element.showOverlay({ id: OVERLAY_ID, content: root, placement: 'center', interactive: false });
        },
        setFilesButton(button) {
            if (!button) {
                if (filesButton)
                    element.removeControl(FILES_ID);
                filesButton = false;
                return;
            }
            if (!filesButton) {
                element.addControl({
                    id: FILES_ID,
                    label: button.label,
                    icon: ICON_FILES,
                    side: 'right',
                    before: 'settings',
                    toggle: true,
                    active: button.active,
                    onSelect: (on) => button.onToggle(on),
                });
                filesButton = true;
                filesActive = button.active;
            }
            else if (button.active !== filesActive) {
                element.updateControl(FILES_ID, { active: button.active });
                filesActive = button.active;
            }
        },
        setFlags({ menuOpen, busy, message }) {
            element.classList.toggle('rp-menu-open', menuOpen);
            element.classList.toggle('rp-busy', busy);
            element.classList.toggle('rp-has-message', message);
        },
        setConnection(next) {
            connection = next;
            watchSettings();
            renderConnection();
        },
        controlsBar() {
            return element.shadowRoot?.querySelector<HTMLElement>('.movi-controls-bar') ?? null;
        },
        onMedia(listener) {
            const events: MediaEvent[] = ['loadedmetadata', 'errordisplay', 'ended'];
            const handlers = events.map((type) => [type, () => listener(type)] as const);
            for (const [type, handler] of handlers)
                element.addEventListener(type, handler);
            return () => {
                for (const [type, handler] of handlers)
                    element.removeEventListener(type, handler);
            };
        },
        destroy() {
            clearTimeout(keyTimer);
            statsObserver?.disconnect();
            element.remove();
        },
    };
}
const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_FILES = svg('<path d="M3.75 6.5h16.5M3.75 12h16.5M3.75 17.5h8.5"/><path d="M15.75 15v5l4.25-2.5z"/>');
const STAT_ICONS: Record<StatRow['key'], string> = {
    downloaded: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    speed: svg('<path d="M5.64 18.36a9 9 0 1 1 12.72 0"/><path d="m12 12 4-4"/>'),
    peers: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    error: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
};
function statRow(row: StatRow): HTMLElement {
    const el = document.createElement('div');
    el.className = 'movi-settings-row is-static';
    el.style.opacity = '1';
    el.innerHTML = STAT_ICONS[row.key].replace('<svg ', '<svg class="movi-symbol movi-settings-icon" ');
    const label = document.createElement('span');
    label.className = 'movi-settings-row-label';
    label.textContent = row.label;
    const value = document.createElement('span');
    value.className = 'movi-settings-row-value';
    value.textContent = row.value;
    value.title = row.value;
    el.append(label, value);
    return el;
}
