-- NADO Teachers 운영 업데이트
-- 적용: Supabase Dashboard -> SQL Editor에서 전체를 한 번 실행
-- 내용: 지역별 스케줄, 세부 지역, 선택 이메일, 1:vN 배정, 기록 영구 삭제 권한

begin;

-- 1. 지역별 스케줄과 세부 지역
alter table public.availability
  add column if not exists service_area text;

update public.availability set service_area = 'IGC' where location = 'IGC' and service_area is null;
update public.availability set service_area = '트리플스트리트' where location = '트리플스트리트' and service_area is null;
update public.availability set service_area = '송도 전체' where location in ('송도 내 협의', '인천(송도 포함)', '송도') and service_area is null;
update public.availability set service_area = '서울 전체' where location = '서울' and service_area is null;
update public.availability set location = 'IGC & 트스' where location in ('IGC', '트리플스트리트');
update public.availability set location = '송도' where location in ('송도 내 협의', '인천(송도 포함)');

alter table public.availability drop constraint if exists availability_location_check;
alter table public.availability add constraint availability_location_check
  check (location in ('송도', 'IGC & 트스', '서울'));

alter table public.availability drop constraint if exists unique_teacher_slot;
create unique index if not exists availability_teacher_location_area_slot_uidx
  on public.availability (teacher_id, day_of_week, start_time, end_time, location, coalesce(service_area, ''));

create table if not exists public.teacher_service_areas (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  region text not null check (region in ('Songdo', 'IGC_TRIPLE', 'Seoul')),
  area text not null check (char_length(btrim(area)) between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_service_areas_unique unique (teacher_id, region, area)
);

create index if not exists teacher_service_areas_teacher_idx
  on public.teacher_service_areas (teacher_id, region, active);

insert into public.teacher_service_areas (teacher_id, region, area, active)
select distinct teacher_id,
  case location when '서울' then 'Seoul' when 'IGC & 트스' then 'IGC_TRIPLE' else 'Songdo' end,
  service_area,
  true
from public.availability
where service_area is not null
on conflict (teacher_id, region, area) do update set active = true;

alter table public.teacher_service_areas enable row level security;
drop policy if exists "teacher_service_areas_own_or_admin_select" on public.teacher_service_areas;
drop policy if exists "teacher_service_areas_own_or_admin_insert" on public.teacher_service_areas;
drop policy if exists "teacher_service_areas_own_or_admin_update" on public.teacher_service_areas;
drop policy if exists "teacher_service_areas_own_or_admin_delete" on public.teacher_service_areas;

create policy "teacher_service_areas_own_or_admin_select" on public.teacher_service_areas
  for select to authenticated using (teacher_id = (select auth.uid()) or public.is_admin());
create policy "teacher_service_areas_own_or_admin_insert" on public.teacher_service_areas
  for insert to authenticated with check (teacher_id = (select auth.uid()) or public.is_admin());
create policy "teacher_service_areas_own_or_admin_update" on public.teacher_service_areas
  for update to authenticated
  using (teacher_id = (select auth.uid()) or public.is_admin())
  with check (teacher_id = (select auth.uid()) or public.is_admin());
create policy "teacher_service_areas_own_or_admin_delete" on public.teacher_service_areas
  for delete to authenticated using (teacher_id = (select auth.uid()) or public.is_admin());

grant select, insert, update, delete on public.teacher_service_areas to authenticated;

-- 2. 이메일 선택 입력 및 1:vN 배정
alter table public.student_assignments
  add column if not exists student_id uuid references auth.users(id) on delete set null,
  add column if not exists student_email text,
  add column if not exists status text not null default 'active',
  add column if not exists ended_at timestamptz,
  add column if not exists group_size smallint not null default 1,
  add column if not exists group_members jsonb not null default '[]'::jsonb;

alter table public.student_assignments alter column student_email drop not null;

update public.student_assignments
set group_members = jsonb_build_array(jsonb_build_object('name', student_name, 'email', student_email))
where group_members = '[]'::jsonb;

alter table public.student_assignments drop constraint if exists student_assignments_status_check;
alter table public.student_assignments add constraint student_assignments_status_check
  check (status in ('active', 'ended', 'completed'));

alter table public.student_assignments drop constraint if exists student_assignments_group_size_check;
alter table public.student_assignments add constraint student_assignments_group_size_check
  check (group_size between 1 and 4);

alter table public.student_assignments drop constraint if exists student_assignments_group_members_check;
alter table public.student_assignments add constraint student_assignments_group_members_check
  check (
    jsonb_typeof(group_members) = 'array'
    and (jsonb_array_length(group_members) = 0 or jsonb_array_length(group_members) = group_size)
  );

create index if not exists student_assignments_status_idx
  on public.student_assignments (status, settlement_date);

-- 관리자만 영구 삭제 가능. 기존 정책이 있더라도 명시적으로 다시 설정합니다.
drop policy if exists "student_assignments_admin_delete" on public.student_assignments;
create policy "student_assignments_admin_delete" on public.student_assignments
  for delete to authenticated using (public.is_admin());
grant delete on public.student_assignments to authenticated;

comment on column public.availability.service_area is '선택한 대분류 장소 안의 세부 가능 지역';
comment on column public.student_assignments.student_email is '선택 입력 학생 이메일';
comment on column public.student_assignments.group_size is '1:vN 수업의 학생 수, 1~4';
comment on column public.student_assignments.group_members is '그룹 구성원 이름과 선택 이메일의 JSON 배열';

commit;

-- 확인용
-- select location, service_area, count(*) from public.availability group by 1,2 order by 1,2;
-- select student_name, student_email, group_size, group_members, status from public.student_assignments order by created_at desc;
