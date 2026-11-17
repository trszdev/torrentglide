import type { ComponentChildren } from 'preact';
function Icon({ children }: {
    children: ComponentChildren;
}) {
    return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>);
}
export const PlusIcon = () => (<Icon>
    <path d="M12 5v14M5 12h14"/>
  </Icon>);
export const RemoveIcon = () => (<Icon>
    <path d="m6.5 6.5 11 11m0-11-11 11"/>
  </Icon>);
export const UploadIcon = () => (<Icon>
    <path d="M12 15V4"/>
    <path d="m7 9 5-5 5 5"/>
    <path d="M5 20h14"/>
  </Icon>);
export const SettingsIcon = () => (<Icon>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </Icon>);
export const DownloadedIcon = () => (<svg viewBox="0 0 512 512" fill="none" stroke-width="48" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M256 64v303M113 241l143 126 143-126" stroke="#699efa"/>
    <path d="M64 448h384" stroke="#4d87db"/>
  </svg>);
export const MaskIcon = () => (<svg viewBox="0 0 36 24" fill="currentColor" aria-hidden="true">
    <path fill-rule="evenodd" d="M2 5C8 1.5 14 3 18 6.5 22 3 28 1.5 34 5c1.2 8.5-2.8 16-9.5 16-3 0-5.2-2.6-6.5-5-1.3 2.4-3.5 5-6.5 5C4.8 21 .8 13.5 2 5Zm5.5 6.5a4 2.6 0 1 0 8 0 4 2.6 0 1 0-8 0Zm13 0a4 2.6 0 1 0 8 0 4 2.6 0 1 0-8 0Z"/>
  </svg>);
