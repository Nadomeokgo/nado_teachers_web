-- =========================================================
-- 나도 Teachers: Supabase 초기 데이터베이스 설정
-- Supabase Dashboard → SQL Editor → New query에 전체 붙여넣고 실행
-- =========================================================

create extension if not exists pgcrypto;

-- 1) 사용자 프로필
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  school text,
  major text,
  phone text,
  bank_name text,
  account_number text,
  bio text,
  profile_photo_path text,
  profile_completed_at timestamptz,
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists profile_completed_at timestamptz;
alter table public.profiles
  add column if not exists profile_photo_path text;

-- 프로필 완료 시 모든 필수 정보가 입력되어 있어야 함
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

-- 2) 선생님 주간 가능 시간
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text not null default '송도 내 협의',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_time_range check (start_time < end_time),
  constraint unique_teacher_slot unique (teacher_id, day_of_week, start_time, end_time)
);
create index if not exists availability_teacher_idx on public.availability(teacher_id);

-- 3) 학생 배정 및 첫 달 수업료 정산 예정일
create table if not exists public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_name text not null check (char_length(btrim(student_name)) between 1 and 100),
  plan text check (plan in ('economy', 'standard', 'premium')),
  first_lesson_date date not null,
  settlement_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_assignments_valid_dates check (settlement_date >= first_lesson_date)
);
create index if not exists student_assignments_teacher_idx on public.student_assignments(teacher_id);
create index if not exists student_assignments_first_lesson_idx on public.student_assignments(first_lesson_date);
create index if not exists student_assignments_settlement_idx on public.student_assignments(settlement_date);

-- 4) 공지사항
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  title_en text,
  body_en text,
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

-- 5) 커리큘럼 및 자료 링크
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  title_en text,
  description_en text,
  category text not null default 'PDF',
  file_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6) 교육 영상 링크
create table if not exists public.training_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  title_en text,
  description_en text,
  video_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 다국어 콘텐츠 필드 (기존 프로젝트에도 안전하게 추가)
alter table public.announcements
  add column if not exists title_en text,
  add column if not exists body_en text;
alter table public.resources
  add column if not exists title_en text,
  add column if not exists description_en text;
alter table public.training_videos
  add column if not exists title_en text,
  add column if not exists description_en text;

-- 신규 Auth 사용자가 생성되면 profile 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists availability_updated_at on public.availability;
create trigger availability_updated_at before update on public.availability
for each row execute procedure public.set_updated_at();

drop trigger if exists student_assignments_updated_at on public.student_assignments;
create trigger student_assignments_updated_at before update on public.student_assignments
for each row execute procedure public.set_updated_at();

-- 관리자 여부 확인. RLS 정책 안에서 재귀를 피하기 위해 security definer 사용
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 프로필 사진용 비공개 Storage 버킷
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_select_own_or_admin" on storage.objects;
drop policy if exists "profile_photos_insert_own" on storage.objects;
drop policy if exists "profile_photos_update_own" on storage.objects;
drop policy if exists "profile_photos_delete_own" on storage.objects;

create policy "profile_photos_select_own_or_admin" on storage.objects
for select to authenticated
using (bucket_id = 'profile-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "profile_photos_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile_photos_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile_photos_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.availability enable row level security;
alter table public.student_assignments enable row level security;
alter table public.announcements enable row level security;
alter table public.resources enable row level security;
alter table public.training_videos enable row level security;

-- 기존 정책 재실행 가능하도록 삭제
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "availability_own_or_admin_select" ON public.availability;
DROP POLICY IF EXISTS "availability_own_or_admin_insert" ON public.availability;
DROP POLICY IF EXISTS "availability_own_or_admin_update" ON public.availability;
DROP POLICY IF EXISTS "availability_own_or_admin_delete" ON public.availability;
DROP POLICY IF EXISTS "student_assignments_own_or_admin_select" ON public.student_assignments;
DROP POLICY IF EXISTS "student_assignments_admin_insert" ON public.student_assignments;
DROP POLICY IF EXISTS "student_assignments_admin_update" ON public.student_assignments;
DROP POLICY IF EXISTS "student_assignments_admin_delete" ON public.student_assignments;
DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.announcements;
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
DROP POLICY IF EXISTS "resources_authenticated_read" ON public.resources;
DROP POLICY IF EXISTS "resources_admin_all" ON public.resources;
DROP POLICY IF EXISTS "videos_authenticated_read" ON public.training_videos;
DROP POLICY IF EXISTS "videos_admin_all" ON public.training_videos;

-- profiles: 본인 또는 관리자만 조회, 본인은 role을 바꾸지 못하도록 컬럼 권한 추가 제한
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = auth.uid() and role = 'teacher');

create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- 일반 authenticated 사용자는 role 컬럼을 직접 수정하지 못함
revoke update on public.profiles from authenticated;
grant update (email, full_name, school, major, phone, bank_name, account_number, bio, profile_photo_path, profile_completed_at, updated_at) on public.profiles to authenticated;
grant select, insert on public.profiles to authenticated;

-- availability: 선생님은 자신의 행만, 관리자는 전체
create policy "availability_own_or_admin_select" on public.availability
for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "availability_own_or_admin_insert" on public.availability
for insert to authenticated with check (teacher_id = auth.uid() or public.is_admin());
create policy "availability_own_or_admin_update" on public.availability
for update to authenticated using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());
create policy "availability_own_or_admin_delete" on public.availability
for delete to authenticated using (teacher_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.availability to authenticated;

-- student_assignments: 선생님은 자신의 배정만 조회, 관리자는 전체 CRUD
create policy "student_assignments_own_or_admin_select" on public.student_assignments
for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "student_assignments_admin_insert" on public.student_assignments
for insert to authenticated with check (public.is_admin());
create policy "student_assignments_admin_update" on public.student_assignments
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "student_assignments_admin_delete" on public.student_assignments
for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.student_assignments to authenticated;

-- 콘텐츠: 로그인 사용자는 활성 콘텐츠 조회, 관리자는 전체 CRUD
create policy "announcements_authenticated_read" on public.announcements
for select to authenticated using (is_active = true or public.is_admin());
create policy "announcements_admin_all" on public.announcements
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;

create policy "resources_authenticated_read" on public.resources
for select to authenticated using (is_active = true or public.is_admin());
create policy "resources_admin_all" on public.resources
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.resources to authenticated;

create policy "videos_authenticated_read" on public.training_videos
for select to authenticated using (is_active = true or public.is_admin());
create policy "videos_admin_all" on public.training_videos
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.training_videos to authenticated;

-- 예시 콘텐츠: URL을 실제 Google Drive/YouTube 링크로 교체하세요.
insert into public.announcements (title, body, published_at)
select '첫 수업 일정 공유 안내', '첫 수업 일정이 확정되면 매칭 단톡방에 날짜와 시간을 반드시 공유해주세요.', now()
where not exists (select 1 from public.announcements where title = '첫 수업 일정 공유 안내');

insert into public.announcements (title, body, published_at)
select '수업 연장 안내', '마지막 4번째 수업 전에 학생에게 연장 여부를 확인해주세요.', now() - interval '1 day'
where not exists (select 1 from public.announcements where title = '수업 연장 안내');

insert into public.resources (title, description, category, file_url, sort_order)
select '첫 수업 질문 리스트', '초급 학생과 자연스럽게 대화를 시작할 수 있는 질문 모음입니다.', 'PDF', 'https://drive.google.com/', 1
where not exists (select 1 from public.resources where title = '첫 수업 질문 리스트');

insert into public.resources (title, description, category, file_url, sort_order)
select '4주 기본 커리큘럼', '주 1회 수업 기준으로 사용할 수 있는 기본 진행안입니다.', 'PDF', 'https://drive.google.com/', 2
where not exists (select 1 from public.resources where title = '4주 기본 커리큘럼');

insert into public.training_videos (title, description, video_url, sort_order)
select '나도 수업 운영 기본', '수업 구조와 선생님의 역할을 설명합니다.', 'https://www.youtube.com/watch?v=REPLACE_ME', 1
where not exists (select 1 from public.training_videos where title = '나도 수업 운영 기본');

insert into public.training_videos (title, description, video_url, sort_order)
select '첫 수업 진행 방법', '첫 만남부터 피드백까지 실제 진행 순서를 확인합니다.', 'https://www.youtube.com/watch?v=REPLACE_ME', 2
where not exists (select 1 from public.training_videos where title = '첫 수업 진행 방법');

-- =========================================================
-- 최초 관리자 지정 방법
-- 1. Supabase → Authentication → Users에서 본인 계정 생성
-- 2. 아래 이메일을 본인 이메일로 바꾸고 한 번 실행
-- update public.profiles set role = 'admin' where email = 'your@email.com';
-- =========================================================
