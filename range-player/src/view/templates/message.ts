import { html, nothing, type TemplateResult } from 'lit-html';
export type MessageView = {
    kind: 'empty';
    title: string;
    hint?: string;
} | {
    kind: 'busy';
    text: string;
} | {
    kind: 'error';
    text: string;
    closeLabel: string;
    onClose: () => void;
};
export function messageTemplate(view: MessageView | null): TemplateResult | typeof nothing {
    if (!view)
        return nothing;
    switch (view.kind) {
        case 'empty':
            return html `<div class="rp-message rp-empty">
        <p class="rp-empty-title">${view.title}</p>
        ${view.hint ? html `<p class="rp-empty-hint">${view.hint}</p>` : nothing}
      </div>`;
        case 'busy':
            return html `<div class="rp-message">
        <span class="rp-spinner" aria-hidden="true"></span>
        <p class="rp-busy-text" role="status" aria-live="polite">${view.text}</p>
      </div>`;
        case 'error':
            return html `<div class="rp-message">
        <span class="rp-error-icon" aria-hidden="true">!</span>
        <div class="rp-error" role="alert">
          <p class="rp-error-text">${view.text}</p>
          <button type="button" class="rp-icon-button" aria-label=${view.closeLabel} title=${view.closeLabel} @click=${view.onClose}>
            ${ICON_CLOSE}
          </button>
        </div>
      </div>`;
    }
}
export const ICON_CLOSE = html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6.5 6.5 11 11m0-11-11 11" /></svg>`;
