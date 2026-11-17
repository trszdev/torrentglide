import { useState } from 'preact/hooks';
import type { HistoryRow } from '../../services/history-model.ts';
import { usePage } from '../context.ts';
import { Dialog } from '../Dialog.tsx';
export function RemoveDialog() {
    const { app } = usePage();
    const row = app.removing.value;
    return (<Dialog open={!!row} onClose={() => (app.removing.value = null)} labelledBy="remove-title">
      {row && <RemoveForm row={row}/>}
    </Dialog>);
}
function RemoveForm({ row }: {
    row: HistoryRow;
}) {
    const { app } = usePage();
    const { t } = app.text;
    const [deleteFiles, setDeleteFiles] = useState(false);
    const folder = app.torrent(row.infoHash)?.output_folder;
    const close = () => (app.removing.value = null);
    const confirm = (event: SubmitEvent) => {
        event.preventDefault();
        close();
        void app.remove(row.infoHash, deleteFiles);
    };
    return (<form method="dialog" onSubmit={confirm}>
      <h2 id="remove-title" class="rp-dialog-title">
        {t('remove.title')}
      </h2>
      <p class="rp-dialog-name">{row.name}</p>
      <p class="hint">{t('remove.effect')}</p>
      <label class="rp-checkbox is-danger">
        <input type="checkbox" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.currentTarget.checked)}/>
        <span>
          {t('remove.deleteFiles')}
          {folder && <span class="hint">{t('remove.folder', { folder })}</span>}
        </span>
      </label>
      <div class="rp-dialog-actions">
        <button class="btn" type="button" onClick={close}>
          {t('common.cancel')}
        </button>
        <button class={deleteFiles ? 'btn btn-danger' : 'btn btn-primary'} type="submit">
          {t(deleteFiles ? 'remove.confirmDelete' : 'remove.confirm')}
        </button>
      </div>
    </form>);
}
