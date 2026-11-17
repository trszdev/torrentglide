export const REVIEW_EMAIL = 'torrent.glide@mailservice.com.de';
export const EMAIL_UP_TO = 3;
export interface ReviewContext {
    version: string;
    browser: string;
}
export const REVIEW_SUBJECT = 'TorrentGlide User Review';
export function reviewMailto(rating: number, message: string, context: ReviewContext): string {
    const subject = REVIEW_SUBJECT;
    const footer = `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} · TorrentGlide ${context.version} · ${context.browser}`;
    const body = message.trim() ? `${message.trim()}\n\n${footer}` : footer;
    return `mailto:${REVIEW_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
const FIREFOX_ADDON_SLUG = 'torrentglide';
export function storeReviewUrl(browser: string, extensionId: string): string {
    const id = encodeURIComponent(extensionId);
    switch (browser) {
        case 'firefox':
            return `https://addons.mozilla.org/firefox/addon/${FIREFOX_ADDON_SLUG}/reviews/`;
        case 'edge':
            return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
        default:
            return `https://chromewebstore.google.com/detail/${id}/reviews`;
    }
}
