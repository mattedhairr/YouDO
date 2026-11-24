-- Supabase Snippet Name: YouDO — Profile Photos
-- Your own profile photo, and an admin's way to take down one that breaks the
-- rules. Apply after admin_hub.sql (it uses the community staff roles).
-- Safe to re-run. Run the whole query in the SQL Editor (do not save it).
--
-- The app crops the photo to a square and shrinks it (about 30 KB, WebP or
-- JPEG) before it uploads to avatars/<your user id>/<time>.webp. The bucket is
-- public so a profile picture loads like any image; only you can add, replace
-- or delete files in your own folder. Your profile then points at the file.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read_own on storage.objects;
create policy avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Admins (and the owner) take down a photo: the person goes back to the 🎓
-- emoji on their profile and in their account, so it doesn't come back on
-- their next sign-in. Never the owner's photo. The file itself is left for
-- the person to replace; nothing points at it any more.
create or replace function public.admin_remove_profile_photo(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  if public.is_community_owner(target) then raise exception 'The owner''s photo can''t be removed here' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'Person not found'; end if;
  update public.profiles set avatar_url = '🎓', updated_at = pg_catalog.now()
    where id = target and avatar_url ~* '^https?://';
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"avatar_url":"🎓"}'::jsonb
    where id = target and coalesce(raw_user_meta_data ->> 'avatar_url', '') ~* '^https?://';
  insert into public.community_audit_log(admin_id, action, target_user_id) values (auth.uid(), 'photo.removed', target);
end; $$;
revoke execute on function public.admin_remove_profile_photo(uuid) from public, anon;
grant execute on function public.admin_remove_profile_photo(uuid) to authenticated;

commit;
