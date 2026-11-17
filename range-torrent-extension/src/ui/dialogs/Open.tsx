import { useState } from 'preact/hooks';
import { inputErrorText } from 'range-player';
import { parseTorrentText, TorrentInputError } from 'range-player/core';
import { usePage } from '../context.ts';
import { Dialog } from '../Dialog.tsx';
import { UploadIcon } from '../icons.tsx';
export function OpenDialog() {
    const { app } = usePage();
    return (<Dialog open={app.dialog.value === 'open'} onClose={() => (app.dialog.value = null)} labelledBy="open-title">
      <OpenForm />
    </Dialog>);
}
export async function openFile(file: File, open: (bytes: Uint8Array, fileName: string) => void): Promise<void> {
    open(new Uint8Array(await file.arrayBuffer()), file.name);
}
function OpenForm() {
    const { app, language } = usePage();
    const { t } = app.text;
    const [error, setError] = useState<string | null>(null);
    const [over, setOver] = useState(0);
    const close = () => (app.dialog.value = null);
    const submit = (event: SubmitEvent) => {
        event.preventDefault();
        const field = (event.currentTarget as HTMLFormElement).elements.namedItem('magnet') as HTMLInputElement;
        try {
            parseTorrentText(field.value);
        }
        catch (err) {
            setError(err instanceof TorrentInputError ? inputErrorText(err, language) : String(err));
            field.focus();
            return;
        }
        close();
        app.player.value?.openText(field.value);
    };
    const pick = (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        const player = app.player.value;
        if (!file || !player)
            return;
        close();
        void openFile(file, (bytes, name) => player.openTorrentFile(bytes, name));
    };
    return (<form method="dialog" autocomplete="off" onSubmit={submit}>
      <h2 id="open-title" class="rp-dialog-title">
        {t('open.title')}
      </h2>
      <label class={over ? 'drop-zone is-over' : 'drop-zone'} onDragEnter={() => setOver((n) => n + 1)} onDragLeave={() => setOver((n) => Math.max(0, n - 1))} onDrop={() => setOver(0)}>
        <input class="visually-hidden" type="file" accept=".torrent,application/x-bittorrent" onChange={pick}/>
        <UploadIcon />
        <span>{t('open.drop')}</span>
      </label>
      <div class="rp-dialog-or">{t('open.or')}</div>
      <label class="rp-field">
        <span class="rp-field-label">{t('open.magnet')}</span>
        <input class="text-input" name="magnet" type="text" spellcheck={false} placeholder="magnet:?xt=urn:btih:…" autofocus/>
      </label>
      {error && (<p class="rp-dialog-error" role="alert">
          {error}
        </p>)}
      <div class="rp-dialog-actions">
        <button class="btn" type="button" onClick={close}>
          {t('common.cancel')}
        </button>
        <button class="btn btn-primary" type="submit">
          {t('open.submit')}
        </button>
      </div>
    </form>);
}
