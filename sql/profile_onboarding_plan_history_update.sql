-- =========================================================
-- 최초 프로필 작성 + 학생 플랜 + 현재/기록 자동 분류 업데이트
-- Supabase Dashboard → SQL Editor → New query에 전체 붙여넣고 실행
-- 기존 스케줄, 계좌정보, 배정 기록은 삭제하지 않습니다.
-- =========================================================

begin;

-- 1) 최초 프로필 작성 완료 시점
alter table public.profiles
  add column if not exists profile_completed_at timestamptz;

grant update (profile_completed_at) on public.profiles to authenticated;

-- 기존 선생님 중 모든 필수 정보가 이미 있는 계정은 완료 처리
update public.profiles
set profile_completed_at = coalesce(profile_completed_at, updated_at, now())
where role <> 'admin'
  and nullif(btrim(coalesce(full_name, '')), '') is not null
  and nullif(btrim(coalesce(school, '')), '') is not null
  and nullif(btrim(coalesce(major, '')), '') is not null
  and nullif(btrim(coalesce(phone, '')), '') is not null
  and nullif(btrim(coalesce(bank_name, '')), '') is not null
  and nullif(btrim(coalesce(account_number, '')), '') is not null
  and nullif(btrim(coalesce(bio, '')), '') is not null;

-- 2) 학생 플랜
alter table public.student_assignments
  add column if not exists plan text;

alter table public.student_assignments
  drop constraint if exists student_assignments_plan_check;

alter table public.student_assignments
  add constraint student_assignments_plan_check
  check (plan is null or plan in ('economy', 'standard', 'premium'));

create index if not exists student_assignments_settlement_idx
on public.student_assignments(settlement_date);

commit;

-- 기존 배정 행은 plan이 비어 있을 수 있습니다.
-- 관리자 페이지에서 해당 배정을 수정해 이코노미/스탠다드/프리미엄 중 하나를 선택하세요.
