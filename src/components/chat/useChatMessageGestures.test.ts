import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createChatMessageGestureController,
  useChatMessageGestures,
} from './useChatMessageGestures';

if (typeof window === 'undefined') {
  (global as unknown as Record<string, unknown>).window = global;
}

vi.mock('../../lib/haptics', () => ({
  hapticTick: vi.fn(),
  hapticWarn: vi.fn(),
}));

describe('useChatMessageGestures and gesture controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports useChatMessageGestures hook and createChatMessageGestureController factory', () => {
    expect(typeof useChatMessageGestures).toBe('function');
    expect(typeof createChatMessageGestureController).toBe('function');
  });

  it('triggers onOpenActions after long press duration (450ms)', () => {
    const onOpenActions = vi.fn();
    const controller = createChatMessageGestureController({ onOpenActions });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    props.onPointerDown({ button: 0, clientX: 100, clientY: 100 } as any);
    expect(onOpenActions).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);
    expect(onOpenActions).toHaveBeenCalledWith(message);
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });

  it('cancels long press if pointer moves > 9px (scrolling)', () => {
    const onOpenActions = vi.fn();
    const controller = createChatMessageGestureController({ onOpenActions });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    props.onPointerDown({ button: 0, clientX: 100, clientY: 100 } as any);
    // Simulate user scroll drag of 20px
    props.onPointerMove({ clientX: 100, clientY: 120 } as any);

    vi.advanceTimersByTime(500);
    expect(onOpenActions).not.toHaveBeenCalled();
  });

  it('does NOT trigger tap/reply on pointer up if long press already opened actions', () => {
    const onOpenActions = vi.fn();
    const onDoubleTapReply = vi.fn();
    const controller = createChatMessageGestureController({
      onOpenActions,
      onDoubleTapReply,
    });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    props.onPointerDown({ button: 0, clientX: 100, clientY: 100 } as any);
    vi.advanceTimersByTime(450);
    expect(onOpenActions).toHaveBeenCalledWith(message);

    // Release finger after hold
    props.onPointerUp({ pointerType: 'touch', clientX: 100, clientY: 100 } as any);
    // Must NOT trigger quick reply
    expect(onDoubleTapReply).not.toHaveBeenCalled();
  });

  it('triggers onDoubleTapReply on rapid double tap on touch within spatial threshold', () => {
    const onOpenActions = vi.fn();
    const onDoubleTapReply = vi.fn();
    const controller = createChatMessageGestureController({
      onOpenActions,
      onDoubleTapReply,
    });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    // Tap 1
    props.onPointerDown({ button: 0, clientX: 50, clientY: 50 } as any);
    vi.advanceTimersByTime(50);
    props.onPointerUp({ pointerType: 'touch', clientX: 50, clientY: 50 } as any);
    expect(onDoubleTapReply).not.toHaveBeenCalled();

    // Tap 2 within 200ms and 5px distance
    vi.advanceTimersByTime(150);
    props.onPointerDown({ button: 0, clientX: 53, clientY: 52 } as any);
    vi.advanceTimersByTime(50);
    props.onPointerUp({ pointerType: 'touch', clientX: 53, clientY: 52 } as any);

    expect(onDoubleTapReply).toHaveBeenCalledWith(message);
  });

  it('ignores double tap if taps are too far apart (> 48px)', () => {
    const onOpenActions = vi.fn();
    const onDoubleTapReply = vi.fn();
    const controller = createChatMessageGestureController({
      onOpenActions,
      onDoubleTapReply,
    });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    // Tap 1 at (50, 50)
    props.onPointerDown({ button: 0, clientX: 50, clientY: 50 } as any);
    vi.advanceTimersByTime(50);
    props.onPointerUp({ pointerType: 'touch', clientX: 50, clientY: 50 } as any);

    // Tap 2 at (150, 150) -> dist ~141px
    vi.advanceTimersByTime(150);
    props.onPointerDown({ button: 0, clientX: 150, clientY: 150 } as any);
    vi.advanceTimersByTime(50);
    props.onPointerUp({ pointerType: 'touch', clientX: 150, clientY: 150 } as any);

    expect(onDoubleTapReply).not.toHaveBeenCalled();
  });

  it('suppresses duplicate onOpenActions call from mobile native contextmenu after long press', () => {
    const onOpenActions = vi.fn();
    const controller = createChatMessageGestureController({ onOpenActions });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    // Touch down and hold
    props.onPointerDown({ button: 0, clientX: 100, clientY: 100 } as any);
    vi.advanceTimersByTime(450);
    expect(onOpenActions).toHaveBeenCalledTimes(1);

    // Android/iOS fires contextmenu 50ms later
    vi.advanceTimersByTime(50);
    const preventDefault = vi.fn();
    props.onContextMenu({ preventDefault, target: { closest: () => null } } as any);

    expect(preventDefault).toHaveBeenCalled();
    // Must NOT call onOpenActions a second time
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenActions on desktop right-click context menu and prevents default', () => {
    const onOpenActions = vi.fn();
    const controller = createChatMessageGestureController({ onOpenActions });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    const preventDefault = vi.fn();
    props.onContextMenu({ preventDefault, target: { closest: () => null } } as any);

    expect(preventDefault).toHaveBeenCalled();
    expect(onOpenActions).toHaveBeenCalledWith(message);
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });

  it('triggers onDoubleTapReply on desktop double-click', () => {
    const onDoubleTapReply = vi.fn();
    const controller = createChatMessageGestureController({
      onOpenActions: () => {},
      onDoubleTapReply,
    });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    props.onDoubleClick({ target: { closest: () => null } } as any);
    expect(onDoubleTapReply).toHaveBeenCalledWith(message);
  });

  it('triggers onOpenActions on Enter keyboard press', () => {
    const onOpenActions = vi.fn();
    const controller = createChatMessageGestureController({ onOpenActions });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    const targetEl = {};
    const preventDefault = vi.fn();
    props.onKeyDown({ key: 'Enter', target: targetEl, currentTarget: targetEl, preventDefault } as any);

    expect(preventDefault).toHaveBeenCalled();
    expect(onOpenActions).toHaveBeenCalledWith(message);
  });

  it('cancels hold if secondary pointer touches down (multi-touch / pinch)', () => {
    const onOpenActions = vi.fn();
    const controller = createChatMessageGestureController({ onOpenActions });
    const message = { id: 'msg-1' };
    const props = controller.getMessageProps(message);

    // Pointer 1 down
    props.onPointerDown({ button: 0, pointerId: 1, clientX: 100, clientY: 100 } as any);

    // Pointer 2 down (multi-touch)
    props.onPointerDown({ button: 0, pointerId: 2, clientX: 150, clientY: 150 } as any);

    vi.advanceTimersByTime(500);
    expect(onOpenActions).not.toHaveBeenCalled();
  });
});
