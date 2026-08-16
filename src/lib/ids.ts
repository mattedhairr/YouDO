export function uid(prefix = 'n'): string {
  try {
    // crypto.randomUUID() is available in all modern browsers and Android WebView (API 84+).
    // It provides 122 bits of entropy — far stronger than Math.random().
    return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  } catch {
    // Fallback for legacy environments
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
  }
}
