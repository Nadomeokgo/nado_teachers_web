-- NADO Teachers: paid one-session trials and private administrator characteristics.
-- Existing assignments and teacher classifications are not rewritten.

begin;

alter table public.student_assignments
  drop constraint if exists student_assignments_assignment_type_check;
alter table public.student_assignments
  add constraint student_assignments_assignment_type_check
  check (assignment_type in ('regular', 'trial', 'paid_trial'));

-- Preserve legacy regular records without a pricing snapshot, complete regular
-- snapshots, and the separate free-trial snapshot whose package amounts are null.
alter table public.student_assignments
  drop constraint if exists student_assignments_pricing_snapshot_complete;
alter table public.student_assignments
  add constraint student_assignments_pricing_snapshot_complete
  check (
    (
      assignment_type = 'regular'
      and lesson_duration_minutes is null and weekly_frequency is null and settlement_sessions is null
      and four_lesson_tuition is null and nado_fee_percent is null and four_lesson_nado_fee is null
      and four_lesson_teacher_payout is null and teacher_payout_amount is null and pricing_version is null
    )
    or (
      assignment_type in ('regular', 'paid_trial')
      and lesson_duration_minutes is not null and weekly_frequency is not null and settlement_sessions is not null
      and four_lesson_tuition is not null and nado_fee_percent is not null and four_lesson_nado_fee is not null
      and four_lesson_teacher_payout is not null and teacher_payout_amount is not null and pricing_version is not null
    )
    or (
      assignment_type = 'trial'
      and lesson_duration_minutes is not null and weekly_frequency is not null and settlement_sessions is not null
      and four_lesson_tuition is null and nado_fee_percent is null and four_lesson_nado_fee is null
      and four_lesson_teacher_payout is null and teacher_payout_amount is not null and pricing_version is not null
    )
  );

-- Paid trials retain the ordinary four-session snapshot for audit/history.
-- Only the actual payout is divided by four, using ordinary whole-won rounding.
alter table public.student_assignments
  drop constraint if exists student_assignments_paid_trial_shape_check;
alter table public.student_assignments
  add constraint student_assignments_paid_trial_shape_check
  check (
    assignment_type <> 'paid_trial' or (
      plan in ('economy', 'standard', 'premium')
      and lesson_duration_minutes in (60, 120)
      and weekly_frequency = 1
      and settlement_sessions = 1
      and group_size between 1 and 4
      and (plan <> 'premium' or group_size = 1)
      and four_lesson_tuition > 0
      and nado_fee_percent between 0 and 100
      and four_lesson_nado_fee = round(four_lesson_tuition::numeric * nado_fee_percent / 100)
      and four_lesson_teacher_payout = four_lesson_tuition - four_lesson_nado_fee
      and teacher_payout_amount = round(four_lesson_teacher_payout::numeric / 4)
      and nullif(btrim(pricing_version), '') is not null
    ) is true
  );

comment on column public.student_assignments.assignment_type is
  'regular: recurring package; trial: free Economy trial; paid_trial: one paid session at the selected plan rate.';
comment on column public.student_assignments.four_lesson_tuition is
  'Base four-session tuition snapshot, including for paid_trial. Paid-trial student tuition is this amount divided by four.';

-- Keep these attributes in the existing administrator-only table. NULL means
-- unclassified, and no characteristic is inferred from names or profile data.
alter table public.teacher_admin_nicknames
  add column if not exists gender text,
  add column if not exists nationality_group text;
alter table public.teacher_admin_nicknames
  drop constraint if exists teacher_admin_gender_check;
alter table public.teacher_admin_nicknames
  add constraint teacher_admin_gender_check
  check (gender is null or gender in ('female', 'male'));
alter table public.teacher_admin_nicknames
  drop constraint if exists teacher_admin_nationality_group_check;
alter table public.teacher_admin_nicknames
  add constraint teacher_admin_nationality_group_check
  check (nationality_group is null or nationality_group in ('korean', 'foreign'));

comment on column public.teacher_admin_nicknames.gender is
  'Private administrator classification: female, male, or NULL when unclassified.';
comment on column public.teacher_admin_nicknames.nationality_group is
  'Private administrator classification: korean, foreign, or NULL when unclassified.';

-- Preserve the existing policies; all columns share their administrator-only RLS.
alter table public.teacher_admin_nicknames enable row level security;

commit;
