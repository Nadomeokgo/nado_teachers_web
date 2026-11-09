-- IGC regular lessons: KRW 10,000 off one complete 4/8-session package.
-- Apply before deploying the admin page and assign-student function.
begin;

alter table public.student_assignments
  add column if not exists igc_discount boolean not null default false;

alter table public.student_assignments
  drop constraint if exists student_assignments_igc_discount_check;
alter table public.student_assignments
  add constraint student_assignments_igc_discount_check
  check (
    not igc_discount or (
      assignment_type = 'regular'
      and plan in ('economy', 'standard', 'premium')
      and lesson_duration_minutes in (60, 120)
      and weekly_frequency in (1, 2)
      and settlement_sessions between 1 and 4 * weekly_frequency
      and group_size between 1 and 4
      and (plan <> 'premium' or group_size = 1)
      -- Stored four-lesson amounts are the net package amounts normalized to 4.
      and four_lesson_tuition = (
        case plan
          when 'economy' then case group_size
            when 1 then 140000 when 2 then 200000 when 3 then 270000 when 4 then 320000 end
          when 'standard' then case group_size
            when 1 then 180000 when 2 then 260000 when 3 then 360000 when 4 then 440000 end
          when 'premium' then 220000
        end * (lesson_duration_minutes / 60)
        - 10000 / nullif(weekly_frequency, 0)
      )
      and nado_fee_percent = 35
      and four_lesson_nado_fee = round(four_lesson_tuition::numeric * 35 / 100)
      and four_lesson_teacher_payout = four_lesson_tuition - four_lesson_nado_fee
      and teacher_payout_amount = round(four_lesson_teacher_payout::numeric * settlement_sessions / 4)
      and nullif(btrim(pricing_version), '') is not null
    ) is true
  );

comment on column public.student_assignments.igc_discount is
  'Admin-confirmed IGC regular lesson discount: KRW 10,000 once per full 4/8-session package before the 35% fee. four_lesson_* store net amounts normalized to 4 sessions. Never applies to paid or free trials. Existing assignments default to false.';

-- Existing table-wide privileges and admin-only INSERT/UPDATE RLS cover the column.
notify pgrst, 'reload schema';
commit;
