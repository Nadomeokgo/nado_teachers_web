-- Run after the IGC update. Every fixture and change is rolled back.
-- No accounts, emails or invitations are created.
begin;

do $setup$
declare teacher uuid; administrator uuid;
begin
  select id into teacher from public.profiles
  where role = 'teacher' and is_active and account_status = 'active' order by id limit 1;
  select id into administrator from public.profiles
  where role = 'admin' and account_status = 'active' order by id limit 1;
  if teacher is null or administrator is null then raise exception 'Verification identity missing'; end if;
  perform set_config('test.igc_teacher', teacher::text, true);
  perform set_config('test.igc_assignment', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claim.sub', administrator::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', administrator, 'role', 'authenticated')::text, true);
end;
$setup$;

set local role authenticated;
do $admin$
declare
  assignment uuid := current_setting('test.igc_assignment')::uuid;
  example record;
begin
  insert into public.student_assignments (
    id, teacher_id, student_name, assignment_type, plan,
    lesson_duration_minutes, weekly_frequency, settlement_sessions,
    four_lesson_tuition, nado_fee_percent, four_lesson_nado_fee,
    four_lesson_teacher_payout, teacher_payout_amount, pricing_version,
    first_lesson_date, settlement_date
  ) values (
    assignment, current_setting('test.igc_teacher')::uuid, 'IGC verification', 'regular', 'economy',
    60, 1, 4, 140000, 35, 49000, 91000, 91000, 'NADO-2026-09-GROUP-1TO4',
    current_date, current_date + 31
  );
  if (select igc_discount from public.student_assignments where id = assignment) is distinct from false then
    raise exception 'New ordinary assignment did not default to no discount';
  end if;

  -- Independent expected package amounts, including every plan, 8 sessions,
  -- 120-minute lessons, a group package, and a partial teacher payout.
  for example in select * from (values
    ('economy', 60, 1, 1, 4, 130000, 45500, 84500, 84500),
    ('standard', 60, 1, 1, 4, 170000, 59500, 110500, 110500),
    ('premium', 60, 1, 1, 4, 210000, 73500, 136500, 136500),
    ('economy', 60, 2, 1, 8, 270000, 94500, 175500, 175500),
    ('economy', 120, 1, 1, 4, 270000, 94500, 175500, 175500),
    ('premium', 120, 2, 1, 8, 870000, 304500, 565500, 565500),
    ('economy', 60, 1, 2, 4, 190000, 66500, 123500, 123500),
    ('economy', 60, 1, 1, 3, 130000, 45500, 84500, 63375)
  ) as cases(plan, minutes, weekly, members, sessions, tuition, fee, full_payout, payout)
  loop
    update public.student_assignments set
      igc_discount = true, plan = example.plan,
      lesson_duration_minutes = example.minutes, weekly_frequency = example.weekly,
      group_size = example.members, settlement_sessions = example.sessions,
      four_lesson_tuition = example.tuition / example.weekly,
      four_lesson_nado_fee = example.fee / example.weekly,
      four_lesson_teacher_payout = example.full_payout / example.weekly,
      teacher_payout_amount = example.payout,
      pricing_version = 'NADO-2026-11-IGC-10000'
    where id = assignment;
    if not exists (
      select 1 from public.student_assignments where id = assignment and igc_discount
      and four_lesson_tuition * weekly_frequency = example.tuition
      and four_lesson_nado_fee * weekly_frequency = example.fee
      and teacher_payout_amount = example.payout
    ) then raise exception 'IGC saved pricing mismatch'; end if;
  end loop;

  update public.student_assignments set payment_status = 'paid' where id = assignment;
  if not exists (select 1 from public.student_assignments where id = assignment
    and igc_discount and four_lesson_tuition = 130000 and teacher_payout_amount = 63375
    and payment_status = 'paid') then raise exception 'Unrelated edit lost discount'; end if;

  begin
    update public.student_assignments set
      four_lesson_tuition = 140000, four_lesson_nado_fee = 49000,
      four_lesson_teacher_payout = 91000, teacher_payout_amount = 68250
    where id = assignment;
    raise exception 'Gross price accepted while discount flag remained true';
  exception when check_violation then null; end;
  begin
    update public.student_assignments set nado_fee_percent = 30 where id = assignment;
    raise exception 'IGC non-35-percent fee accepted';
  exception when check_violation then null; end;
  begin
    update public.student_assignments set teacher_payout_amount = 63376 where id = assignment;
    raise exception 'Invalid IGC payout accepted';
  exception when check_violation then null; end;
  begin
    update public.student_assignments set
      assignment_type = 'paid_trial', weekly_frequency = 1, settlement_sessions = 1,
      four_lesson_tuition = 140000, four_lesson_nado_fee = 49000,
      four_lesson_teacher_payout = 91000, teacher_payout_amount = 22750,
      pricing_version = 'NADO-PAID-TRIAL-2026-10'
    where id = assignment;
    raise exception 'Paid trial IGC discount accepted';
  exception when check_violation then null; end;
  begin
    update public.student_assignments set
      assignment_type = 'trial', weekly_frequency = 1, settlement_sessions = 1,
      four_lesson_tuition = null, nado_fee_percent = null, four_lesson_nado_fee = null,
      four_lesson_teacher_payout = null, teacher_payout_amount = 20000,
      pricing_version = 'NADO-TRIAL-FREE-20000-2026-08'
    where id = assignment;
    raise exception 'Free trial IGC discount accepted';
  exception when check_violation then null; end;

  update public.student_assignments set igc_discount = false,
    four_lesson_tuition = 140000, four_lesson_nado_fee = 49000,
    four_lesson_teacher_payout = 91000, teacher_payout_amount = 68250,
    pricing_version = 'NADO-2026-09-GROUP-1TO4'
  where id = assignment;
  if not exists (select 1 from public.student_assignments where id = assignment
    and not igc_discount and four_lesson_tuition = 140000) then
    raise exception 'Admin could not remove IGC discount'; end if;
end;
$admin$;
reset role;

do $teacher_context$
declare teacher uuid := current_setting('test.igc_teacher')::uuid;
begin
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', teacher, 'role', 'authenticated')::text, true);
end;
$teacher_context$;
set local role authenticated;
do $teacher$
declare affected integer;
begin
  if not exists (select 1 from public.student_assignments
    where id = current_setting('test.igc_assignment')::uuid) then
    raise exception 'Teacher cannot read own assignment'; end if;
  update public.student_assignments set igc_discount = true,
    four_lesson_tuition = 130000, four_lesson_nado_fee = 45500,
    four_lesson_teacher_payout = 84500, teacher_payout_amount = 63375,
    pricing_version = 'NADO-2026-11-IGC-10000'
  where id = current_setting('test.igc_assignment')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Teacher changed IGC discount'; end if;
end;
$teacher$;
reset role;

select 'PASS: IGC net tuition, 35% fees, all plans, frequency, groups, partial payout, trial rejection, editing and teacher write denial; rolling back.' as verification;
rollback;
