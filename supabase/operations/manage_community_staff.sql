-- Canonical source for the private Supabase saved query:
-- YouDO — Manage Community Staff
--
-- Prerequisite: apply community_chat.sql first.
-- Edit only the two set_config values below, then run the whole query.
-- Repeating the same action for the same account is safe and does not create
-- duplicate staff rows.

begin;

select set_config('youdo.staff_email', 'replace-with-youdo-login@example.com', true);
select set_config('youdo.staff_action', 'inspect', true);

do $manage_community_staff$
declare
  target_email text := current_setting('youdo.staff_email');
  requested_action text := current_setting('youdo.staff_action');
  -- Allowed actions:
  -- inspect       — make no change and show the current staff record
  -- set_owner     — bootstrap the one private owner; safe to repeat for that owner
  -- promote_admin — grant admin permission and show the public Admin badge
  -- show_badge    — retain admin permission and show the public Admin badge
  -- hide_badge    — retain admin permission but hide the public Admin badge
  -- demote_admin  — remove admin permission; cannot remove the owner
begin
  requested_action := lower(btrim(requested_action));
  target_email := lower(btrim(target_email));

  if requested_action = 'inspect' then
    null;
  elsif target_email = '' or target_email = 'replace-with-youdo-login@example.com' then
    raise exception 'Replace target_email before running a staff change';
  elsif requested_action = 'set_owner' then
    perform public.set_community_staff(target_email, 'owner', true);
  elsif requested_action in ('promote_admin', 'show_badge') then
    perform public.set_community_staff(target_email, 'admin', true);
  elsif requested_action = 'hide_badge' then
    perform public.set_community_staff(target_email, 'admin', false);
  elsif requested_action = 'demote_admin' then
    perform public.remove_community_staff(target_email);
  else
    raise exception 'Unsupported requested_action: %', requested_action;
  end if;
end $manage_community_staff$;

-- Private verification result. The app never receives the owner/admin role.
select
  u.email,
  a.role,
  a.badge_visible,
  a.created_at
from auth.users u
left join public.community_admins a on a.user_id = u.id
where lower(u.email) = lower(current_setting('youdo.staff_email'));

commit;
