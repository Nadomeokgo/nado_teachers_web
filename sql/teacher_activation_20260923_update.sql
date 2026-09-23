-- Run this once in the Supabase SQL editor before publishing the UI.
begin;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Teachers retain their own profile and schedule access, but cannot change
-- this administrative flag. The existing profile UPDATE grant is column scoped.
revoke update (is_active) on public.profiles from authenticated;

create or replace function public.set_teacher_active(
  p_teacher_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Only an administrator can change teacher activation'
      using errcode = '42501';
  end if;
  if p_is_active is null then
    raise exception 'Activation state is required' using errcode = '22004';
  end if;

  update public.profiles
     set is_active = p_is_active, updated_at = now()
   where id = p_teacher_id and role = 'teacher';
  if not found then
    raise exception 'Teacher not found' using errcode = 'P0002';
  end if;
  return p_is_active;
end;
$function$;

revoke all on function public.set_teacher_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_teacher_active(uuid, boolean) to authenticated;
commit;

-- Then apply the updated public-teacher-directory-rpc-v2.sql in the main site.
-- The v3 RPC calls v2, so both public versions will exclude inactive profiles.
