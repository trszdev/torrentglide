import { mediaFiles, type RqbitClient, type RqbitFile, type RqbitTorrentSummary } from 'range-player/core';
export type HistoryLine = {
    kind: 'none';
} | {
    kind: 'error';
    error: string;
} | {
    kind: 'checking';
} | {
    kind: 'done';
    bytes: number;
} | {
    kind: 'progress';
    percent: number;
    bytes: number;
    speed: string | null;
};
export interface HistoryRow {
    infoHash: string;
    name: string;
    incognito: boolean;
    active: boolean;
    line: HistoryLine;
}
export interface HistoryInput {
    torrents: readonly RqbitTorrentSummary[];
    fileLists: ReadonlyMap<string, RqbitFile[]>;
    pendingDelete: ReadonlySet<string>;
    inIncognito: boolean;
    current: string | null;
}
export function historyFiles(files: RqbitFile[]): number[] {
    const media = mediaFiles(files);
    return media.length ? media : files.flatMap((file, i) => (file.attributes.padding ? [] : [i]));
}
export function historyRows(input: HistoryInput): HistoryRow[] {
    return input.torrents.flatMap((torrent) => {
        const infoHash = torrent.info_hash;
        const shouldHide = hideRow(input, infoHash, torrent);
        if (shouldHide)
            return [];
        return [buildRow(input, infoHash, torrent)];
    });
}
function hideRow(input: HistoryInput, infoHash: string, torrent: RqbitTorrentSummary): boolean {
    const queuedForDeletion = input.pendingDelete.has(infoHash);
    if (queuedForDeletion)
        return true;
    const isIncognito = false;
    const shownInIncognitoOnly = isIncognito && !input.inIncognito;
    return shownInIncognitoOnly;
}
function buildRow(input: HistoryInput, infoHash: string, torrent: RqbitTorrentSummary): HistoryRow {
    const files = input.fileLists.get(infoHash);
    const sourceFiles = files ?? torrent.files;
    return {
        infoHash,
        name: torrent.name ?? infoHash,
        incognito: false,
        active: infoHash === input.current,
        line: lineOf(torrent, sourceFiles),
    };
}
function lineOf(torrent: RqbitTorrentSummary, files: RqbitFile[] | undefined): HistoryLine {
    const stats = torrent.stats;
    if (!stats)
        return { kind: 'none' };
    if (stats.state === 'error')
        return { kind: 'error', error: stats.error ?? '' };
    if (stats.state === 'initializing')
        return { kind: 'checking' };
    if (!files)
        return { kind: 'none' };
    let bytes = 0;
    let have = 0;
    let whole = true;
    for (const i of historyFiles(files)) {
        const length = files[i]!.length;
        const progress = Math.min(stats.file_progress[i] ?? 0, length);
        bytes += length;
        have += progress;
        if (progress < length)
            whole = false;
    }
    if (whole)
        return { kind: 'done', bytes };
    const ratio = bytes > 0 ? have / bytes : 0;
    const percent = Math.floor(ratio * 100);
    const isLive = stats.state === 'live';
    const speed = isLive ? (stats.live?.download_speed.human_readable ?? null) : null;
    return { kind: 'progress', percent, bytes, speed };
}
export class FileLists {
    private readonly lists = new Map<string, RqbitFile[]>();
    private readonly asking = new Set<string>();
    constructor(private readonly client: RqbitClient, private readonly onChange: () => void) { }
    get map(): ReadonlyMap<string, RqbitFile[]> {
        return this.lists;
    }
    update(torrents: readonly RqbitTorrentSummary[]): void {
        for (const torrent of torrents) {
            const infoHash = torrent.info_hash;
            if (this.lists.has(infoHash))
                continue;
            if (torrent.files) {
                this.lists.set(infoHash, torrent.files);
                this.onChange();
                continue;
            }
            if (this.asking.has(infoHash))
                continue;
            this.asking.add(infoHash);
            this.client
                .torrentDetails(infoHash)
                .then(({ files }) => {
                if (!files || this.lists.has(infoHash))
                    return;
                this.lists.set(infoHash, files);
                this.onChange();
            })
                .catch(() => { })
                .finally(() => this.asking.delete(infoHash));
        }
    }
}
