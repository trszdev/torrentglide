export function hostPermissionFor(rqbitUrl: string): string {
    const url = new URL(rqbitUrl);
    return `${url.protocol}//${url.hostname}/*`;
}
export function isLocalAddress(rqbitUrl: string): boolean {
    const { hostname } = new URL(rqbitUrl);
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]';
}
export function hostOf(rqbitUrl: string): string {
    return new URL(rqbitUrl).host;
}
