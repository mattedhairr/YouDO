let ready = false;
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
export const webUpdateReady = () => ready;
export function subscribeWebUpdate(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notifyReady() {
  ready = true;
  listeners.forEach((listener) => listener());
}

export function registerWebUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;
  // Activation changes the worker, not the already-running React bundle.
  // Ask for a refresh rather than interrupting a form or active sitting.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) notifyReady();
    hadController = true;
  });
  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
    registration = reg;
    const check = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void reg.update().catch(() => {});
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    window.setInterval(check, 60 * 60 * 1000);
    check();
  }).catch(() => { /* Offline boot must still work. */ });
}

export async function checkWebUpdate(): Promise<boolean> {
  if (registration && navigator.onLine) await registration.update();
  return ready;
}

export function refreshWebApp() {
  // Deliberately preserve localStorage, IndexedDB, cookies and authentication.
  window.location.reload();
}
