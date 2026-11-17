import type { OpenedTorrent } from '../core/session.ts';
import type { RqbitStats } from '../core/rqbit.ts';
export type OpeningStep = {
    kind: 'resolving';
    name: string | null;
} | {
    kind: 'fetching';
} | {
    kind: 'reading';
    name: string;
} | {
    kind: 'opening';
};
export type PrepareStep = {
    kind: 'preparing';
} | {
    kind: 'adding';
} | {
    kind: 'checking';
    percent: number | null;
} | {
    kind: 'resuming';
};
export type Phase = {
    name: 'idle';
} | {
    name: 'opening';
    step: OpeningStep;
} | {
    name: 'choosing';
} | {
    name: 'preparing';
    index: number;
    step: PrepareStep;
} | {
    name: 'buffering';
    index: number;
} | {
    name: 'playing';
    index: number;
};
export type PlayerErrorCode = 'input-empty' | 'input-invalid-url' | 'input-unrecognized' | 'rqbit-unreachable' | 'no-file' | 'no-torrent-data' | 'torrent-error' | 'pause-failed' | 'rqbit';
export interface PlayerError {
    code: PlayerErrorCode;
    detail: string;
}
export interface Notice {
    kind: 'busy' | 'error';
    text: string;
}
export interface PlayerState {
    phase: Phase;
    torrent: OpenedTorrent | null;
    shown: number | null;
    menuOpen: boolean;
    collapsed: ReadonlySet<string>;
    stats: RqbitStats | null;
    error: PlayerError | null;
    hostNotice: Notice | null;
    busySince: number | null;
}
export const initialState: PlayerState = {
    phase: { name: 'idle' },
    torrent: null,
    shown: null,
    menuOpen: false,
    collapsed: new Set(),
    stats: null,
    error: null,
    hostNotice: null,
    busySince: null,
};
export function isBusy(phase: Phase): boolean {
    return phase.name === 'opening' || phase.name === 'preparing' || phase.name === 'buffering';
}
export function markedFile(state: PlayerState): number | null {
    const { phase } = state;
    return 'index' in phase ? phase.index : state.shown;
}
