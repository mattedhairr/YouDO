const MENU_HEIGHT_PX = 72;
const MENU_GAP_PX = 8;

/** Prefer above the bubble; drop below when the bar or scroll top would clip the menu. */
export function ydChatActionsPreferBelow(anchor: HTMLElement | null): boolean {
  if (!anchor) return false;
  const scroll = anchor.closest('.yd-chat-scroll');
  if (!scroll) return false;

  const bubbleRect = anchor.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();

  let obstructionTop = scrollRect.top;
  const chatRoot = scroll.closest('.yd-chat');
  const host = chatRoot?.parentElement;
  if (host) {
    for (const child of host.children) {
      if (child === chatRoot) break;
      if (child instanceof HTMLElement) {
        obstructionTop = Math.max(obstructionTop, child.getBoundingClientRect().bottom);
      }
    }
  }
  if (chatRoot) {
    for (const child of chatRoot.children) {
      if (child === scroll) break;
      if (child instanceof HTMLElement) {
        obstructionTop = Math.max(obstructionTop, child.getBoundingClientRect().bottom);
      }
    }
  }

  const spaceAbove = bubbleRect.top - obstructionTop;
  const composer = chatRoot?.querySelector('.yd-chat-composer');
  const obstructionBottom =
    composer instanceof HTMLElement ? composer.getBoundingClientRect().top : scrollRect.bottom;
  const spaceBelow = obstructionBottom - bubbleRect.bottom;

  const need = MENU_HEIGHT_PX + MENU_GAP_PX;
  const fitsAbove = spaceAbove >= need;
  const fitsBelow = spaceBelow >= need;
  if (fitsAbove) return false;
  if (fitsBelow) return true;
  return spaceBelow >= spaceAbove;
}
