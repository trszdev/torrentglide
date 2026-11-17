import { formatBytes } from '../core/media.ts';
import type { RqbitStats } from '../core/rqbit.ts';
import type { OpenedTorrent } from '../core/session.ts';
import type { TorrentInputError } from '../core/torrent-input.ts';
import type { Phase, PlayerError } from '../controller/state.ts';
import type { PlayerText } from './i18n.ts';
export function busyText({ t }: PlayerText, phase: Phase): string | null {
    switch (phase.name) {
        case 'opening': {
            const { step } = phase;
            if (step.kind === 'resolving')
                return step.name ? t('status.resolvingNamed', { name: step.name }) : t('status.resolving');
            if (step.kind === 'fetching')
                return t('status.fetching');
            if (step.kind === 'reading')
                return t('status.reading', { name: step.name });
            return t('status.opening');
        }
        case 'preparing': {
            const { step } = phase;
            if (step.kind === 'checking') {
                return step.percent === null ? t('status.checking') : t('status.checkingPercent', { percent: step.percent });
            }
            return t(step.kind === 'adding' ? 'status.adding' : step.kind === 'resuming' ? 'status.resuming' : 'status.preparing');
        }
        case 'buffering':
            return t('status.buffering');
        default:
            return null;
    }
}
export function withElapsed({ t }: PlayerText, message: string, since: number | null, now: number): string {
    const seconds = since === null ? 0 : Math.floor((now - since) / 1000);
    return seconds >= 3 ? t('status.elapsed', { message, seconds }) : message;
}
export function errorText({ t }: PlayerText, error: PlayerError): string {
    switch (error.code) {
        case 'input-empty':
            return t('error.inputEmpty');
        case 'input-invalid-url':
            return t('error.inputInvalidUrl', { value: error.detail });
        case 'input-unrecognized':
            return t('error.inputUnrecognized');
        case 'rqbit-unreachable':
            return t('error.rqbitUnreachable', { url: error.detail });
        case 'no-file':
            return t('error.noFile', { index: error.detail });
        case 'no-torrent-data':
            return t('error.noTorrentData');
        case 'torrent-error':
            return t('error.torrentError', { error: error.detail });
        case 'pause-failed':
            return t('status.pauseFailed', { error: error.detail });
        case 'rqbit':
            return error.detail;
    }
}
export function inputErrorText(text: PlayerText, error: TorrentInputError): string {
    return errorText(text, { code: `input-${error.code}`, detail: error.detail });
}
export interface StatRow {
    key: 'downloaded' | 'speed' | 'peers' | 'error';
    label: string;
    value: string;
}
export function connectionRows({ t }: PlayerText, torrent: OpenedTorrent, index: number, stats: RqbitStats | null): StatRow[] {
    const file = torrent.files[index];
    if (!file)
        return [];
    const have = stats?.file_progress[index] ?? 0;
    const percent = file.length ? Math.min(100, (have / file.length) * 100) : 100;
    const live = stats?.state === 'live' ? stats.live : null;
    const notLive = !stats
        ? '…'
        : stats.state === 'live'
            ? '—'
            : t(stats.state === 'paused' ? 'stats.paused' : stats.state === 'initializing' ? 'stats.initializing' : 'stats.stateError');
    const rows: StatRow[] = [
        {
            key: 'downloaded',
            label: t('stats.downloaded'),
            value: !stats
                ? '…'
                : percent >= 100
                    ? t('stats.complete', { size: formatBytes(file.length) })
                    : t('stats.progress', { have: formatBytes(have), total: formatBytes(file.length), percent: Math.floor(percent) }),
        },
        { key: 'speed', label: t('stats.speed'), value: live ? live.download_speed.human_readable : notLive },
        { key: 'peers', label: t('stats.peers'), value: live ? String(live.snapshot.peer_stats.live) : notLive },
    ];
    if (stats?.error)
        rows.push({ key: 'error', label: t('stats.error'), value: stats.error });
    return rows;
}
