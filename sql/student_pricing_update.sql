-- =========================================================
-- NADO 학생 수업시간 · 주 1/2회 · 부분 정산 자동계산 필드 추가
-- 적용일: 2026-08-20
-- 기존 student_assignments 데이터는 삭제하거나 임의로 가격을 채우지 않습니다.
-- =========================================================

begin;

alter table public.student_assignments
  add column if not exists lesson_duration_minutes smallint,
  add column if not exists weekly_frequency smallint,
  add column if not exists settlement_sessions smallint,
  add column if not exists four_lesson_tuition integer,
  add column if not exists nado_fee_percent numeric(5,2),
  add column if not exists four_lesson_nado_fee integer,
  add column if not exists four_lesson_teacher_payout integer,
  add column if not exists teacher_payout_amount integer,
  add column if not exists pricing_version text;

alter table public.student_assignments drop constraint if exists student_assignments_duration_check;
alter table public.student_assignments add constraint student_assignments_duration_check
  check (lesson_duration_minutes is null or lesson_duration_minutes in (30,35,40,45,60,70,80,90,100,110,120));

alter table public.student_assignments drop constraint if exists student_assignments_weekly_frequency_check;
alter table public.student_assignments add constraint student_assignments_weekly_frequency_check
  check (weekly_frequency is null or weekly_frequency in (1,2));

alter table public.student_assignments drop constraint if exists student_assignments_settlement_sessions_check;
alter table public.student_assignments add constraint student_assignments_settlement_sessions_check
  check (settlement_sessions is null or settlement_sessions between 1 and 4);

alter table public.student_assignments drop constraint if exists student_assignments_fee_percent_check;
alter table public.student_assignments add constraint student_assignments_fee_percent_check
  check (nado_fee_percent is null or nado_fee_percent between 0 and 100);

alter table public.student_assignments drop constraint if exists student_assignments_pricing_amounts_check;
alter table public.student_assignments add constraint student_assignments_pricing_amounts_check
  check (
    (four_lesson_tuition is null or four_lesson_tuition >= 0) and
    (four_lesson_nado_fee is null or four_lesson_nado_fee >= 0) and
    (four_lesson_teacher_payout is null or four_lesson_teacher_payout >= 0) and
    (teacher_payout_amount is null or teacher_payout_amount >= 0)
  );

-- 기존 레코드는 새 필드가 모두 NULL인 상태로 유지됩니다.
-- 새/수정 레코드는 아래 필드를 한 세트로 저장하도록 검증합니다.
alter table public.student_assignments drop constraint if exists student_assignments_pricing_snapshot_complete;
alter table public.student_assignments add constraint student_assignments_pricing_snapshot_complete
  check (
    (
      lesson_duration_minutes is null and weekly_frequency is null and settlement_sessions is null and
      four_lesson_tuition is null and nado_fee_percent is null and four_lesson_nado_fee is null and
      four_lesson_teacher_payout is null and teacher_payout_amount is null and pricing_version is null
    )
    or
    (
      lesson_duration_minutes is not null and weekly_frequency is not null and settlement_sessions is not null and
      four_lesson_tuition is not null and nado_fee_percent is not null and four_lesson_nado_fee is not null and
      four_lesson_teacher_payout is not null and teacher_payout_amount is not null and pricing_version is not null
    )
  );

comment on column public.student_assignments.lesson_duration_minutes is 'Lesson duration in minutes. 60 means the official 60-minute option.';
comment on column public.student_assignments.weekly_frequency is 'Lessons per week: 1 or 2. Pricing remains based on a four-session package.';
comment on column public.student_assignments.settlement_sessions is 'Number of sessions handled by this teacher for first-month payout, 1 to 4.';
comment on column public.student_assignments.four_lesson_tuition is 'Snapshot of student tuition for the 4-session package at assignment time.';
comment on column public.student_assignments.nado_fee_percent is 'Snapshot of first-month NADO fee rate. Current rate: 35 percent.';
comment on column public.student_assignments.four_lesson_nado_fee is 'Snapshot of NADO fee for the 4-session package.';
comment on column public.student_assignments.four_lesson_teacher_payout is 'Snapshot of teacher payout for all 4 sessions.';
comment on column public.student_assignments.teacher_payout_amount is 'Actual planned teacher payout for settlement_sessions, rounded to whole KRW.';
comment on column public.student_assignments.pricing_version is 'Price table identifier used when the assignment was saved.';

commit;

-- 확인용
-- select student_name, plan, lesson_duration_minutes, weekly_frequency, settlement_sessions,
--        four_lesson_tuition, four_lesson_teacher_payout, teacher_payout_amount, pricing_version
-- from public.student_assignments order by created_at desc;
