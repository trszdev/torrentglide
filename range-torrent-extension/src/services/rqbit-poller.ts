import type { RqbitClient, RqbitTorrentSummary } from 'range-player/core';
export type RqbitStatus = {
    kind: 'connecting';
} | {
    kind: 'running';
    version: string;
} | {
    kind: 'not-allowed';
} | {
    kind: 'not-answering';
    error: string;
};
export interface PollerState {
    status: RqbitStatus;
    torrents: RqbitTorrentSummary[] | null;
}
export interface PollerEnv {
    every(ms: number, callback: () => void): () => void;
    visible(): boolean;
    onVisibility(listener: () => void): () => void;
}
export interface RqbitPoller {
    readonly state: PollerState;
    refresh(): Promise<void>;
    stop(): void;
}
export function createRqbitPoller({ client, env, allowed, onChange, intervalMs = 5000, }: {
    client: RqbitClient;
    env: PollerEnv;
    allowed: () => Promise<boolean>;
    onChange: (state: PollerState) => void;
    intervalMs?: number;
}): RqbitPoller {
    let state: PollerState = { status: { kind: 'connecting' }, torrents: null };
    let latest = 0;
    let inFlight: Promise<void> | null = null;
    let stopped = false;
    async function poll(): Promise<void> {
        const call = ++latest;
        let next: PollerState;
        try {
            const [info, torrents] = await Promise.all([client.serverInfo(), client.listTorrents()]);
            next = { status: { kind: 'running', version: info.version }, torrents };
        }
        catch (err) {
            const status: RqbitStatus = (await allowed().catch(() => true))
                ? { kind: 'not-answering', error: err instanceof Error ? err.message : String(err) }
                : { kind: 'not-allowed' };
            next = { status, torrents: state.torrents };
        }
        if (call !== latest || stopped)
            return;
        state = next;
        onChange(state);
    }
    function refresh(): Promise<void> {
        const run = poll();
        inFlight = run;
        void run.finally(() => {
            if (inFlight === run)
                inFlight = null;
        });
        return run;
    }
    const tick = () => {
        if (env.visible() && !inFlight)
            void refresh();
    };
    const stopTimer = env.every(intervalMs, tick);
    const stopVisibility = env.onVisibility(tick);
    void refresh();
    return {
        get state() {
            return state;
        },
        refresh,
        stop() {
            stopped = true;
            stopTimer();
            stopVisibility();
        },
    };
}
