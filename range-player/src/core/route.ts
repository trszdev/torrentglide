export interface Route {
    infoHash: string;
    fileIndex: number | null;
}
export function parseRoute(hash: string): Route | null {
    const match = /^#?([0-9a-f]{40})(?:\/(\d+))?$/i.exec(hash);
    if (!match?.[1])
        return null;
    return { infoHash: match[1].toLowerCase(), fileIndex: match[2] === undefined ? null : Number(match[2]) };
}
export function formatRoute({ infoHash, fileIndex }: Route): string {
    return fileIndex === null ? `#${infoHash}` : `#${infoHash}/${fileIndex}`;
}
