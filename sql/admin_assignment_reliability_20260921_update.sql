-- NADO Teachers 관리자 학생 배정 안정화
-- 적용: Supabase Dashboard -> SQL Editor에서 전체를 한 번 실행
-- 내용: 정산일 경과 기록 정리, 관리자 수정/삭제 권한 보강,
--       학생 기록 영구 삭제 시 연결 데이터 외래키 오류 해결(학습 데이터 보존)

begin;

-- 정산 예정일 다음 날부터 실제 DB 상태도 학생 기록(completed)으로 맞춥니다.
update public.student_assignments
set status = 'completed',
    ended_at = coalesce(ended_at, now())
where status = 'active'
  and settlement_date < (now() at time zone 'Asia/Seoul')::date;

-- 과거 정산일로 새로 저장되거나 수정된 행이 현재 학생으로 남지 않게 합니다.
create or replace function public.normalize_student_assignment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active'
     and new.settlement_date < (now() at time zone 'Asia/Seoul')::date then
    new.status := 'completed';
    new.ended_at := coalesce(new.ended_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_student_assignment_status_trigger
  on public.student_assignments;
create trigger normalize_student_assignment_status_trigger
before insert or update of settlement_date, status
on public.student_assignments
for each row execute function public.normalize_student_assignment_status();

create index if not exists student_assignments_status_settlement_idx
  on public.student_assignments (status, settlement_date);

-- 음성 제출이 존재해도 학생 배정 기록만 삭제할 수 있게 합니다.
-- 기존 음성 제출과 그 하위 학습 데이터는 보존하고 assignment_id 연결만 해제합니다.
do $$
begin
  if to_regclass('public.audio_submissions') is not null then
    execute 'alter table public.audio_submissions alter column assignment_id drop not null';
    execute 'alter table public.audio_submissions drop constraint if exists audio_submissions_assignment_id_fkey';
    execute 'alter table public.audio_submissions add constraint audio_submissions_assignment_id_fkey foreign key (assignment_id) references public.student_assignments(id) on delete set null';
  end if;
end;
$$;

-- 운영 DB별 정책 차이를 없애고 관리자 저장/수정/삭제를 명시적으로 허용합니다.
drop policy if exists "student_assignments_admin_insert" on public.student_assignments;
drop policy if exists "student_assignments_admin_update" on public.student_assignments;
drop policy if exists "student_assignments_admin_delete" on public.student_assignments;

create policy "student_assignments_admin_insert" on public.student_assignments
  for insert to authenticated with check ((select public.is_admin()));
create policy "student_assignments_admin_update" on public.student_assignments
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "student_assignments_admin_delete" on public.student_assignments
  for delete to authenticated using ((select public.is_admin()));

grant select, insert, update, delete on public.student_assignments to authenticated;

commit;

-- 확인용
-- select status, count(*) from public.student_assignments group by status order by status;
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'audio_submissions_assignment_id_fkey';
