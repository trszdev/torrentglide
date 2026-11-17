import type { SubtitleFormat } from '../core/media.ts';
import type { PlayerState } from './state.ts';
export interface SubtitleTrack {
    url: string;
    label: string;
    lang: string;
    format: SubtitleFormat;
}
export interface MediaSource {
    url: string;
    title: string;
    resumeKey: string;
    subtitles: SubtitleTrack[];
}
export type MediaEvent = 'loadedmetadata' | 'errordisplay' | 'ended';
export type Intent = {
    type: 'play';
    index: number;
} | {
    type: 'menu';
    open: boolean;
} | {
    type: 'toggle-group';
    key: string;
} | {
    type: 'dismiss-error';
};
export interface Surface {
    render(state: PlayerState): void;
    load(source: MediaSource): void;
    reset(): void;
    onMedia(listener: (event: MediaEvent) => void): () => void;
    onIntent(listener: (intent: Intent) => void): () => void;
}
export interface Env {
    now(): number;
    every(ms: number, callback: () => void): () => void;
    visible(): boolean;
    onVisibility(listener: () => void): () => void;
    onPageHide(listener: () => void): () => void;
    onPageShow(listener: (persisted: boolean) => void): () => void;
}
