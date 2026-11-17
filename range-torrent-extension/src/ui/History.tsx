import { formatBytes } from 'range-player/core';
import type { HistoryLine, HistoryRow } from '../services/history-model.ts';
import { usePage } from './context.ts';
import { DownloadedIcon, MaskIcon, PlusIcon, RemoveIcon, SettingsIcon } from './icons.tsx';
export function History() {
    const { app } = usePage();
    const { t } = app.text;
    const rows = app.rows.value;
    return (<section class={rows ? 'panel' : 'panel is-waiting'}>
      <div class="panel-header">
        <h2 class="panel-title">{t('history.title')}</h2>
        <div class="panel-actions">
          <button class="icon-btn" type="button" title={t('history.open')} aria-label={t('history.open')} onClick={() => (app.dialog.value = 'open')}>
            <PlusIcon />
          </button>
          <button class="icon-btn" type="button" title={t('history.settings')} aria-label={t('history.settings')} onClick={() => (app.dialog.value = 'settings')}>
            <SettingsIcon />
          </button>
        </div>
      </div>
      {rows &&
            (rows.length ? (<ul class="history-list">
            {rows.map((row) => (<Row key={row.infoHash} row={row}/>))}
          </ul>) : (<p class="hint history-empty">{t('history.empty')}</p>))}
    </section>);
}
function Row({ row }: {
    row: HistoryRow;
}) {
    const { app } = usePage();
    const { t } = app.text;
    return (<li class={row.active ? 'history-row is-open' : 'history-row'}>
      <button class="history-item" type="button" title={row.name} onClick={() => app.player.value?.openManaged(row.infoHash)}>
        <span class="history-title">
          <span class="history-name">{row.name}</span>
          {row.incognito && (<span class="mask history-mask" role="img" aria-label={t('incognito.row')} title={t('incognito.row')}>
              <MaskIcon />
            </span>)}
        </span>
        <Line line={row.line}/>
      </button>
      <button class="icon-btn history-remove" type="button" title={t('history.remove')} aria-label={t('history.removeNamed', { name: row.name })} onClick={() => {
            if (row.incognito)
                return void app.remove(row.infoHash, true);
            app.removing.value = row;
        }}>
        <RemoveIcon />
      </button>
    </li>);
}
function Line({ line }: {
    line: HistoryLine;
}) {
    const { app } = usePage();
    const { t } = app.text;
    switch (line.kind) {
        case 'none':
            return <span class="history-meta"/>;
        case 'error':
            return <span class="history-meta">{line.error ? `${t('history.error')} · ${line.error}` : t('history.error')}</span>;
        case 'checking':
            return <span class="history-meta">{t('history.checking')}</span>;
        case 'done':
            return (<span class="history-meta">
          <span class="history-downloaded">
            <DownloadedIcon />
          </span>
          {formatBytes(line.bytes)}
        </span>);
        case 'progress': {
            const parts = [`${line.percent}%`, formatBytes(line.bytes)];
            if (line.speed)
                parts.push(`↓ ${line.speed}`);
            return <span class="history-meta">{parts.join(' · ')}</span>;
        }
    }
}
