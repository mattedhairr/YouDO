/** Show the current server ranking without waiting for private backup upload. */
export async function refreshBoard<T>(options: {
  read: () => Promise<T>;
  show: (value: T) => void;
  synchronize: () => Promise<void>;
  cancelled: () => boolean;
}): Promise<void> {
  const firstRead = options.read().then((value) => {
    if (!options.cancelled()) options.show(value);
  });
  // Observe both promises immediately so a failed read never leaves an unhandled
  // sync rejection. The second read always follows the first to prevent rollback.
  const [, sync] = await Promise.allSettled([firstRead, options.synchronize()]);
  if (!options.cancelled() && sync.status === 'fulfilled') {
    const fresh = await options.read();
    if (!options.cancelled()) options.show(fresh);
  }
}
