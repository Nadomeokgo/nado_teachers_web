-- Run after teacher_login_enforcement_update.sql. Every fixture/change rolls back.
-- Uses one existing active teacher inside this transaction; no email is sent.
begin;

do $setup$
declare target uuid; administrator uuid; session_id uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.role='teacher' and (p.is_active is not true or p.account_status <> 'active')
      and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception 'Inactive teacher backfill missing'; end if;
  if exists (
    select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
    where p.role='teacher' and (p.is_active is not true or p.account_status <> 'active')
  ) then raise exception 'Inactive teacher session survived'; end if;
  if has_function_privilege('authenticated','private.sync_teacher_auth_block(uuid)','EXECUTE')
    or has_function_privilege('anon','private.sync_teacher_auth_block(uuid)','EXECUTE')
    or has_table_privilege('authenticated','private.teacher_auth_blocks','SELECT') then
    raise exception 'Private Auth state exposed';
  end if;

  select p.id into target from public.profiles p join auth.users u on u.id=p.id
  where p.role='teacher' and p.is_active and p.account_status='active'
    and u.banned_until is null
  order by exists (select 1 from public.student_assignments a where a.teacher_id=p.id) desc, p.id
  limit 1;
  select id into administrator from public.profiles
  where role='admin' and account_status='active' order by id limit 1;
  if target is null or administrator is null then raise exception 'Verification fixture unavailable'; end if;
  perform set_config('test.teacher_id',target::text,true);
  perform set_config('test.admin_id',administrator::text,true);
  perform set_config('test.session_id',session_id::text,true);
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
  insert into auth.sessions(id,user_id) values (session_id,target);
end;
$setup$;

set local role authenticated;
do $admin_disable$
begin
  if public.set_teacher_active(current_setting('test.teacher_id')::uuid,false) is distinct from false then
    raise exception 'Admin deactivation failed';
  end if;
end;
$admin_disable$;
reset role;

do $disabled_state$
declare target uuid := current_setting('test.teacher_id')::uuid;
begin
  if not exists (select 1 from auth.users where id=target and banned_until > now()+interval '99 years') then
    raise exception 'Auth ban missing';
  end if;
  if exists (select 1 from auth.sessions where user_id=target) then raise exception 'Sessions were not revoked'; end if;
  if not exists (select 1 from private.teacher_auth_blocks where teacher_id=target and previous_banned_until is null) then
    raise exception 'Prior ban was not captured';
  end if;
  perform set_config('request.jwt.claim.sub',target::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'role','authenticated')::text,true);
end;
$disabled_state$;

set local role authenticated;
do $stale_jwt$
declare target uuid := current_setting('test.teacher_id')::uuid; affected integer;
begin
  if private.is_teacher_access_allowed() then raise exception 'Inactive eligibility passed'; end if;
  if (select count(*) from public.profiles where id=target) <> 1 then raise exception 'Own profile status unavailable'; end if;
  if exists (select 1 from public.profiles where id<>target)
     or exists (select 1 from public.availability)
     or exists (select 1 from public.resources)
     or exists (select 1 from public.curriculum_lessons)
     or exists (select 1 from public.student_assignments)
     or exists (select 1 from storage.objects) then
    raise exception 'Inactive JWT can still read protected data';
  end if;
  if public.can_read_member_resources() then raise exception 'Inactive resource RPC access'; end if;
  update public.profiles set updated_at=now() where id=target;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Inactive JWT can still update profile'; end if;
  begin
    perform public.set_teacher_active(target,true);
    raise exception 'Teacher self-reactivation RPC allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set is_active=true,account_status='active',role='admin' where id=target;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Teacher self-reactivation update allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    perform private.sync_teacher_auth_block(target);
    raise exception 'Private Auth sync callable';
  exception when insufficient_privilege then null; end;
  begin
    perform public.p2_staff_students();
    raise exception 'Inactive staff RPC allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_audio_feedback(gen_random_uuid(),'verification','reviewed');
    raise exception 'Inactive feedback RPC allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_seoul_service_area('Verification must not be inserted');
    raise exception 'Inactive area mutation RPC allowed';
  exception when insufficient_privilege then null; end;
end;
$stale_jwt$;
reset role;

do $admin_context$
declare administrator uuid := current_setting('test.admin_id')::uuid;
begin
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
end;
$admin_context$;
set local role authenticated;
do $admin_enable$
begin
  if public.set_teacher_active(current_setting('test.teacher_id')::uuid,true) is distinct from true then
    raise exception 'Admin reactivation failed';
  end if;
end;
$admin_enable$;
reset role;

do $restoration$
declare target uuid := current_setting('test.teacher_id')::uuid;
  prior_ban timestamptz := now()+interval '7 days';
  independent_ban timestamptz := now()+interval '14 days';
begin
  if exists (select 1 from auth.users where id=target and banned_until is not null)
     or exists (select 1 from private.teacher_auth_blocks where teacher_id=target) then
    raise exception 'Ordinary reactivation did not restore login';
  end if;

  -- An already-existing Auth ban survives a deactivate/reactivate cycle.
  update auth.users set banned_until=prior_ban where id=target;
  perform public.set_teacher_active(target,false);
  perform public.set_teacher_active(target,true);
  if (select banned_until from auth.users where id=target) is distinct from prior_ban then
    raise exception 'Pre-existing Auth ban lost';
  end if;

  -- An independent Auth administrator change made after our ban also survives.
  perform public.set_teacher_active(target,false);
  update auth.users set banned_until=independent_ban where id=target;
  perform public.set_teacher_active(target,true);
  if (select banned_until from auth.users where id=target) is distinct from independent_ban then
    raise exception 'Independent Auth ban lost';
  end if;

  -- Repeating a disabled update preserves the independent value for restoration.
  update auth.users set banned_until=null where id=target;
  perform public.set_teacher_active(target,false);
  update auth.users set banned_until=independent_ban where id=target;
  perform public.set_teacher_active(target,false);
  perform public.set_teacher_active(target,true);
  if (select banned_until from auth.users where id=target) is distinct from independent_ban then
    raise exception 'Repeated deactivation lost independent ban';
  end if;

  -- is_active alone cannot undo a suspended/expired account_status.
  update auth.users set banned_until=null where id=target;
  update public.profiles set account_status='suspended' where id=target;
  perform public.set_teacher_active(target,false);
  perform public.set_teacher_active(target,true);
  if not exists (select 1 from public.profiles where id=target and account_status='suspended')
     or not exists (select 1 from auth.users where id=target and banned_until>now()) then
    raise exception 'Suspension was cleared by reactivation';
  end if;
  update public.profiles set account_status='expired' where id=target;
  if not exists (select 1 from auth.users where id=target and banned_until>now()) then
    raise exception 'Expired account lost Auth block';
  end if;
  update public.profiles set account_status='active' where id=target;
  if exists (select 1 from auth.users where id=target and banned_until is not null) then
    raise exception 'Eligible teacher did not regain login';
  end if;
  if not private.is_teacher_access_allowed() then raise exception 'Admin was restricted'; end if;
  perform set_config('request.jwt.claim.sub',target::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'role','authenticated')::text,true);
  if not private.is_teacher_access_allowed() then raise exception 'Active teacher was restricted'; end if;
end;
$restoration$;

select 'teacher_login_enforcement: all assertions passed; rolling back fixtures' as verification;
rollback;
