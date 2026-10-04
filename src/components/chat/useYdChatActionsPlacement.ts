import { useLayoutEffect, useState } from 'react';
import { ydChatActionsPreferBelow } from './ydChatActionPlacement';

export function useYdChatActionsPlacement(activeMessageId: string | null) {
  const [preferBelow, setPreferBelow] = useState(false);

  useLayoutEffect(() => {
    if (!activeMessageId) {
      setPreferBelow(false);
      return;
    }
    const anchor = document.querySelector<HTMLElement>(
      `[data-yd-chat-anchor="${activeMessageId}"]`,
    );
    setPreferBelow(ydChatActionsPreferBelow(anchor));
  }, [activeMessageId]);

  return preferBelow;
}
