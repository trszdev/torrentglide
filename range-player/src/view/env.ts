import type { Env } from '../controller/ports.ts';
export function browserEnv(): Env {
    const listen = <K extends keyof WindowEventMap>(type: K, listener: (event: WindowEventMap[K]) => void) => {
        window.addEventListener(type, listener);
        return () => window.removeEventListener(type, listener);
    };
    return {
        now: () => Date.now(),
        every(ms, callback) {
            const timer = setInterval(callback, ms);
            return () => clearInterval(timer);
        },
        visible: () => document.visibilityState === 'visible',
        onVisibility(listener) {
            document.addEventListener('visibilitychange', listener);
            return () => document.removeEventListener('visibilitychange', listener);
        },
        onPageHide: (listener) => listen('pagehide', () => listener()),
        onPageShow: (listener) => listen('pageshow', (event) => listener(event.persisted)),
    };
}
