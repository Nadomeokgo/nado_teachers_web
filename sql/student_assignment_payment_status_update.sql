-- Manual student tuition tracking. Existing rows intentionally remain unknown.
-- Apply before deploying the updated admin page and assign-student function.
begin;

alter table public.student_assignments
  add column if not exists payment_status text;

-- Set the default separately: do not label historical payments as unpaid.
alter table public.student_assignments
  alter column payment_status set default 'unpaid';

alter table public.student_assignments
  drop constraint if exists student_assignments_payment_status_check;
alter table public.student_assignments
  add constraint student_assignments_payment_status_check
  check (payment_status is null or payment_status in ('unpaid', 'paid'));

comment on column public.student_assignments.payment_status is
  'Manual tuition status for this assignment: unpaid or paid. NULL means not recorded; free trials are displayed as no payment required. Existing admin-only INSERT/UPDATE policies apply.';

notify pgrst, 'reload schema';
commit;
