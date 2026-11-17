import type { OpenRequest } from './open-request.ts';
import type { SenderTab } from './player-tab.ts';
export const MENU_ID = 'open-link';
export interface MenusApi {
    update(id: string, props: {
        title: string;
    }): Promise<unknown>;
    create(props: {
        id: string;
        title: string;
        contexts: [
            'link'
        ];
    }): unknown;
}
export function createMenuUpdater(menus: MenusApi, title: () => Promise<string>): () => Promise<void> {
    let queue: Promise<void> = Promise.resolve();
    return () => {
        const run = queue.then(async () => {
            const text = await title();
            try {
                await menus.update(MENU_ID, { title: text });
            }
            catch {
                await menus.create({ id: MENU_ID, title: text, contexts: ['link'] });
            }
        });
        queue = run.catch(() => { });
        return run;
    };
}
export async function openLinkFromMenu({ url, tab, frameId, askContentScript, openPlayer, answerWithinMs = 2000, }: {
    url: string;
    tab: SenderTab | undefined;
    frameId: number | undefined;
    askContentScript(tabId: number, frameId: number, url: string): Promise<{
        accepted: true;
    } | undefined>;
    openPlayer(request: OpenRequest, from: SenderTab | undefined): Promise<void>;
    answerWithinMs?: number;
}): Promise<void> {
    if (!/^magnet:/i.test(url) && tab?.id !== undefined) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), answerWithinMs)));
        try {
            const answer = await Promise.race([askContentScript(tab.id, frameId ?? 0, url), timeout]);
            if (answer?.accepted)
                return;
        }
        catch {
        }
        finally {
            clearTimeout(timer);
        }
    }
    await openPlayer({ kind: 'text', text: url }, tab);
}
