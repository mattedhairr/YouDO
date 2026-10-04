import { createContext, useContext } from 'react';

const noop = () => {};

export type HubAttentionValue = {
  privatePending: number;
  dmUnread: number;
  roomsOutgoingPending: number;
  squadChatUnread: boolean;
  communityUnread: number;
  privateHubAttention: boolean;
  dmsTabAttention: boolean;
  roomsTabAttention: boolean;
  showHubNavDot: boolean;
  refreshPrivate: () => void;
  refreshDmInbox: () => void;
  refreshSquadChat: () => void;
  refreshCommunity: () => void;
  refreshAll: () => void;
};

export const defaultHubAttention: HubAttentionValue = {
  privatePending: 0,
  dmUnread: 0,
  roomsOutgoingPending: 0,
  squadChatUnread: false,
  communityUnread: 0,
  privateHubAttention: false,
  dmsTabAttention: false,
  roomsTabAttention: false,
  showHubNavDot: false,
  refreshPrivate: noop,
  refreshDmInbox: noop,
  refreshSquadChat: noop,
  refreshCommunity: noop,
  refreshAll: noop,
};

export const HubAttentionContext = createContext<HubAttentionValue>(defaultHubAttention);

export function useHubAttentionContext() {
  return useContext(HubAttentionContext);
}
