import { formatRoute, parseRoute } from 'range-player/core';
type Current = {
    infoHash: string;
    fileIndex: number | null;
} | null;
export interface RoutedPlayer extends EventTarget {
    readonly current: Current;
    play(fileIndex: number): void;
    openManaged(infoHash: string, fileIndex?: number): void;
}
export interface HashLocation {
    read(): string;
    replace(hash: string): void;
    onChange(listener: () => void): () => void;
}
export function createHashRouter({ player, location, hidden, }: {
    player: RoutedPlayer;
    location: HashLocation;
    hidden: (infoHash: string) => Promise<boolean>;
}): () => void {
    const managed = new Set<string>();
    let latest = 0;
    let stopped = false;
    const hashOf = (current: Current) => (current && managed.has(current.infoHash) ? formatRoute(current) : '');
    async function follow(): Promise<void> {
        const call = ++latest;
        const route = parseRoute(location.read());
        if (!route)
            return;
        const { current } = player;
        if (current?.infoHash === route.infoHash) {
            if (route.fileIndex !== null && route.fileIndex !== current.fileIndex)
                player.play(route.fileIndex);
            return;
        }
        const isHidden = await hidden(route.infoHash);
        if (call !== latest || stopped)
            return;
        if (isHidden)
            location.replace(hashOf(player.current));
        else
            player.openManaged(route.infoHash, route.fileIndex ?? undefined);
    }
    const listeners: [
        string,
        (event: Event) => void
    ][] = [
        ['opened', (event) => {
                const { infoHash, managed: has } = (event as CustomEvent<{
                    infoHash: string;
                    managed: boolean;
                }>).detail;
                if (has)
                    managed.add(infoHash);
            }],
        ['added', (event) => void managed.add((event as CustomEvent<{
                infoHash: string;
            }>).detail.infoHash)],
        ['current', (event) => location.replace(hashOf((event as CustomEvent<Current>).detail))],
    ];
    for (const [type, listener] of listeners)
        player.addEventListener(type, listener);
    const stopLocation = location.onChange(() => void follow());
    void follow();
    return () => {
        stopped = true;
        stopLocation();
        for (const [type, listener] of listeners)
            player.removeEventListener(type, listener);
    };
}
