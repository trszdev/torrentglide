import { usePage } from './context.ts';
import { DropOverlay } from './DropOverlay.tsx';
import { Header } from './Header.tsx';
import { History } from './History.tsx';
import { PlayerHost } from './PlayerHost.tsx';
import { OpenDialog } from './dialogs/Open.tsx';
import { RemoveDialog } from './dialogs/Remove.tsx';
import { ReviewDialog } from './dialogs/Review.tsx';
import { SettingsDialog } from './dialogs/Settings.tsx';
export function App() {
    const { app } = usePage();
    const { t } = app.text;
    return (<>
      <div class="app">
        <Header />
        <main class="layout">
          <section class="main-column">
            <PlayerHost />
          </section>
          <aside class="side-column">
            <History />
            <div class="below-history">
              <button class="btn review-button" type="button" onClick={() => (app.dialog.value = 'review')}>
                {t('review.button')}
              </button>
            </div>
          </aside>
        </main>
      </div>
      <OpenDialog />
      <RemoveDialog />
      <SettingsDialog />
      <ReviewDialog />
      <DropOverlay />
    </>);
}
