import type { StorageArea } from './storage.ts';
export type OpenRequest = {
    kind: 'text';
    text: string;
} | {
    kind: 'torrent-file';
    base64: string;
    fileName: string;
};
export const openRequestKey = (id: string) => `open:${id}`;
export function encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}
export function decodeBase64(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
export async function parkOpenRequest(area: StorageArea, request: OpenRequest, id: string = crypto.randomUUID()): Promise<string> {
    await area.set({ [openRequestKey(id)]: request });
    return id;
}
export async function takeOpenRequest(area: StorageArea, id: string): Promise<OpenRequest | null> {
    const key = openRequestKey(id);
    const value = (await area.get([key]))[key];
    if (value === undefined)
        return null;
    await area.remove([key]);
    return isOpenRequest(value) ? value : null;
}
export function openParam(href: string): {
    id: string | null;
    url: string;
} {
    const url = new URL(href);
    const id = url.searchParams.get('open');
    url.searchParams.delete('open');
    return { id, url: url.href };
}
function isOpenRequest(value: unknown): value is OpenRequest {
    const request = value as Partial<Record<string, unknown>> | null;
    if (request?.kind === 'text')
        return typeof request.text === 'string';
    if (request?.kind === 'torrent-file')
        return typeof request.base64 === 'string' && typeof request.fileName === 'string';
    return false;
}
