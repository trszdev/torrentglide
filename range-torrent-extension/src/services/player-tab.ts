import { parkOpenRequest, type OpenRequest } from './open-request.ts';
import type { StorageArea } from './storage.ts';
export interface SenderTab {
    id?: number;
    index: number;
    windowId: number;
}
export interface TabsApi {
    create(props: {
        url: string;
        windowId?: number;
        index?: number;
        openerTabId?: number;
    }): Promise<unknown>;
}
export async function openPlayerTab({ request, from, session, tabs, playerUrl, }: {
    request: OpenRequest | null;
    from: SenderTab | undefined;
    session: StorageArea;
    tabs: TabsApi;
    playerUrl: string;
}): Promise<void> {
    const url = request ? `${playerUrl}?open=${await parkOpenRequest(session, request)}` : playerUrl;
    await tabs.create(from ? { url, windowId: from.windowId, index: from.index + 1, openerTabId: from.id } : { url });
}
