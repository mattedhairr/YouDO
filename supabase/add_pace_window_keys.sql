-- Run once on an existing YouDO project before releasing the Board reset fix.
-- These period identities let every client expire stale totals immediately,
-- even when the row owner has not reopened YouDO after midnight.

alter table public.public_pace add column if not exists today_key date;
alter table public.public_pace add column if not exists week_key date;
alter table public.public_pace add column if not exists month_key date;
