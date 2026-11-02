-- All test records and changes are rolled back; no accounts or invitations.
begin;

do $setup$
declare teacher uuid; administrator uuid; assignment uuid := gen_random_uuid();
begin
  select id into teacher from public.profiles
  where role='teacher' and is_active and account_status='active' order by id limit 1;
  select id into administrator from public.profiles
  where role='admin' and account_status='active' order by id limit 1;
  if teacher is null or administrator is null then raise exception 'Verification identity missing'; end if;
  perform set_config('test.teacher_id',teacher::text,true);
  perform set_config('test.assignment_id',assignment::text,true);
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
end;
$setup$;

set local role authenticated;
do $admin$
declare assignment uuid := current_setting('test.assignment_id')::uuid;
begin
  insert into public.student_assignments(id,teacher_id,student_name,first_lesson_date,settlement_date)
  values (assignment,current_setting('test.teacher_id')::uuid,'Payment verification',current_date,current_date+30);
  if (select payment_status from public.student_assignments where id=assignment) is distinct from 'unpaid' then
    raise exception 'New assignment default is not unpaid';
  end if;
  update public.student_assignments set payment_status='paid' where id=assignment;
  if (select payment_status from public.student_assignments where id=assignment) is distinct from 'paid' then
    raise exception 'Admin paid status was not saved';
  end if;
  update public.student_assignments set payment_status='unpaid' where id=assignment;
  if (select payment_status from public.student_assignments where id=assignment) is distinct from 'unpaid' then
    raise exception 'Admin unpaid status was not saved';
  end if;
  update public.student_assignments set payment_status=null where id=assignment;
  if (select payment_status from public.student_assignments where id=assignment) is not null then
    raise exception 'Legacy unknown state was not preserved';
  end if;
  begin
    update public.student_assignments set payment_status='invalid' where id=assignment;
    raise exception 'Invalid payment status was accepted';
  exception when check_violation then null; end;
end;
$admin$;
reset role;

do $teacher_context$
declare teacher uuid := current_setting('test.teacher_id')::uuid;
begin
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'role','authenticated')::text,true);
end;
$teacher_context$;
set local role authenticated;
do $teacher_denied$
declare affected integer;
begin
  update public.student_assignments set payment_status='paid'
  where id=current_setting('test.assignment_id')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Teacher changed payment status'; end if;
  begin
    insert into public.student_assignments(teacher_id,student_name,first_lesson_date,settlement_date,payment_status)
    values(current_setting('test.teacher_id')::uuid,'Unauthorized payment',current_date,current_date+30,'paid');
    raise exception 'Teacher inserted payment status';
  exception when insufficient_privilege then null; end;
end;
$teacher_denied$;
reset role;

select 'Payment status defaults, admin updates, validation and teacher write denial passed; rolling back.' as verification;
rollback;
