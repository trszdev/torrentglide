import type { RqbitStats } from '../core/rqbit.ts';
import type { OpenedTorrent } from '../core/session.ts';
import { mediaFiles } from '../core/media.ts';
import { initialState, type Notice, type OpeningStep, type Phase, type PlayerError, type PlayerState, type PrepareStep, } from './state.ts';
export type PlayerEvent = {
    type: 'open';
    step: OpeningStep;
    at: number;
} | {
    type: 'opened';
    torrent: OpenedTorrent;
    play: number | null;
} | {
    type: 'failed';
    error: PlayerError;
} | {
    type: 'play';
    index: number;
    at: number;
} | {
    type: 'prepare-step';
    step: PrepareStep;
} | {
    type: 'prepared';
    torrent: OpenedTorrent;
    index: number;
} | {
    type: 'media';
    event: 'loadedmetadata' | 'errordisplay' | 'ended';
} | {
    type: 'error';
    error: PlayerError;
} | {
    type: 'notify';
    notice: Notice | null;
} | {
    type: 'menu';
    open: boolean;
} | {
    type: 'toggle-group';
    key: string;
} | {
    type: 'dismiss-error';
} | {
    type: 'stats';
    infoHash: string;
    stats: RqbitStats;
} | {
    type: 'close';
};
export function reduce(state: PlayerState, event: PlayerEvent): PlayerState {
    switch (event.type) {
        case 'open':
            return { ...state, phase: { name: 'opening', step: event.step }, error: null, hostNotice: null, busySince: event.at };
        case 'opened': {
            const { torrent, play } = event;
            const base: PlayerState = torrent.infoHash === state.torrent?.infoHash
                ? { ...state, torrent }
                : { ...state, torrent, shown: null, menuOpen: false, collapsed: new Set(), stats: null };
            if (play !== null)
                return { ...base, phase: { name: 'preparing', index: play, step: { kind: 'preparing' } } };
            return { ...base, phase: settled(base), busySince: null };
        }
        case 'failed':
            return { ...state, phase: settled(state), error: event.error, hostNotice: null, busySince: null };
        case 'play':
            if (!state.torrent)
                return state;
            return {
                ...state,
                phase: { name: 'preparing', index: event.index, step: { kind: 'preparing' } },
                menuOpen: false,
                error: null,
                hostNotice: null,
                busySince: event.at,
            };
        case 'prepare-step':
            if (state.phase.name !== 'preparing')
                return state;
            return { ...state, phase: { ...state.phase, step: event.step } };
        case 'prepared':
            return { ...state, phase: { name: 'buffering', index: event.index }, torrent: event.torrent, shown: event.index };
        case 'media':
            if (event.event === 'ended') {
                const others = state.phase.name === 'playing' && state.torrent && mediaFiles(state.torrent.files).length > 1;
                return others ? { ...state, menuOpen: true } : state;
            }
            if (state.phase.name !== 'buffering')
                return state;
            return { ...state, phase: { name: 'playing', index: state.phase.index }, busySince: null };
        case 'error':
            return { ...state, error: event.error, hostNotice: null };
        case 'notify':
            return { ...state, hostNotice: event.notice, error: event.notice ? null : state.error };
        case 'menu':
            return { ...state, menuOpen: event.open };
        case 'toggle-group': {
            const collapsed = new Set(state.collapsed);
            if (!collapsed.delete(event.key))
                collapsed.add(event.key);
            return { ...state, collapsed };
        }
        case 'dismiss-error':
            return { ...state, error: null, hostNotice: state.hostNotice?.kind === 'error' ? null : state.hostNotice };
        case 'stats':
            if (event.infoHash !== state.torrent?.infoHash)
                return state;
            return { ...state, stats: event.stats };
        case 'close':
            return initialState;
    }
}
function settled(state: PlayerState): Phase {
    if (state.shown !== null)
        return { name: 'playing', index: state.shown };
    return state.torrent ? { name: 'choosing' } : { name: 'idle' };
}
