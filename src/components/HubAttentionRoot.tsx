import { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  HubAttentionContext,
  defaultHubAttention,
  type HubAttentionValue,
} from '../contexts/hubAttentionContext';

const HubAttentionLoader = lazy(() => import('./HubAttentionLoader'));

export function HubAttentionRoot({
  userId,
  publicBoardOptedIn,
  children,
}: {
  userId?: string;
  publicBoardOptedIn: boolean;
  children: ReactNode;
}) {
  const [value, setValue] = useState<HubAttentionValue>(defaultHubAttention);
  return (
    <HubAttentionContext.Provider value={value}>
      <Suspense fallback={null}>
        <HubAttentionLoader
          userId={userId}
          publicBoardOptedIn={publicBoardOptedIn}
          onValue={setValue}
        />
      </Suspense>
      {children}
    </HubAttentionContext.Provider>
  );
}
