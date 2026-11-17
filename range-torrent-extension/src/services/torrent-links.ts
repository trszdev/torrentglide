import { parseMagnet } from 'range-player/core';
export type TorrentLink = {
    kind: 'magnet';
    uri: string;
    name: string | null;
} | {
    kind: 'torrent-file';
    url: string;
    name: string | null;
};
export interface LinkHints {
    type?: string;
    download?: string | null;
    text?: string;
}
export function torrentLink(href: string, hints: LinkHints = {}): TorrentLink | null {
    let url: URL;
    try {
        url = new URL(href);
    }
    catch {
        return null;
    }
    if (url.protocol === 'magnet:') {
        return { kind: 'magnet', uri: href, name: parseMagnet(href).displayName };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return null;
    const segment = lastPathSegment(url);
    const download = hints.download?.trim() || null;
    if (isTorrentName(segment))
        return { kind: 'torrent-file', url: url.href, name: download ?? segment };
    if (isTorrentName(download) ||
        /^application\/x-bittorrent\b/i.test(hints.type ?? '') ||
        /\.torrent\b/i.test(hints.text ?? '') ||
        isTrackerDownload(url, segment)) {
        return { kind: 'torrent-file', url: url.href, name: download };
    }
    return null;
}
function isTrackerDownload(url: URL, segment: string): boolean {
    return (/^(dl|download)\.php$/i.test(segment) &&
        ['t', 'id', 'tid', 'torrent', 'hash', 'info_hash'].some((param) => url.searchParams.get(param)));
}
export function looksLikeTorrentFile(bytes: Uint8Array): boolean {
    return bytes[0] === 0x64 && indexOfBytes(bytes, INFO_KEY) !== -1;
}
export function torrentFileName(url: string, contentDisposition: string | null, linkName?: string | null): string {
    const fromHeader = contentDisposition ? dispositionFileName(contentDisposition) : null;
    if (fromHeader)
        return fromHeader;
    if (linkName)
        return linkName;
    try {
        const segment = lastPathSegment(new URL(url));
        if (isTorrentName(segment))
            return segment;
    }
    catch {
    }
    return 'download.torrent';
}
const INFO_KEY = new TextEncoder().encode('4:infod');
function isTorrentName(name: string | null): name is string {
    return !!name && /\.torrent$/i.test(name);
}
function lastPathSegment(url: URL): string {
    const raw = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    try {
        return decodeURIComponent(raw);
    }
    catch {
        return raw;
    }
}
function dispositionFileName(header: string): string | null {
    const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
    if (extended?.[2]) {
        try {
            return decodeURIComponent(extended[2].trim());
        }
        catch {
        }
    }
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
    return (plain?.[1] ?? plain?.[2])?.trim() || null;
}
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
    const first = needle[0]!;
    for (let i = haystack.indexOf(first); i !== -1 && i <= haystack.length - needle.length; i = haystack.indexOf(first, i + 1)) {
        if (needle.every((byte, j) => haystack[i + j] === byte))
            return i;
    }
    return -1;
}
