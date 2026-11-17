export type TorrentInput = {
    kind: 'magnet';
    uri: string;
    infoHash: string | null;
    displayName: string | null;
} | {
    kind: 'url';
    url: string;
} | {
    kind: 'file';
    bytes: Uint8Array<ArrayBuffer>;
    fileName: string;
};
export type TorrentInputErrorCode = 'empty' | 'invalid-url' | 'unrecognized';
export class TorrentInputError extends Error {
    override name = 'TorrentInputError';
    constructor(readonly code: TorrentInputErrorCode, readonly detail = '') {
        super(detail ? `${code}: ${detail}` : code);
    }
}
export function parseTorrentText(text: string): TorrentInput {
    const value = text.trim();
    if (!value)
        throw new TorrentInputError('empty');
    if (/^magnet:/i.test(value))
        return { kind: 'magnet', uri: value, ...parseMagnet(value) };
    const infoHash = infoHashFromBtih(value);
    if (infoHash)
        return { kind: 'magnet', uri: `magnet:?xt=urn:btih:${infoHash}`, infoHash, displayName: null };
    if (/^https?:\/\//i.test(value)) {
        if (!URL.canParse(value))
            throw new TorrentInputError('invalid-url', value);
        return { kind: 'url', url: new URL(value).href };
    }
    throw new TorrentInputError('unrecognized');
}
export function parseMagnet(uri: string): {
    infoHash: string | null;
    displayName: string | null;
} {
    const params = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
    let infoHash: string | null = null;
    for (const xt of params.getAll('xt')) {
        const btih = /^urn:btih:(.+)$/i.exec(xt.trim())?.[1];
        infoHash = btih ? infoHashFromBtih(btih) : null;
        if (infoHash)
            break;
    }
    return { infoHash, displayName: params.get('dn')?.trim() || null };
}
export function infoHashFromBtih(value: string): string | null {
    const v = value.trim();
    if (/^[0-9a-f]{40}$/i.test(v))
        return v.toLowerCase();
    if (/^[a-z2-7]{32}$/i.test(v))
        return base32ToHex(v.toUpperCase());
    return null;
}
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32ToHex(value: string): string {
    let bits = 0;
    let acc = 0;
    let hex = '';
    for (const char of value) {
        acc = ((acc << 5) | BASE32.indexOf(char)) & 0xfff;
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            hex += ((acc >> bits) & 0xff).toString(16).padStart(2, '0');
        }
    }
    return hex;
}
