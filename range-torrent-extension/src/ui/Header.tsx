import { browser } from 'wxt/browser';
import logoUrl from '../../assets/icon.svg?url';
import { hostOf, hostPermissionFor, isLocalAddress } from '../services/permissions.ts';
import { usePage } from './context.ts';
import { MaskIcon } from './icons.tsx';
export function Header() {
    const { app } = usePage();
    const { t } = app.text;
    return (<header class="ext-header">
      <img class="ext-logo" src={logoUrl} alt=""/>
      <div class="ext-heading">
        <div class="ext-title-row">
          <h1 class="ext-title">TorrentGlide</h1>
          <RqbitStatus />
          {app.inIncognito && (<span class="mask ext-mask" role="img" aria-label={t('incognito.header')} title={t('incognito.header')}>
              <MaskIcon />
            </span>)}
        </div>
        <p class="ext-tagline">{t('page.tagline')}</p>
      </div>
    </header>);
}
function RqbitStatus() {
    const { app, client } = usePage();
    const { t } = app.text;
    const status = app.status.value;
    const url = client.baseUrl;
    const host = hostOf(url);
    let label: string;
    let problem: string | null = null;
    let action: 'allow' | null = null;
    switch (status.kind) {
        case 'connecting':
            label = t('rqbit.connecting', { url });
            break;
        case 'running':
            label = t('rqbit.running', { version: status.version, url });
            break;
        case 'not-allowed':
            label = problem = t('rqbit.notAllowed', { host });
            action = 'allow';
            break;
        case 'not-answering':
            label = status.error;
            problem = isLocalAddress(url) ? t('rqbit.notRunning') : t('rqbit.notAnswering', { host });
            action = null;
            break;
    }
    const allow = () => {
        void browser.permissions.request({ origins: [hostPermissionFor(url)] }).then((granted) => {
            if (granted)
                location.reload();
        });
    };
    return (<div id="rqbit-status" class="ext-rqbit" data-state={status.kind}>
      <span class="ext-rqbit-dot" role="img" aria-label={label} title={label}/>
      {problem && <span class="ext-rqbit-text">{problem}</span>}
      {action === 'allow' && (<button class="btn btn-small" type="button" onClick={allow}>
          {t('rqbit.allow')}
        </button>)}
    </div>);
}
