import { useEffect } from 'react';
import { useHubAttention } from '../hooks/useHubAttention';
import type { HubAttentionValue } from '../contexts/hubAttentionContext';

export default function HubAttentionLoader({
  userId,
  publicBoardOptedIn,
  onValue,
}: {
  userId?: string;
  publicBoardOptedIn: boolean;
  onValue: (value: HubAttentionValue) => void;
}) {
  const value = useHubAttention(userId, publicBoardOptedIn);
  useEffect(() => {
    onValue(value);
  }, [value, onValue]);
  return null;
}
