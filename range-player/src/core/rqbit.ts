export interface RqbitFileAttributes {
    symlink: boolean;
    hidden: boolean;
    padding: boolean;
    executable: boolean;
}
export interface RqbitFile {
    name: string;
    components: string[];
    length: number;
    included: boolean;
    attributes: RqbitFileAttributes;
}
export interface RqbitTorrentDetails {
    id?: number | null;
    info_hash: string;
    name: string | null;
    output_folder: string;
    total_pieces?: number;
    files?: RqbitFile[];
}
export interface RqbitTorrentSummary extends RqbitTorrentDetails {
    id: number;
    stats?: RqbitStats;
}
export interface RqbitAddResponse {
    id: number | null;
    details: RqbitTorrentDetails;
    output_folder: string;
    seen_peers?: string[] | null;
}
export type RqbitTorrentState = 'initializing' | 'paused' | 'live' | 'error';
export interface RqbitSpeed {
    mbps: number;
    human_readable: string;
}
export interface RqbitPeerStats {
    queued: number;
    connecting: number;
    live: number;
    seen: number;
    dead: number;
    not_needed: number;
}
export interface RqbitLiveStats {
    snapshot: {
        downloaded_and_checked_bytes: number;
        fetched_bytes: number;
        uploaded_bytes: number;
        peer_stats: RqbitPeerStats;
    };
    download_speed: RqbitSpeed;
    upload_speed: RqbitSpeed;
    time_remaining: {
        human_readable: string;
    } | null;
}
export interface RqbitStats {
    state: RqbitTorrentState;
    file_progress: number[];
    error: string | null;
    progress_bytes: number;
    uploaded_bytes: number;
    total_bytes: number;
    finished: boolean;
    live: RqbitLiveStats | null;
}
export interface RqbitServerInfo {
    server: string;
    version: string;
}
export interface AddTorrentOptions {
    listOnly?: boolean;
    overwrite?: boolean;
    onlyFiles?: number[];
    subFolder?: string;
}
export type TorrentRef = number | string;
export class RqbitError extends Error {
    override name = 'RqbitError';
    constructor(message: string, readonly status: number, readonly kind: string) {
        super(message);
    }
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
interface RequestOptions {
    body?: string | Uint8Array<ArrayBuffer>;
    contentType?: string;
    signal?: AbortSignal;
    keepalive?: boolean;
}
export class RqbitClient {
    readonly baseUrl: string;
    private readonly fetchImpl: FetchLike;
    constructor(baseUrl = '/rqbit', fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.fetchImpl = fetchImpl;
    }
    serverInfo(signal?: AbortSignal): Promise<RqbitServerInfo> {
        return this.json('GET', '/', { signal });
    }
    async listTorrents(signal?: AbortSignal): Promise<RqbitTorrentSummary[]> {
        const { torrents } = await this.json<{
            torrents: RqbitTorrentSummary[];
        }>('GET', '/torrents?with_stats=true', { signal });
        return torrents;
    }
    torrentDetails(ref: TorrentRef, signal?: AbortSignal): Promise<RqbitTorrentDetails> {
        return this.json('GET', `/torrents/${ref}`, { signal });
    }
    async findTorrent(infoHash: string, signal?: AbortSignal): Promise<RqbitTorrentDetails | null> {
        try {
            return await this.torrentDetails(infoHash, signal);
        }
        catch (err) {
            if (err instanceof RqbitError && err.status === 404)
                return null;
            throw err;
        }
    }
    torrentStats(ref: TorrentRef, signal?: AbortSignal): Promise<RqbitStats> {
        return this.json('GET', `/torrents/${ref}/stats/v1`, { signal });
    }
    async resolveMagnet(url: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
        const res = await this.request('POST', '/torrents/resolve_magnet', { body: url, contentType: 'text/plain', signal });
        return new Uint8Array(await res.arrayBuffer());
    }
    addTorrent(source: Uint8Array<ArrayBuffer> | string, options: AddTorrentOptions = {}, signal?: AbortSignal): Promise<RqbitAddResponse> {
        const params = new URLSearchParams();
        const listOnly = options.listOnly === true;
        if (listOnly)
            params.set('list_only', 'true');
        if (options.overwrite === true)
            params.set('overwrite', 'true');
        const onlyFiles = options.onlyFiles;
        if (onlyFiles !== undefined && onlyFiles.length > 0)
            params.set('only_files', onlyFiles.join(','));
        if (options.subFolder !== undefined && options.subFolder.length > 0)
            params.set('sub_folder', options.subFolder);
        const hasQuery = params.size > 0;
        const query = hasQuery ? `?${params}` : '';
        const isTextSource = typeof source === 'string';
        const contentType = isTextSource ? 'text/plain' : 'application/x-bittorrent';
        return this.json('POST', `/torrents${query}`, { body: source, contentType, signal });
    }
    async start(ref: TorrentRef, signal?: AbortSignal): Promise<void> {
        await this.request('POST', `/torrents/${ref}/start`, { signal });
    }
    async pause(ref: TorrentRef, signal?: AbortSignal, { keepalive = false } = {}): Promise<void> {
        await this.request('POST', `/torrents/${ref}/pause`, { signal, keepalive });
    }
    async forget(ref: TorrentRef, signal?: AbortSignal): Promise<void> {
        await this.request('POST', `/torrents/${ref}/forget`, { signal });
    }
    async delete(ref: TorrentRef, signal?: AbortSignal): Promise<void> {
        await this.request('POST', `/torrents/${ref}/delete`, { signal });
    }
    async updateOnlyFiles(ref: TorrentRef, files: number[], signal?: AbortSignal): Promise<void> {
        const body = JSON.stringify({ only_files: files });
        await this.request('POST', `/torrents/${ref}/update_only_files`, { body, contentType: 'application/json', signal });
    }
    streamUrl(ref: TorrentRef, fileIndex: number, fileName?: string): string {
        const hasName = fileName !== undefined && fileName.length > 0;
        const encoded = hasName ? encodeURIComponent(fileName) : '';
        const suffix = hasName ? `/${encoded}` : '';
        const base = `${this.baseUrl}/torrents/${ref}/stream/${fileIndex}`;
        return base + suffix;
    }
    private async json<T>(method: string, path: string, options: RequestOptions): Promise<T> {
        const res = await this.request(method, path, options);
        return (await res.json()) as T;
    }
    private async request(method: string, path: string, options: RequestOptions): Promise<Response> {
        const headers: Record<string, string> = {};
        if (options.contentType !== undefined && options.contentType.length > 0)
            headers['content-type'] = options.contentType;
        const keepalive = options.keepalive === true;
        const url = `${this.baseUrl}${path}`;
        let res: Response;
        try {
            res = await this.fetchImpl(url, {
                method,
                headers,
                body: options.body,
                signal: options.signal,
                keepalive,
            });
        }
        catch (err) {
            const aborted = options.signal !== undefined && options.signal.aborted === true;
            if (aborted)
                throw err;
            throw new RqbitError(`rqbit is not reachable at ${this.baseUrl}`, 0, 'rqbit_unreachable');
        }
        const ok = res.ok === true;
        if (!ok)
            throw await errorFrom(res);
        return res;
    }
}
async function errorFrom(res: Response): Promise<RqbitError> {
    const text = await res.text().catch(() => '');
    const body = parseJson(text);
    if (body !== null && typeof body.human_readable === 'string') {
        const errorKind = body.error_kind;
        const kind = typeof errorKind === 'string' ? errorKind : 'http_error';
        return new RqbitError(body.human_readable, res.status, kind);
    }
    const trimmed = text.trim();
    const sliced = trimmed.slice(0, 200);
    const detail = sliced.length > 0 ? sliced : res.statusText;
    const hasDetail = detail.length > 0;
    const suffix = hasDetail ? `: ${detail}` : '';
    return new RqbitError(`rqbit answered ${res.status}${suffix}`, res.status, 'http_error');
}
function parseJson(text: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(text);
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    }
    catch {
        return null;
    }
}
