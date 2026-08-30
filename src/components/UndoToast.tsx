import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  verb?: string;
  onUndo: () => void;
  onGone: () => void;
}

export default function UndoToast({ title, verb = 'Deleted', onUndo, onGone }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onGone, 4200);
    return () => window.clearTimeout(id);
  }, [onGone]);

  return createPortal(
    <div className="fixed inset-x-4 bottom-[5.25rem] z-[1200] max-w-md mx-auto pointer-events-none fade-in">
      <div className="pointer-events-auto flex items-center gap-3 rounded-[12px] bg-elevated border border-subtle shadow-elevated px-3.5 py-2.5">
        <p className="flex-1 min-w-0 text-[13px] font-medium text-content-primary truncate">
          {verb ? `${verb} ` : ''}{title}
        </p>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 text-[12px] font-semibold text-primary px-2 py-1 rounded-lg hover:bg-primary-soft"
        >
          Undo
        </button>
      </div>
    </div>,
    document.body,
  );
}
