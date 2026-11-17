import { defineExtensionMessaging } from '@webext-core/messaging';
import type { OpenRequest } from './open-request.ts';
export type OpenReply = {
    ok: true;
} | {
    ok: false;
    error: string;
};
export interface ProtocolMap {
    openPlayer(request: OpenRequest): OpenReply;
    openLink(url: string): {
        accepted: true;
    };
}
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
