import { html, nothing, type TemplateResult } from 'lit-html';
import { groupFiles, type FileGroup } from '../../core/file-groups.ts';
import { filePath, formatBytes, mediaFiles } from '../../core/media.ts';
import type { RqbitStats } from '../../core/rqbit.ts';
import type { OpenedTorrent } from '../../core/session.ts';
import type { PlayerText } from '../i18n.ts';
import { ICON_CLOSE } from './message.ts';
export interface MenuView {
    torrent: OpenedTorrent;
    marked: number | null;
    pinned: boolean;
    collapsed: ReadonlySet<string>;
    stats: RqbitStats | null;
    text: PlayerText;
    onPlay(index: number): void;
    onClose(): void;
    onToggleGroup(key: string): void;
}
export function groupKey(group: FileGroup): string {
    return `${group.kind}\0${group.dir}\0${group.name}`;
}
export function fileMenuTemplate(view: MenuView): TemplateResult {
    const { torrent, text } = view;
    const groups = groupFiles(torrent.files);
    const listed = mediaFiles(torrent.files).length;
    const files = torrent.files.filter((file) => !file.attributes.padding);
    const total = files.reduce((sum, file) => sum + file.length, 0);
    const count = listed === files.length ? text.t('files.count', { n: listed }) : text.t('files.countOf', { shown: listed, n: files.length });
    const lone = groups.filter((group) => group.kind !== 'single').length === 1;
    return html `<div class="rp-files ${view.pinned ? 'is-pinned' : ''}" role="dialog" aria-label=${text.t('files.label')}>
    <div class="rp-files-header">
      <div class="rp-files-heading">
        <h2 class="rp-files-title" title=${torrent.name}>${torrent.name}</h2>
        <p class="rp-files-meta">${count} · ${formatBytes(total)}</p>
        ${view.pinned ? html `<p class="rp-files-hint">${text.t('status.chooseFile')}</p>` : nothing}
      </div>
      ${view.pinned
        ? nothing
        : html `<button type="button" class="rp-icon-button" aria-label=${text.t('files.close')} title=${text.t('files.close')} @click=${view.onClose}>
            ${ICON_CLOSE}
          </button>`}
    </div>
    <div class="rp-files-body">
      ${groups.length
        ? groups.map((group) => (group.kind === 'single' || lone ? rows(view, group) : groupTemplate(view, group)))
        : html `<p class="rp-files-empty">${text.t('files.none')}</p>`}
    </div>
  </div>`;
}
function groupTemplate(view: MenuView, group: FileGroup): TemplateResult {
    const key = groupKey(group);
    const holdsMarked = group.files.some((file) => file.index === view.marked);
    const expanded = holdsMarked || !view.collapsed.has(key);
    return html `<div class="rp-group">
    <button
      type="button"
      class="rp-group-header"
      aria-expanded=${String(expanded)}
      title=${group.kind === 'series' && group.dir ? `${group.dir}\n${group.name}` : group.name}
      @click=${() => {
        if (!holdsMarked)
            view.onToggleGroup(key);
    }}
    >
      <span class="rp-chevron">${ICON_CHEVRON}</span>
      <span class="rp-group-text">
        <span class="rp-group-name">${group.name}</span>
        ${group.kind === 'series' && group.dir ? html `<span class="rp-group-dir">${group.dir}</span>` : nothing}
      </span>
      <span class="rp-group-count">${group.files.length}</span>
    </button>
    ${expanded ? html `<div class="rp-group-files">${rows(view, group)}</div>` : nothing}
  </div>`;
}
function rows(view: MenuView, group: FileGroup): TemplateResult {
    const dir = group.kind === 'single' ? group.dir : '';
    return html `<ul>
    ${group.files.map(({ index, label }) => {
        const file = view.torrent.files[index]!;
        const playing = index === view.marked;
        const have = view.stats?.file_progress[index];
        const downloaded = view.torrent.managed && have !== undefined && have >= file.length;
        return html `<li>
        <button
          type="button"
          class="rp-file ${playing ? 'is-playing' : ''}"
          aria-current=${playing ? 'true' : nothing}
          title=${filePath(file)}
          @click=${() => (playing ? view.onClose() : view.onPlay(index))}
        >
          <span class="rp-file-icon">${ICON_PLAY}</span>
          <span class="rp-file-label">${dir ? html `<span class="rp-file-dir">${dir}/</span>` : nothing}${label}</span>
          <span
            class="rp-file-downloaded"
            role=${downloaded ? 'img' : nothing}
            aria-label=${downloaded ? view.text.t('common.downloaded') : nothing}
            title=${downloaded ? view.text.t('common.downloaded') : nothing}
            >${downloaded ? ICON_DOWNLOADED : nothing}</span
          >
          <span class="rp-file-size">${formatBytes(file.length)}</span>
        </button>
      </li>`;
    })}
  </ul>`;
}
const ICON_CHEVRON = html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 6.5 5.5 5.5-5.5 5.5" /></svg>`;
const ICON_PLAY = html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>`;
const ICON_DOWNLOADED = html `<svg viewBox="0 0 512 512" fill="none" stroke-width="48" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M256 64v303M113 241l143 126 143-126" stroke="#699efa" /><path d="M64 448h384" stroke="#4d87db" /></svg>`;
