-- Existing NADO Teachers database: store optional experience entries in the teacher profile.
-- Apply once before deploying the matching site files.

begin;

alter table public.profiles
  add column if not exists experience jsonb not null
  default '{"teaching":[],"work":[],"internship":[],"activities":[]}'::jsonb;

grant update (experience) on public.profiles to authenticated;

comment on column public.profiles.experience is
  'Teacher-provided teaching, work, internship, and activities/leadership entries; visible to the teacher and admins under existing profile RLS.';

commit;
