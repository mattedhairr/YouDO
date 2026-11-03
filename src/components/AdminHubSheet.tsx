import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchCommunityContext, type CommunityContext } from '../lib/community';
import Overlay from './Overlay';
import CommunitySheet from './CommunitySheet';

/**
 * The Admin Hub, opened by holding the Settings button or from Settings → Admin Hub.
 * It waits for the admin context so it never flashes "admin access is not available".
 */
export default function AdminHubSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [context, setContext] = useState<CommunityContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCommunityContext(userId).then((next) => { if (!cancelled) setContext(next); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!context) {
    return (
      <Overlay open onClose={onClose} align="full" screen>
        <div role="status" className="app-frame mx-auto flex h-full w-full max-w-md items-center justify-center gap-2 bg-base text-[12px] text-content-muted">
          <Loader2 size={16} className="animate-spin text-primary" /> Opening Admin Hub…
        </div>
      </Overlay>
    );
  }

  return (
    <CommunitySheet
      open
      startInAdmin
      onClose={onClose}
      userId={userId}
      rows={[]}
      initialContext={context}
      onOpenBoardSettings={onClose}
    />
  );
}
