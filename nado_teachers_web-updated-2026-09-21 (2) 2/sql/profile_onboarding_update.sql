-- 나도 Teachers: 최초 로그인 프로필 완성 기능
-- Supabase Dashboard → SQL Editor → New query에서 한 번만 실행하세요.

begin;

alter table public.profiles
  add column if not exists profile_completed_at timestamptz;

-- 이미 필수 정보를 모두 입력한 기존 선생님은 다시 최초 설정 화면이 뜨지 않도록 완료 처리
update public.profiles
set profile_completed_at = coalesce(profile_completed_at, updated_at, now())
where role = 'teacher'
  and profile_completed_at is null
  and nullif(btrim(coalesce(full_name, '')), '') is not null
  and nullif(btrim(coalesce(school, '')), '') is not null
  and nullif(btrim(coalesce(major, '')), '') is not null
  and nullif(btrim(coalesce(phone, '')), '') is not null
  and nullif(btrim(coalesce(bank_name, '')), '') is not null
  and account_number ~ '^[0-9-]{8,40}$'
  and nullif(btrim(coalesce(bio, '')), '') is not null;

-- 완료 시점이 기록된 행은 모든 필수 정보가 있어야 함
alter table public.profiles
  drop constraint if exists profiles_completion_requires_fields;

alter table public.profiles
  add constraint profiles_completion_requires_fields
  check (
    profile_completed_at is null or (
      nullif(btrim(coalesce(full_name, '')), '') is not null and
      nullif(btrim(coalesce(school, '')), '') is not null and
      nullif(btrim(coalesce(major, '')), '') is not null and
      nullif(btrim(coalesce(phone, '')), '') is not null and
      nullif(btrim(coalesce(bank_name, '')), '') is not null and
      account_number ~ '^[0-9-]{8,40}$' and
      nullif(btrim(coalesce(bio, '')), '') is not null
    )
  );

-- 로그인한 선생님이 최초 작성 완료 시점을 본인 프로필에 저장할 수 있도록 권한 추가
grant update (profile_completed_at) on public.profiles to authenticated;

comment on column public.profiles.profile_completed_at is '선생님 최초 필수 프로필 작성 완료 시각';

commit;
