-- Inactive teachers cannot sign in or keep using a previously issued JWT.
-- Apply after the deployed student/member, teacher activation, and curriculum setup.
-- Existing set_teacher_active(uuid, boolean) remains the admin-only entry point.
--
-- Auth integration deliberately writes only auth.users.banned_until, the field
-- Supabase Auth's User.Ban/IsBanned use, and deletes that user's Auth sessions.
-- No auth schema objects are replaced. All custom objects live in private/public.
-- The private ledger restores only our own ban; independent bans are preserved.
begin;

do $prerequisites$
begin
  if to_regprocedure('public.set_teacher_active(uuid,boolean)') is null
     or to_regprocedure('public.protect_profile_authorization_fields()') is null
     or to_regprocedure('public.can_read_member_resources()') is null
     or to_regclass('auth.sessions') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema='auth' and table_name='users' and column_name='banned_until'
         and data_type='timestamp with time zone'
     ) then
    raise exception 'Apply the existing account-status and teacher activation setup first';
  end if;
end;
$prerequisites$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.teacher_auth_blocks (
  teacher_id uuid primary key references auth.users(id) on delete cascade,
  previous_banned_until timestamptz,
  applied_banned_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.teacher_auth_blocks enable row level security;
revoke all on private.teacher_auth_blocks from public, anon, authenticated;

-- SECURITY DEFINER avoids recursive profile RLS. The only input is auth.uid();
-- callers cannot inspect another user's status or choose a different identity.
-- Missing profiles remain eligible for the existing new-user provisioning flow.
create or replace function private.is_teacher_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher'
      and (p.is_active is not true or p.account_status is distinct from 'active')
  );
$function$;
revoke all on function private.is_teacher_access_allowed() from public, anon, authenticated;
grant execute on function private.is_teacher_access_allowed() to authenticated;

-- Only the profile trigger and the migration can call this function. It is not
-- an RPC, and neither authenticated nor anon has permission to execute it.
create or replace function private.sync_teacher_auth_block(target_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  must_block boolean;
  current_ban timestamptz;
  next_ban timestamptz;
  owned_block private.teacher_auth_blocks%rowtype;
begin
  select p.role = 'teacher'
    and (p.is_active is not true or p.account_status is distinct from 'active')
    into must_block
  from public.profiles p where p.id = target_teacher_id;

  -- Serialize with an independent Auth administrator changing the same user.
  select u.banned_until into current_ban
  from auth.users u where u.id = target_teacher_id for update;
  if not found then return; end if;

  select * into owned_block from private.teacher_auth_blocks
  where teacher_id = target_teacher_id for update;

  if must_block is true then
    if owned_block.teacher_id is null then
      next_ban := greatest(current_ban, now() + interval '876000 hours');
      insert into private.teacher_auth_blocks (
        teacher_id, previous_banned_until, applied_banned_until
      ) values (target_teacher_id, current_ban, next_ban);
    elsif current_ban is distinct from owned_block.applied_banned_until then
      -- An independent ban changed after ours. Remember that value so a later
      -- teacher reactivation does not erase the independent administrator action.
      next_ban := greatest(current_ban, now() + interval '876000 hours');
      update private.teacher_auth_blocks set
        previous_banned_until = current_ban,
        applied_banned_until = next_ban,
        updated_at = now()
      where teacher_id = target_teacher_id;
    else
      next_ban := owned_block.applied_banned_until;
    end if;

    update auth.users set banned_until = next_ban
    where id = target_teacher_id and banned_until is distinct from next_ban;
    -- refresh_tokens.session_id has ON DELETE CASCADE. Previously issued access
    -- JWTs are denied separately by the live-profile RLS/RPC gates below.
    delete from auth.sessions where user_id = target_teacher_id;
  elsif owned_block.teacher_id is not null then
    -- Restoring a teacher never sets account_status to active and never clears
    -- an Auth ban that was changed independently after this feature applied it.
    update auth.users set banned_until = owned_block.previous_banned_until
    where id = target_teacher_id
      and banned_until is not distinct from owned_block.applied_banned_until;
    delete from private.teacher_auth_blocks where teacher_id = target_teacher_id;
  end if;
end;
$function$;
revoke all on function private.sync_teacher_auth_block(uuid) from public, anon, authenticated;

create or replace function private.sync_teacher_profile_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.sync_teacher_auth_block(new.id);
  return new;
end;
$function$;
revoke all on function private.sync_teacher_profile_auth() from public, anon, authenticated;

drop trigger if exists profiles_sync_teacher_auth on public.profiles;
create trigger profiles_sync_teacher_auth
after insert or update of role, is_active, account_status on public.profiles
for each row execute function private.sync_teacher_profile_auth();

-- Restrictive policies only remove access from disabled teacher callers. They
-- grant no access, and preserve existing student/admin/public-directory rules.
-- Use an initplan so the eligibility check runs once per SQL statement.
do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'announcements', 'assignment_files', 'audio_consents', 'audio_submissions',
    'availability', 'curriculum_lessons', 'curriculum_settings',
    'learning_ai_jobs', 'learning_assessments', 'learning_consents',
    'learning_error_events', 'learning_flashcards', 'learning_profiles',
    'learning_reviews', 'learning_tasks', 'plan_entitlements',
    'portal_notifications', 'practice_modules', 'practice_progress',
    'practice_quiz_attempts', 'practice_usage_ledger', 'resources',
    'student_assignments', 'student_records', 'teacher_agreement_versions',
    'teacher_agreements', 'teacher_intro_videos', 'teacher_profile_public_details',
    'teacher_service_areas', 'training_videos'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop policy if exists inactive_teacher_access_gate on public.%I', table_name);
      execute format(
        'create policy inactive_teacher_access_gate on public.%I as restrictive for all to authenticated using ((select private.is_teacher_access_allowed())) with check ((select private.is_teacher_access_allowed()))',
        table_name
      );
    end if;
  end loop;
end;
$policies$;

drop policy if exists inactive_teacher_access_gate on storage.objects;
create policy inactive_teacher_access_gate on storage.objects
as restrictive for all to authenticated
using ((select private.is_teacher_access_allowed()))
with check ((select private.is_teacher_access_allowed()));

-- The client may still read its own profile to explain why access was denied.
-- All profile writes and reads of other profiles are blocked for inactive teachers.
drop policy if exists inactive_teacher_profile_read_gate on public.profiles;
create policy inactive_teacher_profile_read_gate on public.profiles
as restrictive for select to authenticated
using (id = (select auth.uid()) or (select private.is_teacher_access_allowed()));
drop policy if exists inactive_teacher_profile_insert_gate on public.profiles;
create policy inactive_teacher_profile_insert_gate on public.profiles
as restrictive for insert to authenticated
with check ((select private.is_teacher_access_allowed()));
drop policy if exists inactive_teacher_profile_update_gate on public.profiles;
create policy inactive_teacher_profile_update_gate on public.profiles
as restrictive for update to authenticated
using ((select private.is_teacher_access_allowed()))
with check ((select private.is_teacher_access_allowed()));
drop policy if exists inactive_teacher_profile_delete_gate on public.profiles;
create policy inactive_teacher_profile_delete_gate on public.profiles
as restrictive for delete to authenticated
using ((select private.is_teacher_access_allowed()));

-- These helpers also run from SECURITY DEFINER RPCs, which bypass table RLS.
create or replace function public.can_access_assignment(target_assignment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.is_teacher_access_allowed() and (
    public.is_admin() or exists (
      select 1 from public.student_assignments a
      left join public.student_records s on s.id = a.student_id
      where a.id = target_assignment_id and a.status = 'active'
        and (a.teacher_id = auth.uid()
          or (s.auth_user_id = auth.uid() and s.status = 'active'))
    )
  );
$function$;

create or replace function public.can_read_assignment(target_assignment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.is_teacher_access_allowed() and (
    public.is_admin() or exists (
      select 1 from public.student_assignments a
      left join public.student_records s on s.id = a.student_id
      where a.id = target_assignment_id
        and (a.teacher_id = auth.uid()
          or (a.status = 'active' and s.auth_user_id = auth.uid() and s.status = 'active'))
    )
  );
$function$;

create or replace function public.can_read_member_resources()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.is_teacher_access_allowed() and (
    public.is_admin() or public.is_active_student() or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'teacher' and account_status = 'active'
        and is_active is true
    )
  );
$function$;

-- Inactive teacher RPC gates. Include after private.is_teacher_access_allowed()
-- is installed. CREATE OR REPLACE preserves each existing function grant.
-- Public teacher directories and area catalog reads remain public.

CREATE OR REPLACE FUNCTION public.can_read_student_record(target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_teacher_access_allowed() and (
    public.is_admin()
    or exists (
      select 1
      from public.student_records s
      left join public.student_assignments a
        on a.student_id = s.id
        and a.status = 'active'
      where s.id = target_student_id
        and (
          s.auth_user_id = auth.uid()
          or a.teacher_id = auth.uid()
        )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_read_assigned_profile(target_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_teacher_access_allowed() and (
    exists (
    select 1
    from public.student_assignments a
    left join public.student_records s
      on s.id = a.student_id
    where a.status = 'active'
      and (
        (
          a.teacher_id = target_profile_id
          and s.auth_user_id = auth.uid()
        )
        or (
          s.auth_user_id = target_profile_id
          and a.teacher_id = auth.uid()
        )
      )
  )
  );
$function$;

CREATE OR REPLACE FUNCTION public.p2_can_view_student(target_student uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_teacher_access_allowed() and (
    public.p2_is_admin() or
  (public.p2_enrolled(target_student) and (
    target_student=public.p2_my_student() or exists(
     select 1 from public.student_assignments a join public.profiles p on p.id=a.teacher_id
     where a.student_id=target_student and a.status='active' and a.assignment_type='regular'
     and a.teacher_id=auth.uid() and p.role='teacher' and p.account_status='active')))
  );
$function$;

CREATE OR REPLACE FUNCTION public.p2_can_manage_student(target_student uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_teacher_access_allowed() and (
    public.p2_is_admin() or (public.p2_can_view_student(target_student) and exists(
  select 1 from public.profiles where id=auth.uid() and role='teacher' and account_status='active'))
  );
$function$;

CREATE OR REPLACE FUNCTION public.p2_staff_students()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; begin
  if not private.is_teacher_access_allowed() then
    raise exception 'Teacher account is inactive' using errcode = '42501';
  end if;

 if not public.p2_is_admin() and not exists(select 1 from public.profiles where id=auth.uid() and role='teacher' and account_status='active') then raise exception 'STAFF_ACCESS_REQUIRED'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
  select s.id,s.full_name,s.status,s.auth_user_id,public.p2_student_plan(s.id) as plan,
   coalesce((select enabled from public.learning_beta_students b where b.student_id=s.id),false) as beta_enabled
  from public.student_records s where public.p2_is_admin() or public.p2_can_manage_student(s.id) order by s.full_name,s.id) x;
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.save_audio_feedback(target_submission_id uuid, feedback_text text, next_status text DEFAULT 'reviewed'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.audio_submissions;
  assignment_teacher uuid;
  assignment_status text;
  notification_kind text;
begin
  if not private.is_teacher_access_allowed() then
    raise exception 'Teacher account is inactive' using errcode = '42501';
  end if;

  if next_status not in ('reviewed','completed','rerecord_requested') then
    raise exception 'invalid feedback status';
  end if;
  if char_length(coalesce(feedback_text, '')) > 5000 then
    raise exception 'feedback is too long';
  end if;

  select * into target from public.audio_submissions where id = target_submission_id;
  if target.id is null then raise exception 'submission not found'; end if;
  select teacher_id, status into assignment_teacher, assignment_status from public.student_assignments where id = target.assignment_id;
  if not public.is_admin() and (
    auth.uid() is null
    or assignment_teacher is distinct from auth.uid()
    or assignment_status is distinct from 'active'
  ) then
    raise exception 'teacher access required';
  end if;

  update public.audio_submissions set
    teacher_feedback = nullif(btrim(feedback_text), ''),
    feedback_by = auth.uid(),
    feedback_at = now(),
    status = next_status,
    updated_at = now()
  where id = target_submission_id;

  notification_kind := case when next_status = 'rerecord_requested'
    then 'rerecord_requested' else 'teacher_feedback' end;
  insert into public.portal_notifications (
    recipient_id, actor_id, audio_submission_id, notification_type, title, body
  ) values (
    target.student_auth_user_id, auth.uid(), target_submission_id, notification_kind,
    case when next_status = 'rerecord_requested' then '선생님이 재녹음을 요청했어요'
         else '선생님 피드백이 도착했어요' end,
    nullif(btrim(feedback_text), '')
  ) on conflict (recipient_id, audio_submission_id, notification_type) do update set
    actor_id = excluded.actor_id,
    title = excluded.title,
    body = excluded.body,
    read_at = null,
    created_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_seoul_service_area(p_label text)
 RETURNS TABLE(code text, label text, is_system boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_label text := trim(regexp_replace(coalesce(p_label,''), '\s+', ' ', 'g'));
  v_key text;
  v_alias_code text;
  v_existing public.seoul_service_area_catalog%rowtype;
begin
  if not private.is_teacher_access_allowed() then
    raise exception 'Teacher account is inactive' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  v_key := regexp_replace(lower(v_label), '[[:space:]_\-]+', '', 'g');

  v_alias_code := case v_key
    when 'gangnam' then 'Gangnam'
    when 'gangnamgu' then 'Gangnam'
    when '강남' then 'Gangnam'
    when '강남구' then 'Gangnam'
    when 'seocho' then 'Seocho'
    when 'seochogu' then 'Seocho'
    when '서초' then 'Seocho'
    when '서초구' then 'Seocho'
    when 'daechi' then 'Daechi'
    when 'daechidong' then 'Daechi'
    when '대치' then 'Daechi'
    when '대치동' then 'Daechi'
    when 'jamsil' then 'Jamsil'
    when 'jamsildong' then 'Jamsil'
    when '잠실' then 'Jamsil'
    when '잠실동' then 'Jamsil'
    when 'hanti' then 'Hanti'
    when '한티' then 'Hanti'
    when 'yeongdeungpo' then 'Yeongdeungpo-gu'
    when 'yeongdeungpogu' then 'Yeongdeungpo-gu'
    when '영등포' then 'Yeongdeungpo-gu'
    when '영등포구' then 'Yeongdeungpo-gu'
    when 'seonyudo' then 'Seonyudo'
    when '선유도' then 'Seonyudo'
    when 'yangcheon' then 'Yangcheon-gu'
    when 'yangcheongu' then 'Yangcheon-gu'
    when '양천' then 'Yangcheon-gu'
    when '양천구' then 'Yangcheon-gu'
    when 'hapjeong' then 'Hapjeong'
    when 'hapjeongdong' then 'Hapjeong'
    when '합정' then 'Hapjeong'
    when '합정동' then 'Hapjeong'
    when 'hongdae' then 'Hongdae'
    when '홍대' then 'Hongdae'
    when 'sinchon' then 'Sinchon'
    when '신촌' then 'Sinchon'
    when 'yongsan' then 'Yongsan'
    when 'yongsangu' then 'Yongsan'
    when '용산' then 'Yongsan'
    when '용산구' then 'Yongsan'
    when 'line3vicinity' then 'Line 3 vicinity'
    when '3호선인근' then 'Line 3 vicinity'
    when '3호선' then 'Line 3 vicinity'
    else null
  end;

  if v_alias_code is not null then
    select * into v_existing
    from public.seoul_service_area_catalog c
    where c.code = v_alias_code
    limit 1;
  else
    select * into v_existing
    from public.seoul_service_area_catalog c
    where regexp_replace(lower(trim(c.label)), '[[:space:]_\-]+', '', 'g') = v_key
       or regexp_replace(lower(trim(c.code)), '[[:space:]_\-]+', '', 'g') = v_key
    limit 1;
  end if;

  if found then
    if not v_existing.active then
      update public.seoul_service_area_catalog
      set active = true
      where public.seoul_service_area_catalog.code = v_existing.code
      returning * into v_existing;
    end if;
    return query select v_existing.code, v_existing.label, v_existing.is_system;
    return;
  end if;

  if char_length(v_label) < 1 or char_length(v_label) > 30 then
    raise exception 'AREA_LABEL_LENGTH';
  end if;

  insert into public.seoul_service_area_catalog(code, label, is_system, created_by, active)
  values (v_label, v_label, false, auth.uid(), true)
  returning * into v_existing;

  return query select v_existing.code, v_existing.label, v_existing.is_system;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_incheon_service_area(p_label text)
 RETURNS TABLE(code text, label text, is_system boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_label text := trim(regexp_replace(coalesce(p_label,''), '\s+', ' ', 'g'));
  v_key text;
  v_alias_code text;
  v_existing public.incheon_service_area_catalog%rowtype;
begin
  if not private.is_teacher_access_allowed() then
    raise exception 'Teacher account is inactive' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  v_key := regexp_replace(lower(v_label), '[[:space:]_\-]+', '', 'g');

  v_alias_code := case v_key
    when 'songdo' then 'Songdo'
    when 'songdodong' then 'Songdo'
    when '송도' then 'Songdo'
    when '송도동' then 'Songdo'
    when 'guwol' then '구월동'
    when 'guwoldong' then '구월동'
    when 'guweol' then '구월동'
    when 'guweoldong' then '구월동'
    when '구월' then '구월동'
    when '구월동' then '구월동'
    else null
  end;

  if v_alias_code is not null then
    select * into v_existing
    from public.incheon_service_area_catalog c
    where c.code = v_alias_code
    limit 1;
  else
    select * into v_existing
    from public.incheon_service_area_catalog c
    where regexp_replace(lower(trim(c.label)), '[[:space:]_\-]+', '', 'g') = v_key
       or regexp_replace(lower(trim(c.code)), '[[:space:]_\-]+', '', 'g') = v_key
    limit 1;
  end if;

  if found then
    if not v_existing.active then
      update public.incheon_service_area_catalog
      set active = true
      where public.incheon_service_area_catalog.code = v_existing.code
      returning * into v_existing;
    end if;
    return query select v_existing.code, v_existing.label, v_existing.is_system;
    return;
  end if;

  if char_length(v_label) < 1 or char_length(v_label) > 30 then
    raise exception 'AREA_LABEL_LENGTH';
  end if;

  insert into public.incheon_service_area_catalog(code, label, is_system, created_by, active)
  values (v_label, v_label, false, auth.uid(), true)
  returning * into v_existing;

  return query select v_existing.code, v_existing.label, v_existing.is_system;
end;
$function$;

CREATE OR REPLACE FUNCTION public.p2_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid:=public.p2_my_student(); s public.learning_settings; limits public.learning_plan_limits; begin
  if not private.is_teacher_access_allowed() then
    raise exception 'Teacher account is inactive' using errcode = '42501';
  end if;

 if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
 select * into s from public.learning_settings where id;
 select * into limits from public.learning_plan_limits where plan=public.p2_student_plan(sid);
 return jsonb_build_object('student_id',sid,'is_admin',public.p2_is_admin(),
 'available',coalesce(public.p2_enrolled(sid),false),'enabled',s.enabled,
 'pronunciation_enabled',s.pronunciation_enabled,'assessment_enabled',s.assessment_enabled,
 'plan',case when sid is not null then public.p2_student_plan(sid) else null end,
 'limits',to_jsonb(limits),
 'usage',jsonb_build_object(
  'pronunciation_week_used',(select count(*) from public.learning_ai_jobs where student_id=sid and kind='pronunciation' and created_at>=(date_trunc('week',timezone('Asia/Seoul',now())) at time zone 'Asia/Seoul')),
  'assessment_month_used',(select count(*) from public.learning_assessments where student_id=sid and started_at>=(date_trunc('month',timezone('Asia/Seoul',now())) at time zone 'Asia/Seoul'))),
 'consent_version','pronunciation-azure-beta-v1',
 'message',case when sid is null then '활성 정규 학생 연결을 확인해주세요.' when not s.enabled then '2단계 기능은 아직 공개 전입니다.' when not public.p2_enrolled(sid) then '2단계 테스트 대상 계정이 아닙니다.' else '' end);
end; $function$;

CREATE OR REPLACE FUNCTION public.mark_portal_notification_read(target_notification_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.portal_notifications set read_at = coalesce(read_at, now())
  where id = target_notification_id
    and private.is_teacher_access_allowed()
    and (recipient_id = auth.uid() or public.is_admin());
$function$;




-- Apply the same transactional ban to teachers disabled before this migration.
-- Active teachers, students, and administrators are never included in backfill.
do $backfill$
declare teacher_id uuid;
begin
  for teacher_id in
    select id from public.profiles
    where role = 'teacher'
      and (is_active is not true or account_status is distinct from 'active')
  loop
    perform private.sync_teacher_auth_block(teacher_id);
  end loop;
end;
$backfill$;

commit;
