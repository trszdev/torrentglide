import { useEffect, useState } from 'preact/hooks';
import { usePage } from './context.ts';
import { openFile } from './dialogs/Open.tsx';
const DROPPABLE = ['Files', 'text/uri-list', 'text/plain'];
export function DropOverlay() {
    const { app } = usePage();
    const { t } = app.text;
    const [depth, setDepth] = useState(0);
    useEffect(() => {
        const droppable = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].some((type) => DROPPABLE.includes(type));
        const enter = (event: DragEvent) => {
            if (!droppable(event))
                return;
            event.preventDefault();
            setDepth((n) => n + 1);
        };
        const over = (event: DragEvent) => {
            if (droppable(event))
                event.preventDefault();
        };
        const leave = () => setDepth((n) => Math.max(0, n - 1));
        const drop = (event: DragEvent) => {
            setDepth(0);
            const data = event.dataTransfer;
            const player = app.player.value;
            if (!data || !player)
                return;
            event.preventDefault();
            if (app.dialog.value === 'open')
                app.dialog.value = null;
            const file = data.files[0];
            if (file) {
                void openFile(file, (bytes, name) => player.openTorrentFile(bytes, name));
                return;
            }
            const text = data.getData('text/uri-list') || data.getData('text/plain');
            if (text)
                player.openText(text);
        };
        window.addEventListener('dragenter', enter);
        window.addEventListener('dragover', over);
        window.addEventListener('dragleave', leave);
        window.addEventListener('drop', drop);
        return () => {
            window.removeEventListener('dragenter', enter);
            window.removeEventListener('dragover', over);
            window.removeEventListener('drop', drop);
            window.removeEventListener('dragleave', leave);
        };
    }, []);
    if (!depth || app.dialog.value === 'open')
        return null;
    return <div class="drop-overlay">{t('player.drop')}</div>;
}
