import { RqbitError, type RqbitClient } from '../core/rqbit.ts';
import { TorrentInputError, parseTorrentText, type TorrentInput } from '../core/torrent-input.ts';
import { PrepareError, openManagedTorrent, openTorrent, pauseOtherTorrents, prepareStream, type OpenedTorrent, type PrepareStatus, } from '../core/session.ts';
import { fileName, isPlayable, matchSubtitles, pickDefaultFile, stripExtension } from '../core/media.ts';
import { reduce, type PlayerEvent } from './machine.ts';
import type { Env, MediaSource, Surface } from './ports.ts';
import { initialState, type Notice, type OpeningStep, type PlayerError, type PlayerState, type PrepareStep } from './state.ts';
export interface Current {
    infoHash: string;
    fileIndex: number | null;
}
export type HostEvent = {
    type: 'current';
    detail: Current | null;
} | {
    type: 'torrentschange';
} | {
    type: 'added';
    detail: {
        infoHash: string;
    };
} | {
    type: 'opened';
    detail: {
        infoHash: string;
        managed: boolean;
    };
};
export interface ControllerOptions {
    client: RqbitClient;
    surface: Surface;
    env: Env;
    onEvent?: (event: HostEvent) => void;
    pollMs?: number;
    subFolder?: string;
}
export interface PlayerController {
    openText(text: string): void;
    openTorrentFile(bytes: Uint8Array, fileName: string): void;
    openManaged(infoHash: string, fileIndex?: number): void;
    play(fileIndex: number): void;
    close(): void;
    notify(notice: Notice | null): void;
    readonly state: PlayerState;
    readonly current: Current | null;
    settled(): Promise<void>;
    destroy(): void;
}
const STATS_MS = 2000;
export function createController({ client, surface, env, onEvent = () => { }, pollMs = 500, subFolder }: ControllerOptions): PlayerController {
    let state = initialState;
    let current: Current | null = null;
    let action: AbortController | null = null;
    let stopPolling = () => { };
    let pollNow = () => { };
    const tasks = new Set<Promise<void>>();
    function dispatch(event: PlayerEvent): void {
        state = reduce(state, event);
        surface.render(state);
        const next = state.torrent ? { infoHash: state.torrent.infoHash, fileIndex: state.shown } : null;
        if (next?.infoHash !== current?.infoHash || next?.fileIndex !== current?.fileIndex) {
            current = next;
            onEvent({ type: 'current', detail: current });
        }
    }
    function track(promise: Promise<unknown>): void {
        const task = promise.then(() => { }, () => { });
        tasks.add(task);
        void task.finally(() => tasks.delete(task));
    }
    function begin(): AbortSignal {
        action?.abort();
        action = new AbortController();
        return action.signal;
    }
    function open(step: OpeningStep, load: (signal: AbortSignal) => Promise<OpenedTorrent>, wanted?: number): void {
        const signal = begin();
        dispatch({ type: 'open', step, at: env.now() });
        track(runOpen(signal, load, wanted));
    }
    async function runOpen(signal: AbortSignal, load: (signal: AbortSignal) => Promise<OpenedTorrent>, wanted?: number) {
        let torrent: OpenedTorrent;
        try {
            torrent = await load(signal);
        }
        catch (err) {
            if (!signal.aborted)
                dispatch({ type: 'failed', error: playerError(err) });
            return;
        }
        if (signal.aborted)
            return;
        const previous = state.torrent;
        const same = previous?.infoHash === torrent.infoHash;
        if (previous && !same) {
            leave(previous);
            surface.reset();
        }
        onEvent({ type: 'opened', detail: { infoHash: torrent.infoHash, managed: torrent.managed } });
        const play = fileToPlay(torrent, same, wanted);
        dispatch({ type: 'opened', torrent, play });
        restartPolling();
        if (play !== null)
            await runPlay(signal, play);
    }
    function fileToPlay(torrent: OpenedTorrent, same: boolean, wanted?: number): number | null {
        const file = wanted === undefined ? undefined : torrent.files[wanted];
        const asked = file && isPlayable(file) ? wanted! : null;
        if (same && state.shown !== null)
            return asked !== state.shown ? asked : null;
        return asked ?? pickDefaultFile(torrent.files);
    }
    function play(index: number): void {
        const { phase } = state;
        if (!state.torrent)
            return;
        if (index === state.shown && (phase.name === 'playing' || phase.name === 'buffering')) {
            dispatch({ type: 'menu', open: false });
            return;
        }
        const signal = begin();
        dispatch({ type: 'play', index, at: env.now() });
        track(runPlay(signal, index));
    }
    async function runPlay(signal: AbortSignal, index: number) {
        const torrent = state.torrent;
        if (!torrent)
            return;
        let prepared: {
            url: string;
            torrent: OpenedTorrent;
        };
        try {
            prepared = await prepareStream(client, torrent, index, {
                signal,
                pollMs,
                subFolder,
                onStatus: (status) => {
                    if (!signal.aborted)
                        dispatch({ type: 'prepare-step', step: prepareStep(status) });
                },
            });
        }
        catch (err) {
            if (!signal.aborted)
                dispatch({ type: 'failed', error: playerError(err) });
            return;
        }
        if (signal.aborted)
            return;
        if (!torrent.managed)
            onEvent({ type: 'added', detail: { infoHash: torrent.infoHash } });
        dispatch({ type: 'prepared', torrent: prepared.torrent, index });
        surface.load(mediaSource(prepared.torrent, index, prepared.url));
        restartPolling();
        track(pauseOthers(torrent.infoHash));
    }
    async function pauseOthers(infoHash: string) {
        try {
            await pauseOtherTorrents(client, infoHash);
            onEvent({ type: 'torrentschange' });
        }
        catch (err) {
            if (state.torrent?.infoHash === infoHash)
                dispatch({ type: 'error', error: { code: 'pause-failed', detail: message(err) } });
        }
    }
    function mediaSource(torrent: OpenedTorrent, index: number, url: string): MediaSource {
        const { files, infoHash } = torrent;
        return {
            url,
            title: stripExtension(fileName(files[index]!)),
            resumeKey: `${infoHash}/${index}`,
            subtitles: matchSubtitles(files, index).map(({ index: sub, label, lang, format }) => ({
                url: client.streamUrl(infoHash, sub, fileName(files[sub]!)),
                label,
                lang,
                format,
            })),
        };
    }
    function leave(torrent: OpenedTorrent): void {
        stopPolling();
        if (!torrent.managed || state.shown === null)
            return;
        track(client.pause(torrent.infoHash).then(() => onEvent({ type: 'torrentschange' })));
    }
    function restartPolling(): void {
        stopPolling();
        const torrent = state.torrent;
        if (!torrent?.managed)
            return;
        const { infoHash } = torrent;
        let inFlight = false;
        const poll = () => {
            if (inFlight || !env.visible())
                return;
            inFlight = true;
            track(client
                .torrentStats(infoHash)
                .then((stats) => dispatch({ type: 'stats', infoHash, stats }))
                .finally(() => (inFlight = false)));
        };
        const stop = env.every(STATS_MS, poll);
        pollNow = poll;
        stopPolling = () => {
            stop();
            pollNow = () => { };
            stopPolling = () => { };
        };
        poll();
    }
    function close(): void {
        action?.abort();
        action = null;
        const torrent = state.torrent;
        if (torrent) {
            leave(torrent);
            surface.reset();
        }
        dispatch({ type: 'close' });
    }
    const unsubscribe = [
        surface.onMedia((event) => dispatch({ type: 'media', event })),
        surface.onIntent((intent) => {
            if (intent.type === 'play')
                play(intent.index);
            else
                dispatch(intent);
        }),
        env.onVisibility(() => {
            if (env.visible())
                pollNow();
        }),
        env.onPageHide(() => {
            if (state.torrent?.managed && state.shown !== null) {
                track(client.pause(state.torrent.infoHash, undefined, { keepalive: true }));
            }
        }),
        env.onPageShow((persisted) => {
            if (persisted && state.torrent?.managed && state.shown !== null)
                track(client.start(state.torrent.infoHash));
        }),
    ];
    return {
        openText(text) {
            let input: TorrentInput;
            try {
                input = parseTorrentText(text);
            }
            catch (err) {
                begin();
                dispatch({ type: 'failed', error: playerError(err) });
                return;
            }
            const step: OpeningStep = input.kind === 'magnet' ? { kind: 'resolving', name: input.displayName } : { kind: 'fetching' };
            open(step, (signal) => openTorrent(client, input, signal));
        },
        openTorrentFile(bytes, name) {
            const input: TorrentInput = { kind: 'file', bytes: new Uint8Array(bytes), fileName: name };
            open({ kind: 'reading', name }, (signal) => openTorrent(client, input, signal));
        },
        openManaged(infoHash, fileIndex) {
            open({ kind: 'opening' }, (signal) => openManagedTorrent(client, infoHash, signal), fileIndex);
        },
        play,
        close,
        notify(notice) {
            dispatch({ type: 'notify', notice });
        },
        get state() {
            return state;
        },
        get current() {
            return current;
        },
        async settled() {
            while (tasks.size)
                await Promise.all(tasks);
        },
        destroy() {
            close();
            for (const off of unsubscribe)
                off();
        },
    };
    function playerError(err: unknown): PlayerError {
        if (err instanceof TorrentInputError)
            return { code: `input-${err.code}`, detail: err.detail };
        if (err instanceof PrepareError)
            return { code: err.code, detail: err.detail };
        if (err instanceof RqbitError && err.kind === 'rqbit_unreachable')
            return { code: 'rqbit-unreachable', detail: client.baseUrl };
        return { code: 'rqbit', detail: message(err) };
    }
}
function prepareStep(status: PrepareStatus): PrepareStep {
    return status.step === 'checking' ? { kind: 'checking', percent: status.percent } : { kind: status.step };
}
function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
