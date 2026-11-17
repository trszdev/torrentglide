export const STYLE = `
.rp-host {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  background: #000;
  color: #fff;
}
.rp-host > movi-player {
  display: block;
  width: 100%;
  height: 100%;
}

/* While the menu is up, movi's corner buttons and centre Play would paint
   over it; while a message is, its centre Play would cover the message. */
:host(.rp-menu-open) .movi-top-controls,
:host(.rp-menu-open) .movi-center-play-pause,
:host(.rp-has-message) .movi-center-play-pause {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
/* One spinner: ours. */
:host(.rp-busy) .movi-loading-indicator {
  visibility: hidden !important;
}

.rp-root {
  --u: calc(var(--rp-s, 1) * 1px);
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #fff;
  font: calc(13 * var(--u)) / 1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  text-align: left;
}
.rp-root *,
.rp-root *::before,
.rp-root *::after { box-sizing: border-box; }
.rp-root svg { display: block; width: 100%; height: 100%; }
.rp-root button { margin: 0; font: inherit; color: inherit; }
.rp-root ul { margin: 0; padding: 0; list-style: none; }
.rp-root p { margin: 0; }

/* Messages: empty player, busy, error. Above the menu, clicks pass by them. */
.rp-message {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(14 * var(--u));
  padding: calc(24 * var(--u));
  pointer-events: none;
  text-align: center;
  animation: rp-in 0.2s ease-out;
}
@keyframes rp-in { from { opacity: 0; } }
.rp-empty-title { color: rgba(255, 255, 255, 0.85); }
.rp-empty-hint { color: rgba(255, 255, 255, 0.5); font-size: calc(12 * var(--u)); }
.rp-spinner {
  flex: none;
  width: calc(34 * var(--u));
  height: calc(34 * var(--u));
  border: calc(3 * var(--u)) solid rgba(255, 255, 255, 0.18);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rp-spin 0.8s linear infinite;
}
@keyframes rp-spin { to { transform: rotate(360deg); } }
.rp-busy-text,
.rp-error {
  max-width: min(calc(520 * var(--u)), 100%);
  border-radius: calc(8 * var(--u));
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.92);
  overflow-wrap: anywhere;
  text-wrap: balance;
}
.rp-busy-text { padding: calc(6 * var(--u)) calc(12 * var(--u)); }
.rp-error-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: calc(34 * var(--u));
  height: calc(34 * var(--u));
  border: calc(3 * var(--u)) solid #ff6b6b;
  border-radius: 50%;
  color: #ff6b6b;
  font-weight: 700;
  font-size: calc(17 * var(--u));
  line-height: 1;
}
.rp-error {
  display: flex;
  align-items: flex-start;
  gap: calc(8 * var(--u));
  padding: calc(6 * var(--u)) calc(6 * var(--u)) calc(6 * var(--u)) calc(12 * var(--u));
  border: 1px solid rgba(255, 107, 107, 0.5);
  background: rgba(20, 0, 0, 0.78);
  pointer-events: auto;
  text-align: left;
}
.rp-error-text { flex: 1; padding: calc(2 * var(--u)) 0; }
.rp-icon-button {
  flex: none;
  width: calc(24 * var(--u));
  height: calc(24 * var(--u));
  padding: calc(5 * var(--u));
  border: 0;
  border-radius: calc(6 * var(--u));
  background: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}
.rp-icon-button:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }

/* The file menu (SPEC §6.3), in movi's theme. */
.rp-files {
  position: absolute;
  z-index: 1;
  right: calc(8 * var(--u));
  bottom: calc(var(--rp-controls-h, 0px) + 4 * var(--u));
  display: flex;
  flex-direction: column;
  width: min(calc(360 * var(--u)), calc(100% - 16 * var(--u)));
  max-height: calc(100% - var(--rp-controls-h, 0px) - 12 * var(--u));
  min-height: min(calc(120 * var(--u)), calc(100% - var(--rp-controls-h, 0px) - 12 * var(--u)));
  overflow: hidden;
  border: 1px solid var(--movi-glass-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--movi-radius-surface, calc(10 * var(--u)));
  background: var(--movi-glass-bg, rgba(16, 16, 20, 0.92));
  backdrop-filter: blur(var(--movi-glass-blur, 20px));
  pointer-events: auto;
  animation: rp-files-in 0.16s ease-out;
}
@keyframes rp-files-in { from { opacity: 0; transform: translateX(calc(12 * var(--u))); } }
/* Pinned while nothing plays: the whole player, still above the control bar. */
.rp-files.is-pinned {
  top: calc(8 * var(--u));
  left: calc(8 * var(--u));
  width: auto;
  max-height: none;
  animation: none;
}
.rp-root.is-bare .rp-files { bottom: calc(8 * var(--u)); }

.rp-files-header {
  display: flex;
  align-items: flex-start;
  gap: calc(8 * var(--u));
  padding: calc(12 * var(--u)) calc(8 * var(--u)) calc(10 * var(--u)) calc(14 * var(--u));
  border-bottom: 1px solid var(--movi-glass-border, rgba(255, 255, 255, 0.1));
}
.rp-files-heading { flex: 1; min-width: 0; }
.rp-files-title {
  margin: 0;
  overflow: hidden;
  font-size: calc(13 * var(--u));
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rp-files-meta,
.rp-files-hint {
  color: var(--movi-text-tertiary, rgba(255, 255, 255, 0.5));
  font-size: calc(12 * var(--u));
  font-variant-numeric: tabular-nums;
}
.rp-files-meta { margin-top: calc(2 * var(--u)) !important; }
.rp-files-hint { margin-top: calc(4 * var(--u)) !important; color: var(--movi-text-secondary, rgba(255, 255, 255, 0.7)); }
.rp-files-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: calc(6 * var(--u));
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
}
.rp-files-body > * + * { margin-top: calc(2 * var(--u)); }
.rp-files-empty { padding: calc(10 * var(--u)) calc(8 * var(--u)); color: var(--movi-text-secondary, rgba(255, 255, 255, 0.7)); }

.rp-group-header,
.rp-file {
  display: flex;
  align-items: center;
  gap: calc(8 * var(--u));
  width: 100%;
  padding: calc(6 * var(--u)) calc(8 * var(--u));
  border: 0;
  border-radius: var(--movi-radius-row, calc(7 * var(--u)));
  background: none;
  text-align: left;
  cursor: pointer;
}
.rp-group-header:hover,
.rp-file:hover { background: rgba(255, 255, 255, 0.08); }
.rp-group-header:focus-visible,
.rp-file:focus-visible,
.rp-icon-button:focus-visible {
  outline: 2px solid var(--movi-primary, #7c75ff);
  outline-offset: -2px;
}
.rp-chevron {
  flex: none;
  width: calc(14 * var(--u));
  height: calc(14 * var(--u));
  color: var(--movi-text-tertiary, rgba(255, 255, 255, 0.5));
  transition: transform 0.15s ease;
}
.rp-group-header[aria-expanded='true'] .rp-chevron { transform: rotate(90deg); }
.rp-group-text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.rp-group-name,
.rp-group-dir,
.rp-file-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rp-group-name { font-weight: 600; }
.rp-group-dir,
.rp-file-dir { color: var(--movi-text-tertiary, rgba(255, 255, 255, 0.5)); }
.rp-group-dir { font-size: calc(11 * var(--u)); }
.rp-group-count {
  flex: none;
  padding: 0 calc(6 * var(--u));
  border-radius: var(--movi-radius-badge, calc(4 * var(--u)));
  background: rgba(255, 255, 255, 0.08);
  color: var(--movi-text-secondary, rgba(255, 255, 255, 0.7));
  font-size: calc(11 * var(--u));
  font-variant-numeric: tabular-nums;
}
.rp-group-files { padding-left: calc(14 * var(--u)) !important; }
.rp-file { gap: calc(10 * var(--u)); }
.rp-file-icon {
  flex: none;
  width: calc(12 * var(--u));
  height: calc(12 * var(--u));
  color: var(--movi-text-tertiary, rgba(255, 255, 255, 0.5));
}
.rp-file:hover .rp-file-icon { color: #fff; }
.rp-file-label { flex: 1; min-width: 0; }
.rp-file.is-playing { background: color-mix(in srgb, var(--movi-primary, #7c75ff) 24%, transparent); }
.rp-file.is-playing .rp-file-icon { color: var(--movi-primary-light, #a39eff); }
.rp-file.is-playing .rp-file-icon path { fill: currentColor; }
.rp-file-downloaded { flex: none; width: calc(16 * var(--u)); height: calc(16 * var(--u)); }
.rp-file-size {
  flex: none;
  min-width: calc(52 * var(--u));
  color: var(--movi-text-tertiary, rgba(255, 255, 255, 0.5));
  font-size: calc(12 * var(--u));
  font-variant-numeric: tabular-nums;
  text-align: right;
}
`;
