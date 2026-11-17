import type { RqbitClient, RqbitFile, RqbitStats, RqbitTorrentDetails, TorrentRef } from './rqbit.ts';
import type { TorrentInput } from './torrent-input.ts';
import { fileName } from './media.ts';
export interface OpenedTorrent {
    infoHash: string;
    name: string;
    files: RqbitFile[];
    managed: boolean;
    torrentBytes: Uint8Array<ArrayBuffer> | null;
}
export async function openTorrent(client: RqbitClient, input: TorrentInput, signal?: AbortSignal): Promise<OpenedTorrent> {
    if (input.kind === 'magnet' && input.infoHash) {
        const existing = await client.findTorrent(input.infoHash, signal);
        if (existing)
            return opened(existing, null);
    }
    const bytes = input.kind === 'file' ? input.bytes : await client.resolveMagnet(input.kind === 'magnet' ? input.uri : input.url, signal);
    const listed = await client.addTorrent(bytes, { listOnly: true }, signal);
    const existing = await client.findTorrent(listed.details.info_hash, signal);
    return existing ? opened(existing, null) : opened(listed.details, bytes);
}
export async function openManagedTorrent(client: RqbitClient, ref: TorrentRef, signal?: AbortSignal): Promise<OpenedTorrent> {
    return opened(await client.torrentDetails(ref, signal), null);
}
export type PrepareStatus = {
    step: 'adding';
} | {
    step: 'checking';
    percent: number | null;
} | {
    step: 'resuming';
};
export type PrepareErrorCode = 'no-file' | 'no-torrent-data' | 'torrent-error';
export class PrepareError extends Error {
    override name = 'PrepareError';
    constructor(readonly code: PrepareErrorCode, readonly detail = '') {
        super(detail ? `${code}: ${detail}` : code);
    }
}
export interface PrepareOptions {
    signal?: AbortSignal;
    onStatus?: (status: PrepareStatus) => void;
    pollMs?: number;
    subFolder?: string;
}
export async function prepareStream(client: RqbitClient, torrent: OpenedTorrent, fileIndex: number, options: PrepareOptions = {}): Promise<{
    url: string;
    torrent: OpenedTorrent;
}> {
    const { signal, onStatus } = options;
    const file = torrent.files[fileIndex];
    if (!file)
        throw new PrepareError('no-file', String(fileIndex));
    const { infoHash } = torrent;
    if (!torrent.managed) {
        if (!torrent.torrentBytes)
            throw new PrepareError('no-torrent-data');
        onStatus?.({ step: 'adding' });
        await client.addTorrent(torrent.torrentBytes, { overwrite: true, onlyFiles: [fileIndex], subFolder: subFolderFor(torrent, options.subFolder) }, signal);
    }
    let stats = await untilInitialized(client, infoHash, options);
    let details = await client.torrentDetails(infoHash, signal);
    if (!selectsOnly(details, fileIndex)) {
        await client.updateOnlyFiles(infoHash, [fileIndex], signal);
        details = await client.torrentDetails(infoHash, signal);
    }
    if (stats.state === 'paused' || stats.state === 'error') {
        onStatus?.({ step: 'resuming' });
        await client.start(infoHash, signal);
        stats = await untilInitialized(client, infoHash, options);
    }
    if (stats.state === 'error')
        throw new PrepareError('torrent-error', stats.error ?? 'unknown error');
    return { url: client.streamUrl(infoHash, fileIndex, fileName(file)), torrent: opened(details, null) };
}
export async function pauseOtherTorrents(client: RqbitClient, infoHash: string, signal?: AbortSignal): Promise<string[]> {
    const others = (await client.listTorrents(signal))
        .filter((t) => t.info_hash !== infoHash && t.stats?.state === 'live')
        .map((t) => t.info_hash);
    await Promise.all(others.map((hash) => client.pause(hash, signal)));
    return others;
}
function subFolderFor(torrent: OpenedTorrent, subFolder: string | undefined): string | undefined {
    if (!subFolder || torrent.files.length < 2)
        return subFolder;
    const name = torrent.name;
    if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name))
        return subFolder;
    return `${subFolder}/${name}`;
}
function selectsOnly(details: RqbitTorrentDetails, fileIndex: number): boolean {
    const selected = (details.files ?? []).flatMap((file, i) => (file.included ? [i] : []));
    return selected.length === 1 && selected[0] === fileIndex;
}
async function untilInitialized(client: RqbitClient, infoHash: string, { signal, onStatus, pollMs = 500 }: PrepareOptions): Promise<RqbitStats> {
    for (;;) {
        const stats = await client.torrentStats(infoHash, signal);
        if (stats.state !== 'initializing')
            return stats;
        const percent = stats.total_bytes > 0 ? Math.floor((stats.progress_bytes / stats.total_bytes) * 100) : null;
        onStatus?.({ step: 'checking', percent });
        await sleep(pollMs, signal);
    }
}
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted)
            return reject(signal.reason);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
function opened(details: RqbitTorrentDetails, torrentBytes: Uint8Array<ArrayBuffer> | null): OpenedTorrent {
    return {
        infoHash: details.info_hash,
        name: details.name ?? details.info_hash,
        files: details.files ?? [],
        managed: torrentBytes === null,
        torrentBytes,
    };
}
