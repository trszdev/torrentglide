import { useState } from 'preact/hooks';
import { LANGUAGES, languageName, type Language } from 'range-player/core';
import { browser } from 'wxt/browser';
import type { ExtensionText } from '../../i18n.ts';
import { hostOf } from '../../services/permissions.ts';
import { DEFAULT_RQBIT_URL, rqbitUrlFromField, RqbitUrlError, saveOutcome, saveSettings, THEMES, type LanguageSetting, type Settings, type Theme, } from '../../services/settings.ts';
import { usePage } from '../context.ts';
import { Dialog } from '../Dialog.tsx';
import { applyTheme } from '../theme.ts';
const THEME_LABELS = { system: 'settings.themeSystem', light: 'settings.themeLight', dark: 'settings.themeDark' } as const;
export function SettingsDialog() {
    const { app, settings } = usePage();
    const close = () => {
        app.dialog.value = null;
        applyTheme(settings.peek().theme);
    };
    return (<Dialog open={app.dialog.value === 'settings'} onClose={close} labelledBy="settings-title">
      <SettingsForm />
    </Dialog>);
}
function SettingsForm() {
    const { app, client, settings, local, browserLanguage } = usePage();
    const { t } = app.text;
    const saved: Settings = { ...settings.peek(), rqbitUrl: client.baseUrl };
    const [url, setUrl] = useState(saved.rqbitUrl);
    const [theme, setTheme] = useState<Theme>(saved.theme);
    const [language, setLanguage] = useState<LanguageSetting>(saved.language);
    const [error, setError] = useState<string | null>(null);
    const submit = (event: SubmitEvent) => {
        event.preventDefault();
        let rqbitUrl: string;
        try {
            rqbitUrl = rqbitUrlFromField(url);
        }
        catch (err) {
            setError(urlErrorText(t, err));
            return;
        }
        const next: Settings = { rqbitUrl, theme, language };
        const outcome = saveOutcome(saved, next);
        settings.value = { ...settings.peek(), theme };
        if (outcome.kind === 'reopen') {
            const asked = browser.permissions.request({ origins: [outcome.permission] });
            void saveSettings(local, { theme });
            void asked.then(async (granted) => {
                if (!granted) {
                    setError(t('settings.needsPermission', { host: hostOf(rqbitUrl) }));
                    return;
                }
                await saveSettings(local, next);
                location.replace(location.pathname);
            });
            return;
        }
        if (outcome.kind === 'reload') {
            void saveSettings(local, { theme, language }).then(() => location.reload());
            return;
        }
        void saveSettings(local, { theme }).then(() => (app.dialog.value = null));
    };
    return (<form method="dialog" autocomplete="off" onSubmit={submit}>
      <h2 id="settings-title" class="rp-dialog-title">
        {t('settings.title')}
      </h2>
      <label class="rp-field">
        <span class="rp-field-label">{t('settings.endpoint')}</span>
        <input class="text-input" name="rqbit-url" type="text" spellcheck={false} placeholder={DEFAULT_RQBIT_URL} value={url} onInput={(event) => setUrl(event.currentTarget.value)} autofocus/>
      </label>
      <p class="hint">{t('settings.endpointHint')}</p>
      <label class="rp-field">
        <span class="rp-field-label">{t('settings.theme')}</span>
        <select class="text-input" name="theme" value={theme} onChange={(event) => {
            const picked = event.currentTarget.value as Theme;
            setTheme(picked);
            applyTheme(picked);
        }}>
          {THEMES.map((value) => (<option key={value} value={value}>
              {t(THEME_LABELS[value])}
            </option>))}
        </select>
      </label>
      <label class="rp-field">
        <span class="rp-field-label">{t('settings.language')}</span>
        <select class="text-input" name="language" value={language} onChange={(event) => setLanguage(event.currentTarget.value as LanguageSetting)}>
          <option value="auto">{t('settings.languageAuto', { language: languageName(browserLanguage) })}</option>
          {LANGUAGES.map(({ code, name }: {
            code: Language;
            name: string;
        }) => (<option key={code} value={code} lang={code}>
              {name}
            </option>))}
        </select>
      </label>
      {error && (<p class="rp-dialog-error" role="alert">
          {error}
        </p>)}
      <div class="rp-dialog-actions">
        <button class="btn" type="button" onClick={() => (app.dialog.value = null)}>
          {t('common.cancel')}
        </button>
        <button class="btn btn-primary" type="submit">
          {t('settings.save')}
        </button>
      </div>
    </form>);
}
function urlErrorText(t: ExtensionText['t'], err: unknown): string {
    if (!(err instanceof RqbitUrlError))
        return String(err);
    if (err.code === 'empty')
        return t('url.empty');
    if (err.code === 'invalid')
        return t('url.invalid', { value: err.detail });
    return t('url.notHttp');
}
