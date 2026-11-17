import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { EMAIL_UP_TO, REVIEW_EMAIL, reviewMailto, storeReviewUrl } from '../../services/review.ts';
import { usePage } from '../context.ts';
import { Dialog } from '../Dialog.tsx';
type Store = {
    text: string;
    copied: boolean;
};
export function ReviewDialog() {
    const { app } = usePage();
    const [store, setStore] = useState<Store | null>(null);
    const close = () => {
        setStore(null);
        app.dialog.value = null;
    };
    return (<>
      <Dialog open={app.dialog.value === 'review'} onClose={close} labelledBy="review-title">
        <ReviewForm toStore={setStore}/>
      </Dialog>
      <Dialog open={!!store} onClose={() => setStore(null)} labelledBy="review-store-title">
        {store && <StoreBody store={store} onCancel={() => setStore(null)} onDone={close}/>}
      </Dialog>
    </>);
}
function ReviewForm({ toStore }: {
    toStore: (store: Store) => void;
}) {
    const { app } = usePage();
    const { t } = app.text;
    const [rating, setRating] = useState(0);
    const [pointed, setPointed] = useState(0);
    const [message, setMessage] = useState('');
    const [thanked, setThanked] = useState(false);
    const close = () => (app.dialog.value = null);
    const send = async (event: SubmitEvent) => {
        event.preventDefault();
        if (!rating)
            return;
        const text = message.trim();
        if (rating > EMAIL_UP_TO) {
            let copied = false;
            if (text) {
                try {
                    await navigator.clipboard.writeText(text);
                    copied = true;
                }
                catch {
                }
            }
            toStore({ text, copied });
            return;
        }
        const context = { version: browser.runtime.getManifest().version, browser: import.meta.env.BROWSER };
        Object.assign(document.createElement('a'), { href: reviewMailto(rating, text, context) }).click();
        setThanked(true);
    };
    if (thanked) {
        return (<div class="rp-dialog-body">
        <h2 id="review-title" class="rp-dialog-title">
          {t('review.thanksTitle')}
        </h2>
        <p>{t('review.thanksEmail', { email: REVIEW_EMAIL })}</p>
        <div class="rp-dialog-actions">
          <button class="btn btn-primary" type="button" onClick={close}>
            {t('common.close')}
          </button>
        </div>
      </div>);
    }
    const lit = pointed || rating;
    return (<form method="dialog" onSubmit={(event) => void send(event)}>
      <h2 id="review-title" class="rp-dialog-title">
        {t('review.title')}
      </h2>
      <fieldset class="review-stars">
        <legend class="rp-field-label">{t('review.question')}</legend>
        <div class="review-star-row">
          {[1, 2, 3, 4, 5].map((n) => (<label key={n} class={n <= lit ? 'review-star is-lit' : 'review-star'} onPointerEnter={() => setPointed(n)} onPointerLeave={() => setPointed(0)}>
              <input class="visually-hidden" type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)}/>
              <span class="visually-hidden">{t('review.stars', { n })}</span>
            </label>))}
        </div>
      </fieldset>
      <label class="rp-field">
        <span class="rp-field-label">{t('review.message')}</span>
        <textarea class="text-input review-message" name="message" rows={4} placeholder={t('review.placeholder')} value={message} onInput={(event) => setMessage(event.currentTarget.value)}/>
      </label>
      <div class="rp-dialog-actions">
        <button class="btn" type="button" onClick={close}>
          {t('common.cancel')}
        </button>
        <button class="btn btn-primary" type="submit" disabled={!rating}>
          {t('review.send')}
        </button>
      </div>
    </form>);
}
function StoreBody({ store, onCancel, onDone }: {
    store: Store;
    onCancel: () => void;
    onDone: () => void;
}) {
    const { app } = usePage();
    const { t } = app.text;
    const { text, copied } = store;
    const openStore = () => {
        void browser.tabs.create({ url: storeReviewUrl(import.meta.env.BROWSER, browser.runtime.id) });
        onDone();
    };
    return (<div class="rp-dialog-body">
      <h2 id="review-store-title" class="rp-dialog-title">
        {t(text && copied ? 'review.copiedTitle' : 'review.storeTitle')}
      </h2>
      <p>{!text ? t('review.noMessage') : copied ? t('review.copied') : t('review.copyFailed')}</p>
      {text && !copied && <textarea class="text-input review-message" rows={4} readOnly value={text}/>}
      <div class="rp-dialog-actions">
        <button class="btn" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button class="btn btn-primary" type="button" onClick={openStore}>
          {t('review.openStore')}
        </button>
      </div>
    </div>);
}
