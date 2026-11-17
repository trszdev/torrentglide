import { useEffect, useRef } from 'preact/hooks';
import { createRangePlayer } from 'range-player';
import type { HashLocation } from '../services/hash-router.ts';
import { usePage } from './context.ts';
const pageHash: HashLocation = {
    read: () => location.hash,
    replace(hash) {
        history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
    },
    onChange(listener) {
        window.addEventListener('hashchange', listener);
        return () => window.removeEventListener('hashchange', listener);
    },
};
export function PlayerHost() {
    const { app, client, language, wasmUrl, openId, debug } = usePage();
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!host.current)
            return;
        const player = createRangePlayer(host.current, {
            client,
            wasmUrl,
            language,
            debug,
        });
        const detach = app.attachPlayer(player, pageHash, openId);
        return () => {
            detach();
            player.destroy();
        };
    }, []);
    return <div ref={host} class="player-host"/>;
}
