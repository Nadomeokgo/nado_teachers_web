-- =========================================================
-- 학생 배정 및 첫 달 수업료 정산 예정일 기능 추가
-- Supabase Dashboard → SQL Editor → New query에 전체 붙여넣고 실행
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_name text not null check (char_length(btrim(student_name)) between 1 and 100),
  first_lesson_date date not null,
  settlement_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_assignments_valid_dates check (settlement_date >= first_lesson_date)
);

create index if not exists student_assignments_teacher_idx
on public.student_assignments(teacher_id);

create index if not exists student_assignments_first_lesson_idx
on public.student_assignments(first_lesson_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_assignments_updated_at on public.student_assignments;
create trigger student_assignments_updated_at
before update on public.student_assignments
for each row execute procedure public.set_updated_at();

alter table public.student_assignments enable row level security;

drop policy if exists "student_assignments_own_or_admin_select" on public.student_assignments;
drop policy if exists "student_assignments_admin_insert" on public.student_assignments;
drop policy if exists "student_assignments_admin_update" on public.student_assignments;
drop policy if exists "student_assignments_admin_delete" on public.student_assignments;

-- 선생님은 자신의 배정만, 관리자는 전체 배정을 조회할 수 있습니다.
create policy "student_assignments_own_or_admin_select"
on public.student_assignments
for select to authenticated
using (teacher_id = auth.uid() or public.is_admin());

-- 등록·수정·삭제는 관리자만 가능합니다.
create policy "student_assignments_admin_insert"
on public.student_assignments
for insert to authenticated
with check (public.is_admin());

create policy "student_assignments_admin_update"
on public.student_assignments
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "student_assignments_admin_delete"
on public.student_assignments
for delete to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.student_assignments to authenticated;

-- 확인용 쿼리
-- select * from public.student_assignments order by first_lesson_date;
