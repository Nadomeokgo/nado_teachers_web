-- Internal curriculum CMS. Does not copy, publish, or remove existing materials.
-- Existing teacher-account eligibility is preserved; inactive accounts are denied.
-- Prerequisite: deployed member-resource/auth setup providing profiles.account_status,
-- profiles.is_active, resources.storage_path, is_admin(), and can_read_member_resources().
-- The historical schema.sql bootstrap alone does not install the separate student/member setup.
begin;

-- Fail before changes if this is run against an incomplete historical bootstrap.
do $prerequisites$
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.can_read_member_resources()') is null
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='account_status')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_active')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='resources' and column_name='storage_path') then
    raise exception 'Apply the deployed account-status, teacher-activation, and member-resource authorization setup before internal_curriculum_update.sql';
  end if;
end;
$prerequisites$;

-- Own-profile UPDATE is allowed elsewhere, so protect the administrator's
-- activation flag with the same guard already protecting role/account_status.
create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.role is distinct from old.role
     or new.account_status is distinct from old.account_status
     or new.is_active is distinct from old.is_active then
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception using errcode = '42501',
        message = 'role, account_status, and is_active may only be changed by an active administrator';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists profiles_protect_authorization_fields on public.profiles;
create trigger profiles_protect_authorization_fields
before update of role, account_status, is_active on public.profiles
for each row execute function public.protect_profile_authorization_fields();

-- This function uses the caller's existing own-profile SELECT policy.
-- It neither reads user-editable JWT metadata nor bypasses profile RLS.
create or replace function public.can_read_curriculum()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and account_status = 'active'
      and (role = 'admin' or (role = 'teacher' and is_active is true))
  );
$function$;
revoke all on function public.can_read_curriculum() from public, anon, authenticated;
grant execute on function public.can_read_curriculum() to authenticated, service_role;

-- Plain text sections are rendered by the client as text, never raw HTML.
-- Validate shape and bounds so direct API writes have the same limits as the UI.
create or replace function public.curriculum_sections_valid(value jsonb, require_published boolean default false)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $function$
declare
  section jsonb;
  section_id text;
  section_ids text[] := array[]::text[];
  field_name text;
  field_limit integer;
  has_content boolean := false;
begin
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 20 then
    return false;
  end if;
  for section in select item from jsonb_array_elements(value) as rows(item)
  loop
    if jsonb_typeof(section) <> 'object'
       or jsonb_typeof(section->'id') is distinct from 'string'
       or jsonb_typeof(section->'type') is distinct from 'string' then
      return false;
    end if;
    section_id := section->>'id';
    if char_length(btrim(section_id)) = 0 or char_length(section_id) > 100
       or section_id = any(section_ids)
       or char_length(btrim(section->>'type')) = 0
       or char_length(section->>'type') > 40 then
      return false;
    end if;
    section_ids := array_append(section_ids,section_id);
    foreach field_name in array array['title','body','teacher_notes']
    loop
      field_limit := case field_name when 'title' then 160 when 'body' then 16000 else 4000 end;
      if section ? field_name and (
        jsonb_typeof(section->field_name) <> 'string'
        or char_length(section->>field_name) > field_limit
      ) then return false; end if;
    end loop;
    if require_published and coalesce(section->>'title','') !~ '[^[:space:]]' then return false; end if;
    has_content := has_content or coalesce(section->>'body','') ~ '[^[:space:]]';
    if section ? 'minutes' then
      if jsonb_typeof(section->'minutes') <> 'number' then return false; end if;
      if (section->>'minutes')::numeric < 0 or (section->>'minutes')::numeric > 240
         or mod((section->>'minutes')::numeric,1) <> 0 then return false; end if;
    end if;
  end loop;
  return not require_published or (jsonb_array_length(value) > 0 and has_content);
end;
$function$;
revoke all on function public.curriculum_sections_valid(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.curriculum_sections_valid(jsonb, boolean) to authenticated, service_role;

create table if not exists public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 160 and title ~ '[^[:space:]]'),
  summary text not null default '' check (char_length(summary) <= 600),
  plan text not null default 'all' check (plan in ('all','economy','standard','premium')),
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  topic text not null default '' check (char_length(topic) <= 80),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 240),
  sections jsonb not null default '[]'::jsonb check (public.curriculum_sections_valid(sections,status='published')),
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists curriculum_lessons_status_order_idx
  on public.curriculum_lessons(status,sort_order,created_at);

create table if not exists public.curriculum_settings (
  id boolean primary key default true check (id is true),
  legacy_links_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Server-owned timestamps also advance inside one transaction, supporting
-- UPDATE ... WHERE updated_at = the previously loaded value.
create or replace function public.set_curriculum_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  else
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$function$;
revoke all on function public.set_curriculum_updated_at() from public, anon, authenticated;
grant execute on function public.set_curriculum_updated_at() to authenticated, service_role;
drop trigger if exists curriculum_lessons_updated_at on public.curriculum_lessons;
create trigger curriculum_lessons_updated_at before insert or update on public.curriculum_lessons
for each row execute function public.set_curriculum_updated_at();
drop trigger if exists curriculum_settings_updated_at on public.curriculum_settings;
create trigger curriculum_settings_updated_at before insert or update on public.curriculum_settings
for each row execute function public.set_curriculum_updated_at();

alter table public.curriculum_lessons enable row level security;
alter table public.curriculum_settings enable row level security;
revoke all on public.curriculum_lessons, public.curriculum_settings from public, anon, authenticated;
grant select, insert, update, delete on public.curriculum_lessons to authenticated;
grant select, update on public.curriculum_settings to authenticated;
grant all on public.curriculum_lessons, public.curriculum_settings to service_role;

drop policy if exists curriculum_lessons_read on public.curriculum_lessons;
create policy curriculum_lessons_read on public.curriculum_lessons
for select to authenticated using (
  (select public.is_admin()) or
  (status='published' and (select public.can_read_curriculum()))
);
drop policy if exists curriculum_lessons_admin_insert on public.curriculum_lessons;
create policy curriculum_lessons_admin_insert on public.curriculum_lessons
for insert to authenticated with check ((select public.is_admin()));
drop policy if exists curriculum_lessons_admin_update on public.curriculum_lessons;
create policy curriculum_lessons_admin_update on public.curriculum_lessons
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists curriculum_lessons_admin_delete on public.curriculum_lessons;
create policy curriculum_lessons_admin_delete on public.curriculum_lessons
for delete to authenticated using ((select public.is_admin()));
drop policy if exists curriculum_settings_read on public.curriculum_settings;
create policy curriculum_settings_read on public.curriculum_settings
for select to authenticated using ((select public.can_read_curriculum()));
drop policy if exists curriculum_settings_admin_update on public.curriculum_settings;
create policy curriculum_settings_admin_update on public.curriculum_settings
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Keep existing external resources available until an administrator switches off.
-- Reapplying the update must never reset a switch that was deliberately disabled.
insert into public.curriculum_settings(id,legacy_links_enabled)
values(true,true) on conflict(id) do nothing;

-- Hide external resources at the Data API as well as in the teacher UI.
-- Private uploaded files and the separate student platform keep existing access.
drop policy if exists resources_authenticated_read on public.resources;
drop policy if exists resources_member_read on public.resources;
create policy resources_member_read on public.resources
for select to authenticated using (
  is_active and public.can_read_member_resources() and (
    nullif(btrim(storage_path),'') is not null
    or not exists (select 1 from public.profiles where id=(select auth.uid()) and role='teacher')
    or exists (select 1 from public.curriculum_settings where id and legacy_links_enabled)
  )
);

comment on table public.curriculum_lessons is 'Internal curriculum. Active teachers read published lessons; active administrators manage drafts and publication.';
comment on table public.curriculum_settings is 'Singleton administrator setting controlling legacy external links for teachers.';
commit;
