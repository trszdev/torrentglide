import { encodeBase64, type OpenRequest } from './open-request.ts';
import { looksLikeTorrentFile, torrentFileName, type TorrentLink } from './torrent-links.ts';
export class FetchTorrentError extends Error {
    override name = 'FetchTorrentError';
    constructor(readonly code: 'site-status' | 'not-torrent', readonly detail = '') {
        super(detail ? `${code}: ${detail}` : code);
    }
}
export async function openRequestFor(link: TorrentLink, fetchImpl: (url: string, init?: RequestInit) => Promise<Response>): Promise<OpenRequest> {
    if (link.kind === 'magnet')
        return { kind: 'text', text: link.uri };
    let res: Response;
    try {
        res = await fetchImpl(link.url, { credentials: 'include' });
    }
    catch {
        return { kind: 'text', text: link.url };
    }
    if (!res.ok)
        throw new FetchTorrentError('site-status', `${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    const received = new Uint8Array(await res.arrayBuffer());
    const bytes = new Uint8Array(received.length);
    bytes.set(received);
    if (!looksLikeTorrentFile(bytes)) {
        throw new FetchTorrentError('not-torrent', res.headers.get('content-type')?.split(';')[0]?.trim() ?? '');
    }
    const fileName = torrentFileName(link.url, res.headers.get('content-disposition'), link.name);
    return { kind: 'torrent-file', base64: encodeBase64(bytes), fileName };
}
