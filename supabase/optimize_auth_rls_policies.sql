-- Apply this once to an existing YouDO Supabase project.
-- It preserves the same ownership rules while evaluating auth.uid() once per
-- statement, as recommended by Supabase's RLS performance advisor.
-- The transaction makes policy replacement atomic: any failure rolls it back.

begin;

drop policy if exists "Users can read their own backup" on public.user_backups;
drop policy if exists "Users can insert their own backup" on public.user_backups;
drop policy if exists "Users can update their own backup" on public.user_backups;
drop policy if exists "Users can delete their own backup" on public.user_backups;

create policy "Users can read their own backup"
  on public.user_backups for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own backup"
  on public.user_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own backup"
  on public.user_backups for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own backup"
  on public.user_backups for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own snapshots" on public.user_backup_snapshots;
drop policy if exists "Users can insert their own snapshots" on public.user_backup_snapshots;
drop policy if exists "Users can delete their own snapshots" on public.user_backup_snapshots;

create policy "Users can read their own snapshots"
  on public.user_backup_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own snapshots"
  on public.user_backup_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own snapshots"
  on public.user_backup_snapshots for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists pace_select_auth on public.public_pace;
drop policy if exists pace_insert_own on public.public_pace;
drop policy if exists pace_update_own on public.public_pace;
drop policy if exists pace_delete_own on public.public_pace;

create policy pace_select_auth
  on public.public_pace for select to authenticated
  using (true);

create policy pace_insert_own
  on public.public_pace for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy pace_update_own
  on public.public_pace for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pace_delete_own
  on public.public_pace for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
