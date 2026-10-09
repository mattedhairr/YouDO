import { useRef, useCallback } from 'react';
import type { PointerEvent, MouseEvent, KeyboardEvent } from 'react';
import { hapticTick } from '../../lib/haptics';

export interface UseChatMessageGesturesOptions<T> {
  onOpenActions: (item: T) => void;
  onDoubleTapReply?: (item: T) => void;
  longPressMs?: number;
  doubleTapMs?: number;
}

export interface ChatMessageGestureController<T extends { id: string }> {
  onPointerDown: (event: PointerEvent<HTMLElement>, item: T) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>, item: T) => void;
  onPointerCancel: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, item: T) => void;
  onDoubleClick: (event: MouseEvent<HTMLElement>, item: T) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, item: T) => void;
  getMessageProps: (item: T) => {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onContextMenu: (e: MouseEvent<HTMLElement>) => void;
    onDoubleClick: (e: MouseEvent<HTMLElement>) => void;
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  };
  cancelPress: () => void;
}

/**
 * Pure interaction controller for chat message gestures.
 * Handles primary pointer long-press (450ms), double-tap quick reply,
 * desktop context menu, keyboard triggers, and mobile contextmenu suppression.
 */
export function createChatMessageGestureController<T extends { id: string }>(
  options: UseChatMessageGesturesOptions<T>
): ChatMessageGestureController<T> {
  const longPressMs = options.longPressMs ?? 450;
  const doubleTapMs = options.doubleTapMs ?? 320;

  let pressTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let activePress: {
    id: string;
    pointerId?: number;
    startX: number;
    startY: number;
    triggered: boolean;
  } | null = null;
  let lastTap: { id: string; at: number; x: number; y: number } | null = null;
  let lastTriggeredAt: { id: string; at: number } | null = null;

  const cancelPress = () => {
    if (pressTimer !== undefined) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>, item: T) => {
    // Only primary button and ignore clicks on inner links/buttons/inputs
    if (
      event.button !== 0 ||
      (event.target as HTMLElement | undefined)?.closest?.('button, input, textarea, a')
    ) {
      return;
    }

    // If another pointer is already active (e.g. multi-touch / pinch), cancel to prevent gesture fighting
    if (activePress && activePress.pointerId !== undefined && activePress.pointerId !== event.pointerId) {
      cancelPress();
      activePress = null;
      return;
    }

    cancelPress();
    activePress = {
      id: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      triggered: false,
    };

    pressTimer = setTimeout(() => {
      if (activePress?.id === item.id) {
        activePress.triggered = true;
        lastTriggeredAt = { id: item.id, at: Date.now() };
        hapticTick();
        options.onOpenActions(item);
      }
    }, longPressMs);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!activePress) return;
    if (
      event.pointerId !== undefined &&
      activePress.pointerId !== undefined &&
      event.pointerId !== activePress.pointerId
    ) {
      return;
    }

    const dx = event.clientX - activePress.startX;
    const dy = event.clientY - activePress.startY;
    if (Math.hypot(dx, dy) > 9) {
      cancelPress();
      activePress = null;
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>, item: T) => {
    const current = activePress;
    cancelPress();
    activePress = null;

    if (!current || current.id !== item.id) return;
    if (
      event.pointerId !== undefined &&
      current.pointerId !== undefined &&
      event.pointerId !== current.pointerId
    ) {
      return;
    }

    // If long press already triggered, suppress tap / reply
    if (current.triggered) return;

    // Movement cancellation threshold
    if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 9) {
      return;
    }

    // Touch double-tap check
    if (event.pointerType === 'touch' && options.onDoubleTapReply) {
      const now = Date.now();
      const prev = lastTap;
      if (
        prev &&
        prev.id === item.id &&
        now - prev.at <= doubleTapMs &&
        Math.hypot(event.clientX - prev.x, event.clientY - prev.y) <= 48
      ) {
        lastTap = null;
        hapticTick();
        options.onDoubleTapReply(item);
      } else {
        lastTap = { id: item.id, at: now, x: event.clientX, y: event.clientY };
      }
    }
  };

  const onPointerCancel = () => {
    cancelPress();
    activePress = null;
  };

  const onContextMenu = (event: MouseEvent<HTMLElement>, item: T) => {
    if ((event.target as HTMLElement | undefined)?.closest?.('button, input, textarea, a')) return;
    event.preventDefault();
    cancelPress();

    // Suppress duplicate invocation on mobile devices where browser fires contextmenu ~500ms after touchstart
    const now = Date.now();
    if (
      lastTriggeredAt &&
      lastTriggeredAt.id === item.id &&
      now - lastTriggeredAt.at < 650
    ) {
      return;
    }

    activePress = null;
    lastTriggeredAt = { id: item.id, at: now };
    hapticTick();
    options.onOpenActions(item);
  };

  const onDoubleClick = (event: MouseEvent<HTMLElement>, item: T) => {
    if ((event.target as HTMLElement | undefined)?.closest?.('button, input, textarea, a')) return;
    if (options.onDoubleTapReply) {
      cancelPress();
      activePress = null;
      hapticTick();
      options.onDoubleTapReply(item);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, item: T) => {
    if (event.target !== event.currentTarget) return;
    if (
      event.key === 'Enter' ||
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10')
    ) {
      event.preventDefault();
      cancelPress();
      activePress = null;
      hapticTick();
      options.onOpenActions(item);
    }
  };

  const getMessageProps = (item: T) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(e, item),
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLElement>) => onPointerUp(e, item),
    onPointerCancel,
    onContextMenu: (e: MouseEvent<HTMLElement>) => onContextMenu(e, item),
    onDoubleClick: (e: MouseEvent<HTMLElement>) => onDoubleClick(e, item),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, item),
  });

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
    onDoubleClick,
    onKeyDown,
    getMessageProps,
    cancelPress,
  };
}

export function useChatMessageGestures<T extends { id: string }>(
  options: UseChatMessageGesturesOptions<T>
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const controllerRef = useRef<ChatMessageGestureController<T> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createChatMessageGestureController<T>({
      onOpenActions: (item) => optionsRef.current.onOpenActions(item),
      onDoubleTapReply: (item) => optionsRef.current.onDoubleTapReply?.(item),
      longPressMs: options.longPressMs,
      doubleTapMs: options.doubleTapMs,
    });
  }

  const getMessageProps = useCallback(
    (item: T) => controllerRef.current!.getMessageProps(item),
    []
  );

  const cancelPress = useCallback(
    () => controllerRef.current!.cancelPress(),
    []
  );

  return {
    getMessageProps,
    cancelPress,
  };
}
