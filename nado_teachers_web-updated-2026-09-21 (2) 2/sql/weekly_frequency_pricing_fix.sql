-- =========================================================
-- NADO 주 2회(8회) 수업료·정산 계산 지원
-- 적용일: 2026-08-20
-- 기존 학생/정산 데이터는 삭제하지 않습니다.
-- =========================================================

begin;

alter table public.student_assignments
  drop constraint if exists student_assignments_settlement_sessions_check;

alter table public.student_assignments
  add constraint student_assignments_settlement_sessions_check
  check (settlement_sessions is null or settlement_sessions between 1 and 8);

alter table public.student_assignments
  drop constraint if exists student_assignments_settlement_matches_frequency;

alter table public.student_assignments
  add constraint student_assignments_settlement_matches_frequency
  check (
    weekly_frequency is null or settlement_sessions is null or
    settlement_sessions <= 4 * weekly_frequency
  );

comment on column public.student_assignments.weekly_frequency is
  'Lessons per week: 1 or 2. Once weekly uses 4 sessions; twice weekly uses 8 sessions and doubles the package totals.';

comment on column public.student_assignments.settlement_sessions is
  'Number of sessions handled by this teacher for first-month payout: 1-4 for once weekly or 1-8 for twice weekly.';

commit;
