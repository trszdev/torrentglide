import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { RqbitClient, RqbitTorrentSummary } from 'range-player/core';
import type { ExtensionText } from '../i18n.ts';
import { createHashRouter, type HashLocation, type RoutedPlayer } from '../services/hash-router.ts';
import { FileLists, historyRows, type HistoryRow } from '../services/history-model.ts';
import { decodeBase64, takeOpenRequest, type OpenRequest } from '../services/open-request.ts';
import { createRqbitPoller, type PollerEnv, type RqbitStatus } from '../services/rqbit-poller.ts';
import type { StorageArea } from '../services/storage.ts';
export interface PagePlayer extends RoutedPlayer {
    openText(text: string): void;
    openTorrentFile(bytes: Uint8Array, fileName: string): void;
    close(): void;
    notify(notice: {
        kind: 'busy' | 'error';
        text: string;
    } | null): void;
}
export type DialogName = 'open' | 'settings' | 'review';
export interface AppOptions {
    client: RqbitClient;
    local: StorageArea;
    session: StorageArea;
    env: PollerEnv;
    allowed: () => Promise<boolean>;
    inIncognito?: boolean;
    text: ExtensionText;
}
export interface AppState {
    readonly status: ReadonlySignal<RqbitStatus>;
    readonly rows: ReadonlySignal<HistoryRow[] | null>;
    readonly player: ReadonlySignal<PagePlayer | null>;
    readonly dialog: Signal<DialogName | null>;
    readonly removing: Signal<HistoryRow | null>;
    readonly inIncognito: boolean;
    readonly text: ExtensionText;
    torrent(infoHash: string): RqbitTorrentSummary | undefined;
    attachPlayer(player: PagePlayer, location: HashLocation, openId: string | null): () => void;
    remove(infoHash: string, deleteFiles: boolean): Promise<void>;
    refresh(): Promise<void>;
    stop(): void;
}
export function createAppState({ client, local, session, env, allowed, inIncognito = false, text }: AppOptions): AppState {
    const { t } = text;
    const registry = {
        draining: null,
        async read() {
            return { incognito: new Set<string>(), pendingDelete: new Set<string>() };
        },
        async mark(_infoHash: string) { },
        async unmark(_infoHash: string) { },
        async scheduleAll() { },
        async scheduleAddedBefore() { },
        watch(_listener: () => void) {
            return () => { };
        },
    };
    const status = signal<RqbitStatus>({ kind: 'connecting' });
    const torrents = signal<RqbitTorrentSummary[] | null>(null);
    const sets = signal<{
        incognito: Set<string>;
        pendingDelete: Set<string>;
    }>({ incognito: new Set(), pendingDelete: new Set() });
    const current = signal<string | null>(null);
    const player = signal<PagePlayer | null>(null);
    const listsVersion = signal(0);
    const fileLists = new FileLists(client, () => listsVersion.value++);
    let latestRead = 0;
    const readSets = async () => {
        const call = ++latestRead;
        const next = await registry.read();
        if (call === latestRead)
            sets.value = next;
        return next;
    };
    const stopWatch = registry.watch(() => void readSets());
    const ready = readSets();
    let settleFirstAnswer: (() => void) | null = null;
    const firstAnswer = new Promise<void>((resolve) => (settleFirstAnswer = resolve));
    const poller = createRqbitPoller({
        client,
        env,
        allowed,
        onChange(state) {
            batch(() => {
                status.value = state.status;
                torrents.value = state.torrents;
            });
            if (state.torrents || state.status.kind !== 'connecting')
                settleFirstAnswer?.();
            if (state.torrents)
                fileLists.update(state.torrents);
            if (state.status.kind === 'running')
                void drain();
        },
    });
    async function drain(): Promise<void> {
        await ready;
    }
    const resolveName = (infoHash: string): string => {
        const found = torrents.peek()?.find((torrent) => torrent.info_hash === infoHash);
        return found?.name ?? infoHash;
    };
    const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));
    const performRemove = async (infoHash: string, deleteFiles: boolean): Promise<void> => {
        if (deleteFiles)
            await client.delete(infoHash);
        else
            await client.forget(infoHash);
    };
    const dispatchOpenRequest = (next: PagePlayer, request: OpenRequest): void => {
        const isText = request.kind === 'text';
        if (isText) {
            next.openText(request.text);
            return;
        }
        const bytes = decodeBase64(request.base64);
        next.openTorrentFile(bytes, request.fileName);
    };
    const rows = computed(() => {
        const list = torrents.value;
        if (!list)
            return null;
        void listsVersion.value;
        const { pendingDelete } = sets.value;
        return historyRows({ torrents: list, fileLists: fileLists.map, pendingDelete, inIncognito, current: current.value });
    });
    const hidden = async (infoHash: string) => {
        const { pendingDelete } = await readSets();
        if (pendingDelete.has(infoHash))
            return true;
        return false;
    };
    return {
        status,
        rows,
        player,
        dialog: signal(null),
        removing: signal(null),
        inIncognito,
        text,
        torrent: (infoHash) => torrents.value?.find((torrent) => torrent.info_hash === infoHash),
        attachPlayer(next, location, openId) {
            player.value = next;
            current.value = next.current?.infoHash ?? null;
            const onCurrent = (event: Event) => {
                current.value = (event as CustomEvent<{
                    infoHash: string;
                } | null>).detail?.infoHash ?? null;
            };
            const onTorrentsChange = () => void poller.refresh();
            next.addEventListener('current', onCurrent);
            next.addEventListener('torrentschange', onTorrentsChange);
            const stopTracking = () => { };
            const stopRouter = createHashRouter({ player: next, location, hidden });
            let detached = false;
            if (openId) {
                void takeOpenRequest(session, openId).then((request) => {
                    if (detached || !request)
                        return;
                    dispatchOpenRequest(next, request);
                });
            }
            return () => {
                detached = true;
                stopRouter();
                stopTracking();
                next.removeEventListener('current', onCurrent);
                next.removeEventListener('torrentschange', onTorrentsChange);
                if (player.peek() === next)
                    player.value = null;
                current.value = null;
            };
        },
        async remove(infoHash, deleteFiles) {
            const name = resolveName(infoHash);
            const active = player.peek();
            const isPlayingNow = active !== null && active.current !== null && active.current.infoHash === infoHash;
            if (isPlayingNow)
                active.close();
            const messageKey = deleteFiles ? 'status.removingAndDeleting' : 'status.removing';
            active?.notify({ kind: 'busy', text: t(messageKey, { name }) });
            try {
                await performRemove(infoHash, deleteFiles);
                await registry.unmark(infoHash);
                active?.notify(null);
            }
            catch (err) {
                active?.notify({ kind: 'error', text: describeError(err) });
            }
            await poller.refresh();
        },
        refresh: () => poller.refresh(),
        stop() {
            poller.stop();
            stopWatch();
        },
    };
}
