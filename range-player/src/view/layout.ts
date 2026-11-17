import type { MoviAdapter } from './movi-adapter.ts';
const REFERENCE_WIDTH = 1052;
export function watchLayout(root: HTMLElement, movi: MoviAdapter): () => void {
    const { element } = movi;
    let bar: HTMLElement | null = null;
    const update = () => {
        bar ??= movi.controlsBar();
        if (bar && !observer.observing.has(bar))
            observer.observe(bar);
        const fullscreen = document.fullscreenElement === element;
        const scale = fullscreen ? Math.max(1, element.clientWidth / REFERENCE_WIDTH) : 1;
        root.style.setProperty('--rp-s', String(scale));
        root.style.setProperty('--rp-controls-h', `${bar?.offsetHeight ?? 0}px`);
    };
    const resize = new ResizeObserver(update);
    const observer = {
        observing: new Set<Element>(),
        observe(target: Element) {
            this.observing.add(target);
            resize.observe(target);
        },
    };
    observer.observe(element);
    document.addEventListener('fullscreenchange', update);
    update();
    return () => {
        resize.disconnect();
        document.removeEventListener('fullscreenchange', update);
        root.style.removeProperty('--rp-s');
        root.style.removeProperty('--rp-controls-h');
    };
}
