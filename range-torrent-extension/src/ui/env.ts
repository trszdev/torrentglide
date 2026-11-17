import type { PollerEnv } from '../services/rqbit-poller.ts';
export function browserEnv(): PollerEnv {
    return {
        every(ms, callback) {
            const timer = setInterval(callback, ms);
            return () => clearInterval(timer);
        },
        visible: () => document.visibilityState === 'visible',
        onVisibility(listener) {
            document.addEventListener('visibilitychange', listener);
            return () => document.removeEventListener('visibilitychange', listener);
        },
    };
}
