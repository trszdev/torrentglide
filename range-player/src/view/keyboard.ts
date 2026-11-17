interface KeyTarget {
    target(): HTMLElement | null;
    escape(): boolean;
}
const players: KeyTarget[] = [];
let listening = false;
export function attachKeyboard(host: HTMLElement, player: KeyTarget): () => void {
    players.push(player);
    const markUsed = () => {
        players.splice(players.indexOf(player), 1);
        players.push(player);
    };
    host.addEventListener('pointerdown', markUsed);
    host.addEventListener('focusin', markUsed);
    if (!listening) {
        document.addEventListener('keydown', onKeyDown);
        listening = true;
    }
    return () => {
        host.removeEventListener('pointerdown', markUsed);
        host.removeEventListener('focusin', markUsed);
        const at = players.indexOf(player);
        if (at >= 0)
            players.splice(at, 1);
        if (!players.length) {
            document.removeEventListener('keydown', onKeyDown);
            listening = false;
        }
    };
}
function onKeyDown(event: KeyboardEvent): void {
    const arrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (event.defaultPrevented || (!arrow && event.key !== 'Escape'))
        return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
    const player = players.at(-1);
    if (!player)
        return;
    const path = event.composedPath();
    const from = path[0];
    if (from instanceof HTMLElement && (from.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(from.tagName)))
        return;
    if (document.querySelector('dialog[open]'))
        return;
    if (!arrow) {
        if (player.escape())
            event.preventDefault();
        return;
    }
    const target = player.target();
    if (!target || path.includes(target))
        return;
    event.preventDefault();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, code: event.code, bubbles: true, composed: true }));
}
