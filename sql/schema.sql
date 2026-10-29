-- =========================================================
-- 나도 Teachers: Supabase 초기 데이터베이스 설정
-- Supabase Dashboard → SQL Editor → New query에 전체 붙여넣고 실행
-- =========================================================

create extension if not exists pgcrypto;

-- 1) 사용자 프로필
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  school text,
  major text,
  phone text,
  kakao_id text,
  bank_name text,
  account_number text,
  bio text,
  experience jsonb not null default '{"teaching":[],"work":[],"internship":[],"activities":[]}'::jsonb,
  profile_photo_path text,
  profile_completed_at timestamptz,
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists profile_completed_at timestamptz;
alter table public.profiles
  add column if not exists kakao_id text;
alter table public.profiles
  add column if not exists profile_photo_path text;
alter table public.profiles
  add column if not exists experience jsonb not null default '{"teaching":[],"work":[],"internship":[],"activities":[]}'::jsonb;

-- 프로필 완료 시 모든 필수 정보가 입력되어 있어야 함
alter table public.profiles
  drop constraint if exists profiles_completion_requires_fields;
alter table public.profiles
  add constraint profiles_completion_requires_fields
  check (
    profile_completed_at is null or role = 'admin' or (
      nullif(btrim(coalesce(full_name, '')), '') is not null and
      nullif(btrim(coalesce(school, '')), '') is not null and
      nullif(btrim(coalesce(major, '')), '') is not null and
      nullif(btrim(coalesce(phone, '')), '') is not null and
      nullif(btrim(coalesce(kakao_id, '')), '') is not null and
      nullif(btrim(coalesce(bank_name, '')), '') is not null and
      account_number ~ '^[0-9-]{8,40}$' and
      nullif(btrim(coalesce(bio, '')), '') is not null
    )
  );

-- 2) 선생님 주간 가능 시간
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text not null default '송도' check (location in ('송도', 'IGC & 트스', '서울')),
  service_area text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_time_range check (start_time < end_time),
  constraint unique_teacher_slot unique (teacher_id, day_of_week, start_time, end_time, location, service_area)
);
create index if not exists availability_teacher_idx on public.availability(teacher_id);
alter table public.availability add column if not exists service_area text;

-- 3) 학생 배정 및 첫 달 수업료 정산 예정일
create table if not exists public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references auth.users(id) on delete set null,
  student_name text not null check (char_length(btrim(student_name)) between 1 and 100),
  student_email text,
  group_size smallint not null default 1 check (group_size between 1 and 4),
  group_members jsonb not null default '[]'::jsonb,
  assignment_type text not null default 'regular' check (assignment_type in ('regular','trial','paid_trial')),
  plan text check (plan in ('economy', 'standard', 'premium')),
  lesson_duration_minutes smallint check (lesson_duration_minutes in (30,35,40,45,60,70,80,90,100,110,120)),
  weekly_frequency smallint check (weekly_frequency in (1,2)),
  settlement_sessions smallint check (settlement_sessions between 1 and 8),
  four_lesson_tuition integer check (four_lesson_tuition >= 0),
  nado_fee_percent numeric(5,2) check (nado_fee_percent between 0 and 100),
  four_lesson_nado_fee integer check (four_lesson_nado_fee >= 0),
  four_lesson_teacher_payout integer check (four_lesson_teacher_payout >= 0),
  teacher_payout_amount integer check (teacher_payout_amount >= 0),
  pricing_version text,
  first_lesson_date date not null,
  settlement_date date not null,
  status text not null default 'active' check (status in ('active','ended','completed')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_assignments_valid_dates check (settlement_date >= first_lesson_date),
  constraint student_assignments_settlement_matches_frequency check (
    weekly_frequency is null or settlement_sessions is null or settlement_sessions <= 4 * weekly_frequency
  )
);
alter table public.student_assignments add column if not exists student_id uuid references auth.users(id) on delete set null;
alter table public.student_assignments add column if not exists student_email text;
alter table public.student_assignments add column if not exists group_size smallint not null default 1;
alter table public.student_assignments add column if not exists group_members jsonb not null default '[]'::jsonb;
alter table public.student_assignments add column if not exists status text not null default 'active';
alter table public.student_assignments add column if not exists ended_at timestamptz;
alter table public.student_assignments add column if not exists assignment_type text;
update public.student_assignments set assignment_type = 'regular' where assignment_type is null;
alter table public.student_assignments alter column assignment_type set default 'regular';
alter table public.student_assignments alter column assignment_type set not null;
alter table public.student_assignments drop constraint if exists student_assignments_assignment_type_check;
alter table public.student_assignments add constraint student_assignments_assignment_type_check check (assignment_type in ('regular','trial','paid_trial'));
alter table public.student_assignments add column if not exists lesson_duration_minutes smallint;
alter table public.student_assignments add column if not exists weekly_frequency smallint;
alter table public.student_assignments add column if not exists settlement_sessions smallint;
alter table public.student_assignments add column if not exists four_lesson_tuition integer;
alter table public.student_assignments add column if not exists nado_fee_percent numeric(5,2);
alter table public.student_assignments add column if not exists four_lesson_nado_fee integer;
alter table public.student_assignments add column if not exists four_lesson_teacher_payout integer;
alter table public.student_assignments add column if not exists teacher_payout_amount integer;
alter table public.student_assignments add column if not exists pricing_version text;

alter table public.student_assignments drop constraint if exists student_assignments_settlement_sessions_check;
alter table public.student_assignments add constraint student_assignments_settlement_sessions_check
  check (settlement_sessions is null or settlement_sessions between 1 and 8);
alter table public.student_assignments drop constraint if exists student_assignments_settlement_matches_frequency;
alter table public.student_assignments add constraint student_assignments_settlement_matches_frequency
  check (
    weekly_frequency is null or settlement_sessions is null or
    settlement_sessions <= 4 * weekly_frequency
  );

alter table public.student_assignments drop constraint if exists student_assignments_trial_shape_check;
alter table public.student_assignments add constraint student_assignments_trial_shape_check
  check (
    assignment_type <> 'trial' or (
      plan = 'economy'
      and lesson_duration_minutes in (60,120)
      and weekly_frequency = 1
      and settlement_sessions = 1
      and teacher_payout_amount = 20000
      and four_lesson_tuition is null
      and nado_fee_percent is null
      and four_lesson_nado_fee is null
      and four_lesson_teacher_payout is null
    )
  );

create index if not exists student_assignments_teacher_idx on public.student_assignments(teacher_id);
create index if not exists student_assignments_first_lesson_idx on public.student_assignments(first_lesson_date);
create index if not exists student_assignments_settlement_idx on public.student_assignments(settlement_date);

create table if not exists public.teacher_service_areas (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  region text not null check (region in ('Songdo', 'IGC_TRIPLE', 'Seoul')),
  area text not null check (char_length(btrim(area)) between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_service_areas_unique unique (teacher_id, region, area)
);
create index if not exists teacher_service_areas_teacher_idx on public.teacher_service_areas(teacher_id, region, active);

-- 4) 공지사항
create table if not exists public.teacher_agreement_versions (
  version text primary key,
  title text not null,
  agreement_text text not null,
  content_hash text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint teacher_agreement_versions_hash_format check (content_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.teacher_agreements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  teacher_name text not null,
  agreement_version text not null references public.teacher_agreement_versions(version),
  confirmations jsonb not null,
  agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint teacher_agreements_teacher_name_required check (char_length(trim(teacher_name)) between 1 and 100),
  constraint teacher_agreements_confirmations_required check (confirmations @> '{"fees":true,"settlement":true,"directPayment":true,"firstMonthPayment":true,"fullAgreement":true}'::jsonb),
  constraint teacher_agreements_teacher_version_unique unique (teacher_id, agreement_version)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  title_en text,
  body_en text,
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

-- 5) 커리큘럼 및 자료 링크
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  title_en text,
  description_en text,
  category text not null default 'PDF',
  file_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6) 교육 영상 링크
create table if not exists public.training_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  title_en text,
  description_en text,
  video_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 다국어 콘텐츠 필드 (기존 프로젝트에도 안전하게 추가)
alter table public.announcements
  add column if not exists title_en text,
  add column if not exists body_en text;
alter table public.resources
  add column if not exists title_en text,
  add column if not exists description_en text;
alter table public.training_videos
  add column if not exists title_en text,
  add column if not exists description_en text;

-- 신규 Auth 사용자가 생성되면 profile 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists availability_updated_at on public.availability;
create trigger availability_updated_at before update on public.availability
for each row execute procedure public.set_updated_at();

drop trigger if exists student_assignments_updated_at on public.student_assignments;
create trigger student_assignments_updated_at before update on public.student_assignments
for each row execute procedure public.set_updated_at();

-- 관리자 여부 확인. RLS 정책 안에서 재귀를 피하기 위해 security definer 사용
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 전자계약 v1.0 원문 및 해시 (버전은 동의 후 수정하지 않고 새 버전으로 추가)
insert into public.teacher_agreement_versions (version, title, agreement_text, content_hash)
values ('v1.0', 'NADO Teacher Service Agreement', $agreement$NADO Teacher Service Agreement
나도 튜터 서비스 이용 및 정산 계약서

본 계약은 NADO(이하 “NADO”)와 NADO Teachers 서비스를 이용하여 학생에게 영어회화 수업을 제공하는 Teacher(이하 “Teacher”) 간의 서비스 이용, 학생 매칭, 수업 운영 및 정산에 관한 사항을 정하는 것을 목적으로 합니다.

제1조. 서비스 및 계약의 목적
1. NADO는 영어회화 수업을 원하는 학생과 Teacher를 연결하는 매칭 서비스를 제공합니다.
2. NADO는 학생 모집, 상담, Teacher 매칭, 첫 달 결제 및 정산, 기타 서비스 운영을 지원합니다.
3. Teacher는 NADO를 통해 매칭된 학생과 직접 영어회화 수업을 진행합니다.
4. 수업은 학생과 Teacher가 협의한 장소 및 시간에 진행하는 것을 원칙으로 합니다.

제2조. Teacher 등록 및 정보
1. Teacher는 NADO Teachers에 본인의 프로필과 가능한 수업 일정을 등록합니다.
2. Teacher는 본인의 일정에 따라 매칭 가능한 시간대를 등록·수정할 수 있습니다.
3. Teacher가 등록하는 학교, 전공, 경력, 언어 능력, 자기소개 및 기타 프로필 정보는 사실에 기반하여야 합니다.
4. Teacher의 학교 또는 소속기관 정보가 NADO Teachers 또는 NADO의 홍보물에 표시되는 경우 이는 Teacher의 개인적인 학력 또는 소속을 설명하기 위한 것이며, 해당 기관과 NADO 사이의 공식적인 제휴·후원 관계를 의미하지 않습니다.
5. 허위 또는 중대한 오류가 있는 프로필 정보가 확인되는 경우 NADO는 정보 수정을 요청하거나 신규 매칭을 제한할 수 있습니다.

제3조. 수업 플랜 및 수업시간
모든 금액은 월 4회 수업 기준이며, Teacher와 학생이 선택한 수업시간 및 플랜에 따라 월 수업료가 결정됩니다.
50~60분 수업의 경우 50분 이상 60분 이하의 수업에 동일한 금액이 적용됩니다.

1. Economy Plan
수업시간 | 월 수업료 | 첫 달 NADO 수수료 | Teacher 첫 달 정산액 | 2개월 차부터 Teacher 수령액
30분 | 80,000원 | 28,000원 | 52,000원 | 80,000원
35분 | 93,333원 | 32,667원 | 60,666원 | 93,333원
40분 | 106,666원 | 37,333원 | 69,333원 | 106,666원
45분 | 120,000원 | 42,000원 | 78,000원 | 120,000원
50~60분 | 140,000원 | 49,000원 | 91,000원 | 140,000원
1시간 10분 | 163,332원 | 57,166원 | 106,166원 | 163,332원
1시간 20분 | 186,664원 | 65,332원 | 121,332원 | 186,664원
1시간 30분 | 209,996원 | 73,499원 | 136,497원 | 209,996원
1시간 40분 | 233,328원 | 81,665원 | 151,663원 | 233,328원
1시간 50분 | 256,660원 | 89,831원 | 166,829원 | 256,660원
2시간 | 280,000원 | 98,000원 | 182,000원 | 280,000원

2. Standard Plan
수업시간 | 월 수업료 | 첫 달 NADO 수수료 | Teacher 첫 달 정산액 | 2개월 차부터 Teacher 수령액
30분 | 100,000원 | 35,000원 | 65,000원 | 100,000원
35분 | 116,666원 | 40,833원 | 75,833원 | 116,666원
40분 | 133,332원 | 46,666원 | 86,666원 | 133,332원
45분 | 150,000원 | 52,500원 | 97,500원 | 150,000원
50~60분 | 180,000원 | 63,000원 | 117,000원 | 180,000원
1시간 10분 | 210,000원 | 73,500원 | 136,500원 | 210,000원
1시간 20분 | 240,000원 | 84,000원 | 156,000원 | 240,000원
1시간 30분 | 270,000원 | 94,500원 | 175,500원 | 270,000원
1시간 40분 | 300,000원 | 105,000원 | 195,000원 | 300,000원
1시간 50분 | 330,000원 | 115,500원 | 214,500원 | 330,000원
2시간 | 360,000원 | 126,000원 | 234,000원 | 360,000원

3. Premium Plan
수업시간 | 월 수업료 | 첫 달 NADO 수수료 | Teacher 첫 달 정산액 | 2개월 차부터 Teacher 수령액
30분 | 120,000원 | 42,000원 | 78,000원 | 120,000원
35분 | 140,000원 | 49,000원 | 91,000원 | 140,000원
40분 | 160,000원 | 56,000원 | 104,000원 | 160,000원
45분 | 180,000원 | 63,000원 | 117,000원 | 180,000원
50~60분 | 220,000원 | 77,000원 | 143,000원 | 220,000원
1시간 10분 | 256,668원 | 89,834원 | 166,834원 | 256,668원
1시간 20분 | 293,336원 | 102,668원 | 190,668원 | 293,336원
1시간 30분 | 330,004원 | 115,501원 | 214,503원 | 330,004원
1시간 40분 | 366,672원 | 128,335원 | 238,337원 | 366,672원
1시간 50분 | 403,340원 | 141,169원 | 262,171원 | 403,340원
2시간 | 440,000원 | 154,000원 | 286,000원 | 440,000원

제4조. 첫 달 수수료 및 정산
1. NADO를 통해 처음 매칭된 학생의 첫 번째 4회 수업에는 제3조의 표에 기재된 NADO 수수료가 1회에 한하여 적용됩니다.
2. NADO 수수료는 학생에게 적용되는 플랜과 수업시간에 따라 제3조의 표에 기재된 금액으로 적용됩니다.
3. Teacher에게 지급되는 첫 달 정산금액은 제3조의 “Teacher 첫 달 정산액”에 표시된 금액입니다.
4. 첫 달 학생의 수업료는 NADO가 수납합니다.
5. 첫 달 정산은 학생과 Teacher 간 첫 번째 수업이 실제로 진행된 날짜를 기준으로 31일 후 진행됩니다.
6. Teacher와 학생이 첫 번째 4회 수업 이후에도 수업을 계속하는 경우, 2개월 차부터는 NADO의 추가 매칭 수수료가 발생하지 않습니다.
7. 2개월 차부터는 제3조의 “2개월 차부터 Teacher 수령액”에 기재된 금액을 Teacher가 학생으로부터 직접 지급받습니다.
8. 학생이 선택한 수업시간 또는 플랜이 변경되는 경우 변경 이후 새로운 4회 수업부터 해당 플랜 및 수업시간에 따른 금액을 적용하는 것을 원칙으로 합니다.

제5조. 수업 진행 및 일정 관리
1. Teacher는 매칭된 학생과 협의하여 첫 수업 일정을 확정합니다.
2. 첫 수업 일정이 확정되면 Teacher는 NADO가 지정한 방법을 통해 첫 수업 일정을 공유합니다.
3. Teacher는 약속된 수업시간을 준수하여야 합니다.
4. 수업 일정 또는 장소 변경이 필요한 경우 학생과 사전에 협의합니다.
5. Teacher는 본인의 NADO Teachers 수업 가능 일정을 가능한 최신 상태로 유지합니다.
6. 학생과의 원활한 매칭을 위해 Teacher는 실제로 수업이 어려운 시간대를 가능한 일정으로 표시하지 않도록 합니다.

제6조. 수업 연장
1. 첫 번째 4회 수업 이후 동일 학생과 수업을 계속하고자 하는 경우 Teacher와 학생은 다음 4회 수업의 진행 여부를 확인합니다.
2. 수업 연장이 확정된 경우 2개월 차부터 학생은 Teacher에게 직접 다음 수업료를 지급합니다.
3. 플랜 또는 수업시간을 변경하려는 경우 학생 또는 Teacher는 필요한 경우 NADO에 변경 사항을 전달할 수 있습니다.

제7조. 첫 달 외부 결제 및 우회거래
1. NADO를 통해 최초로 매칭된 학생의 첫 번째 4회 수업료는 NADO의 결제 및 정산 절차를 통해 처리합니다.
2. Teacher는 NADO 수수료 또는 첫 달 정산 절차를 회피할 목적으로 학생에게 개인 계좌 송금 등 별도의 결제 방법을 요청해서는 안 됩니다.
3. 본 조항은 첫 번째 4회 수업에 적용됩니다.
4. 첫 번째 4회 수업이 완료된 이후 동일 학생과 수업을 계속하는 경우에는 제4조에 따라 Teacher와 학생 간 직접 결제가 가능합니다.
5. 첫 달 결제 절차를 고의로 우회한 사실이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 학생 매칭 또는 NADO Teachers 이용을 제한할 수 있습니다.

제8조. 취소, 일정 변경 및 수업 진행 문제
1. Teacher 또는 학생이 수업에 참석하기 어려운 경우 상대방에게 가능한 한 사전에 이를 전달하여 일정을 조율합니다.
2. Teacher의 사정으로 수업을 진행하지 못한 경우 해당 수업은 완료된 수업으로 계산하지 않으며 학생과 대체 일정을 협의합니다.
3. 학생의 취소, 노쇼, 환불 또는 중도 종료와 관련한 구체적인 처리는 NADO가 별도로 안내하는 취소·환불 및 수업 운영 정책에 따릅니다.
4. 첫 달 수업 중 학생의 환불, Teacher 변경 또는 기타 예외적인 상황이 발생한 경우 NADO는 실제 진행된 수업 및 환불 상황 등을 기준으로 Teacher와 정산 사항을 별도로 확인할 수 있습니다.

제9조. 학생 개인정보 보호
1. Teacher는 매칭 과정에서 제공받은 학생의 이름, 연락처 및 기타 개인정보를 수업 진행 및 일정 조율 목적으로만 사용하여야 합니다.
2. 학생의 동의 없이 학생 정보를 제3자에게 전달하거나 개인적인 홍보·영업 목적으로 이용할 수 없습니다.
3. 매칭 또는 수업과 관련하여 알게 된 학생의 사적인 정보를 불필요하게 저장하거나 공개하지 않습니다.

제10조. 수업 중 기본 행동 기준
Teacher는 학생에게 안전하고 적절한 수업 환경을 제공하기 위해 다음의 행위를 하지 않습니다.
1. 폭언, 위협 또는 모욕적인 행동
2. 성희롱 또는 부적절한 신체적·언어적 행동
3. 차별적인 표현 또는 행동
4. 학생에게 고의적으로 허위 정보를 제공하는 행위
5. 학생의 개인정보를 부적절하게 사용하는 행위
6. NADO 또는 다른 기관·개인을 사칭하는 행위
7. 기타 수업의 안전 또는 신뢰를 중대하게 훼손하는 행위
중대한 문제가 발생한 경우 Teacher는 NADO에 관련 사실을 알릴 수 있습니다.

제11조. 서비스 이용 제한 및 계약 종료
1. Teacher는 더 이상 NADO를 통한 신규 학생 매칭을 원하지 않는 경우 NADO에 이를 요청할 수 있습니다.
2. 다음과 같은 상황이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 매칭을 일시적으로 중단하거나 NADO Teachers 이용을 제한할 수 있습니다.
   - 중대한 허위 프로필 정보
   - 반복적인 무단 수업 불참
   - 학생 개인정보의 부적절한 사용
   - 첫 달 결제 및 정산 절차를 고의로 우회하는 행위
   - 학생에게 중대한 피해를 발생시키는 행위
   - 불법행위 또는 서비스의 신뢰를 중대하게 훼손하는 행위
3. 계약 또는 서비스 이용이 종료되더라도 이미 진행된 수업 및 발생한 정산 의무는 별도로 처리합니다.

제12조. 계약 및 정책의 변경
1. NADO가 수수료, 정산방식 또는 기타 중요한 계약조건을 변경하는 경우 Teacher에게 변경내용을 사전에 안내합니다.
2. 수수료 및 정산방식 등 Teacher에게 중요한 영향을 미치는 내용이 변경되는 경우 필요한 경우 NADO Teachers를 통해 새로운 동의를 요청할 수 있습니다.
3. 새롭게 변경된 수수료는 별도의 안내가 없는 한 변경 전에 이미 확정된 첫 달 매칭에 소급하여 적용하지 않는 것을 원칙으로 합니다.

제13조. 전자계약
1. 본 계약은 NADO Teachers 웹사이트를 통한 전자적 방식으로 체결할 수 있습니다.
2. Teacher가 본 계약을 확인하고 동의 절차를 완료한 경우 해당 행위는 본 계약 체결에 대한 Teacher의 의사표시로 기록됩니다.
3. NADO는 계약 체결 당시의 계약서 버전, Teacher 계정, 성명, 동의 일시 및 동의 내역을 전자적으로 보관할 수 있습니다.
4. Teacher는 NADO Teachers를 통해 본인이 동의한 계약 내용을 확인할 수 있습니다.

제14조. 분쟁 및 협의
본 계약 또는 NADO 서비스 이용과 관련하여 문제가 발생하는 경우 NADO와 Teacher는 우선 상호 협의를 통해 해결하도록 노력하며, 협의로 해결되지 않는 사항은 관계 법령에 따라 처리합니다.

전자계약 동의
아래 항목을 모두 확인한 후 동의를 진행합니다.
- 선택한 플랜 및 수업시간에 따라 제3조에 기재된 NADO 수수료와 Teacher 첫 달 정산액이 적용되는 것을 확인했습니다.
- 첫 달 정산은 학생과 첫 수업이 실제 진행된 날짜를 기준으로 31일 후 이루어지는 것을 확인했습니다.
- 동일 학생과 수업을 계속하는 경우 2개월 차부터 NADO의 추가 수수료 없이 제3조에 기재된 월 수업료 전액을 학생으로부터 직접 지급받는 것을 확인했습니다.
- NADO를 통해 최초 매칭된 학생의 첫 번째 4회 수업료는 NADO의 결제 및 정산 절차를 따라야 하는 것을 확인했습니다.
- NADO Teacher Service Agreement 전체 내용을 읽고 이해하였으며 이에 동의합니다.

Teacher 성명: ___________________________
계약일: ______년 ____월 ____일
계약서 버전: NADO Teacher Service Agreement v1.0$agreement$, '7d51ff003b79d1910075b5e7fd65b16deea957bec1ea9b542b799068ce91cd79')
on conflict (version) do nothing;

-- 프로필 사진용 비공개 Storage 버킷
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_select_own_or_admin" on storage.objects;
drop policy if exists "profile_photos_insert_own" on storage.objects;
drop policy if exists "profile_photos_update_own" on storage.objects;
drop policy if exists "profile_photos_delete_own" on storage.objects;

create policy "profile_photos_select_own_or_admin" on storage.objects
for select to authenticated
using (bucket_id = 'profile-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "profile_photos_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile_photos_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile_photos_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.availability enable row level security;
alter table public.teacher_service_areas enable row level security;
alter table public.student_assignments enable row level security;
alter table public.teacher_agreement_versions enable row level security;
alter table public.teacher_agreements enable row level security;
alter table public.announcements enable row level security;
alter table public.resources enable row level security;
alter table public.training_videos enable row level security;

-- 기존 정책 재실행 가능하도록 삭제
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "availability_own_or_admin_select" ON public.availability;
DROP POLICY IF EXISTS "availability_own_or_admin_insert" ON public.availability;
DROP POLICY IF EXISTS "availability_own_or_admin_update" ON public.availability;
DROP POLICY IF EXISTS "availability_own_or_admin_delete" ON public.availability;
DROP POLICY IF EXISTS "teacher_service_areas_own_or_admin_select" ON public.teacher_service_areas;
DROP POLICY IF EXISTS "teacher_service_areas_own_or_admin_insert" ON public.teacher_service_areas;
DROP POLICY IF EXISTS "teacher_service_areas_own_or_admin_update" ON public.teacher_service_areas;
DROP POLICY IF EXISTS "teacher_service_areas_own_or_admin_delete" ON public.teacher_service_areas;
DROP POLICY IF EXISTS "student_assignments_own_or_admin_select" ON public.student_assignments;
DROP POLICY IF EXISTS "student_assignments_admin_insert" ON public.student_assignments;
DROP POLICY IF EXISTS "student_assignments_admin_update" ON public.student_assignments;
DROP POLICY IF EXISTS "student_assignments_admin_delete" ON public.student_assignments;
DROP POLICY IF EXISTS "agreement_versions_authenticated_read" ON public.teacher_agreement_versions;
DROP POLICY IF EXISTS "teacher_agreements_own_or_admin_select" ON public.teacher_agreements;
DROP POLICY IF EXISTS "teacher_agreements_own_insert" ON public.teacher_agreements;
DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.announcements;
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
DROP POLICY IF EXISTS "resources_authenticated_read" ON public.resources;
DROP POLICY IF EXISTS "resources_admin_all" ON public.resources;
DROP POLICY IF EXISTS "videos_authenticated_read" ON public.training_videos;
DROP POLICY IF EXISTS "videos_admin_all" ON public.training_videos;


-- Current agreement v1.2 (bilingual, amount-only fee disclosure)
insert into public.teacher_agreement_versions (version, title, agreement_text, content_hash)
values (
  'v1.2',
  'NADO Teacher Service Agreement',
  $agreement$NADO Teacher Service Agreement v1.2
[Korean]
본 계약은 NADO(이하 “NADO”)와 NADO Teachers 서비스를 이용하여 학생에게 영어회화 수업을 제공하는 Teacher(이하 “Teacher”) 간의 서비스 이용, 학생 매칭, 수업 운영 및 정산에 관한 사항을 정하는 것을 목적으로 합니다.
제1조. 서비스 및 계약의 목적
NADO는 영어회화 수업을 원하는 학생과 Teacher를 연결하는 매칭 서비스를 제공합니다.
NADO는 학생 모집, 상담, Teacher 매칭, 첫 달 결제 및 정산, 기타 서비스 운영을 지원합니다.
Teacher는 NADO를 통해 매칭된 학생과 직접 영어회화 수업을 진행합니다.
수업은 학생과 Teacher가 협의한 장소 및 시간에 진행하는 것을 원칙으로 합니다.
제2조. Teacher 등록 및 정보
Teacher는 NADO Teachers에 본인의 프로필과 가능한 수업 일정을 등록합니다.
Teacher는 본인의 일정에 따라 매칭 가능한 시간대를 등록·수정할 수 있습니다.
Teacher가 등록하는 학교, 전공, 연락처, 카카오톡 ID, 자기소개 및 기타 프로필 정보는 사실에 기반하여야 합니다.
Teacher의 프로필 사진과 한 줄 소개는 서비스 소개 및 학생 매칭을 위해 NADO 웹사이트 또는 관련 안내 페이지에 표시될 수 있습니다.
Teacher의 학교 또는 소속기관 정보가 NADO Teachers 또는 NADO의 홍보물에 표시되는 경우 이는 Teacher의 개인적인 학력 또는 소속을 설명하기 위한 것이며, 해당 기관과 NADO 사이의 공식적인 제휴·후원 관계를 의미하지 않습니다.
허위 또는 중대한 오류가 있는 프로필 정보가 확인되는 경우 NADO는 정보 수정을 요청하거나 신규 매칭을 제한할 수 있습니다.
제3조. 수업 플랜, 수업시간, 수업 빈도 및 체험수업
아래 표의 금액은
주 1회 · 총 4회 정규 수업
을 기준으로 합니다. Teacher와 학생이 선택한 플랜과 수업시간에 따라 수업료가 결정됩니다.
주 2회 수업은 총 8회
를 기준으로 하며, 학생 수업료, 첫 정규 패키지 NADO 수수료, Teacher 정산액 및 2개월 차부터의 수령액은 아래 4회 기준 금액의
2배
로 적용됩니다.
지원 수업시간은
30분, 35분, 40분, 45분, 60분, 1시간 10분, 1시간 20분, 1시간 30분, 1시간 40분, 1시간 50분, 2시간
입니다.
1. Economy Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
30분
80,000원
28,000원
52,000원
80,000원
35분
93,400원
32,690원
60,710원
93,400원
40분
106,700원
37,345원
69,355원
106,700원
45분
120,000원
42,000원
78,000원
120,000원
60분
140,000원
49,000원
91,000원
140,000원
1시간 10분
163,400원
57,190원
106,210원
163,400원
1시간 20분
186,700원
65,345원
121,355원
186,700원
1시간 30분
210,000원
73,500원
136,500원
210,000원
1시간 40분
233,400원
81,690원
151,710원
233,400원
1시간 50분
256,700원
89,845원
166,855원
256,700원
2시간
280,000원
98,000원
182,000원
280,000원
2. Standard Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
30분
100,000원
35,000원
65,000원
100,000원
35분
116,700원
40,845원
75,855원
116,700원
40분
133,400원
46,690원
86,710원
133,400원
45분
150,000원
52,500원
97,500원
150,000원
60분
180,000원
63,000원
117,000원
180,000원
1시간 10분
210,000원
73,500원
136,500원
210,000원
1시간 20분
240,000원
84,000원
156,000원
240,000원
1시간 30분
270,000원
94,500원
175,500원
270,000원
1시간 40분
300,000원
105,000원
195,000원
300,000원
1시간 50분
330,000원
115,500원
214,500원
330,000원
2시간
360,000원
126,000원
234,000원
360,000원
3. Premium Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
30분
120,000원
42,000원
78,000원
120,000원
35분
140,000원
49,000원
91,000원
140,000원
40분
160,000원
56,000원
104,000원
160,000원
45분
180,000원
63,000원
117,000원
180,000원
60분
220,000원
77,000원
143,000원
220,000원
1시간 10분
256,700원
89,845원
166,855원
256,700원
1시간 20분
293,400원
102,690원
190,710원
293,400원
1시간 30분
330,000원
115,500원
214,500원
330,000원
1시간 40분
366,700원
128,345원
238,355원
366,700원
1시간 50분
403,400원
141,190원
262,210원
403,400원
2시간
440,000원
154,000원
286,000원
440,000원
4. 체험수업
체험수업은
1회 수업
을 기준으로 합니다. 체험수업의 학생 수업료는 해당 플랜 및 수업시간의 주 1회·4회 기준 수업료를 4로 나눈 1회분 금액을 적용합니다.
체험수업의 NADO 수수료와 Teacher 정산액은 제3조 표의 해당 플랜·수업시간에 기재된 4회 기준 NADO 수수료와 Teacher 정산액을 각각 4로 나눈 1회분 금액으로 적용합니다. 원 단위 반올림 또는 분할 정산 시의 원 단위 조정은 NADO Teachers 시스템에 표시되는 금액을 기준으로 합니다.
제4조. 첫 정규 패키지 수수료 및 정산
NADO를 통해 처음 매칭된 학생의 첫 정규 패키지에는 제3조 표에 기재된 NADO 수수료가 1회에 한하여 적용됩니다. 주 1회 수업은 4회, 주 2회 수업은 8회를 첫 정규 패키지로 봅니다.
Teacher에게 지급되는 첫 정규 패키지 정산액은 제3조 표에 기재된 Teacher 정산액을 기준으로 합니다.
첫 정규 패키지의 학생 수업료는 NADO가 수납합니다.
첫 정규 패키지 정산은 해당 정규 수업의 첫 번째 수업이 실제로 진행된 날짜를 기준으로 31일 후 진행됩니다.
선생님 교체, 환불, 중도 종료 또는 기타 사유로 한 Teacher가 패키지 전체 횟수를 진행하지 않은 경우 실제 정산 대상 수업 횟수에 따라 정산액을 비례하여 계산할 수 있습니다.
체험수업에도 제3조의 1회분 수수료 및 정산 기준이 적용되며, 구체적인 체험수업 정산 일정은 해당 매칭 시 NADO가 안내한 일정에 따릅니다.
Teacher와 학생이 첫 정규 패키지 이후에도 수업을 계속하는 경우, 2개월 차부터는 NADO의 추가 매칭 수수료가 발생하지 않습니다.
2개월 차부터는 해당 플랜, 수업시간 및 수업 빈도에 따른 수업료 전액을 Teacher가 학생으로부터 직접 지급받습니다.
학생이 선택한 플랜, 수업시간 또는 수업 빈도가 변경되는 경우 변경 이후 새로 시작되는 패키지부터 변경된 조건을 적용하는 것을 원칙으로 합니다.
제5조. 수업 진행 및 일정 관리
Teacher는 매칭된 학생과 협의하여 첫 수업 일정을 확정합니다.
학생과 최종적으로 매칭이 확정되면 학생, NADO 운영팀 및 Teacher가 함께 있는 단체 채팅방을 개설할 수 있으며, Teacher는 해당 채팅방을 통해 수업 일정과 장소를 조율합니다.
첫 수업 일정이 확정되면 Teacher는 NADO가 지정한 방법을 통해 첫 수업 일정을 공유합니다.
Teacher는 약속된 수업시간을 준수하여야 합니다.
수업 일정 또는 장소 변경이 필요한 경우 학생과 사전에 협의합니다.
Teacher는 본인의 NADO Teachers 수업 가능 일정을 가능한 최신 상태로 유지합니다.
학생과의 원활한 매칭을 위해 Teacher는 실제로 수업이 어려운 시간대를 가능한 일정으로 표시하지 않도록 합니다.
제6조. 수업 연장
첫 정규 패키지(주 1회 4회 또는 주 2회 8회) 이후 동일 학생과 수업을 계속하고자 하는 경우 Teacher와 학생은 다음 패키지의 진행 여부를 확인합니다.
수업 연장이 확정된 경우 2개월 차부터 학생은 Teacher에게 직접 다음 수업료를 지급합니다.
플랜, 수업시간 또는 수업 빈도를 변경하려는 경우 학생 또는 Teacher는 필요한 경우 NADO에 변경 사항을 전달할 수 있습니다.
제7조. 첫 정규 패키지 및 체험수업의 외부 결제·우회거래
NADO를 통해 최초로 매칭된 학생의 체험수업 및 첫 정규 패키지 수업료는 NADO의 결제 및 정산 절차를 통해 처리합니다.
Teacher는 NADO 수수료 또는 정산 절차를 회피할 목적으로 학생에게 개인 계좌 송금 등 별도의 결제 방법을 요청해서는 안 됩니다.
본 조항은 체험수업과 첫 정규 패키지에 적용됩니다.
첫 정규 패키지가 완료된 이후 동일 학생과 수업을 계속하는 경우에는 제4조에 따라 Teacher와 학생 간 직접 결제가 가능합니다.
결제 절차를 고의로 우회한 사실이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 학생 매칭 또는 NADO Teachers 이용을 제한할 수 있습니다.
제8조. 취소, 일정 변경 및 수업 진행 문제
Teacher 또는 학생이 수업에 참석하기 어려운 경우 상대방에게 가능한 한 사전에 이를 전달하여 일정을 조율합니다.
Teacher의 사정으로 수업을 진행하지 못한 경우 해당 수업은 완료된 수업으로 계산하지 않으며 학생과 대체 일정을 협의합니다.
학생의 취소, 노쇼, 환불 또는 중도 종료와 관련한 구체적인 처리는 NADO가 별도로 안내하는 취소·환불 및 수업 운영 정책에 따릅니다.
체험수업 또는 첫 정규 패키지 중 학생의 환불, Teacher 변경 또는 기타 예외적인 상황이 발생한 경우 NADO는 실제 진행된 수업 및 환불 상황 등을 기준으로 Teacher와 정산 사항을 별도로 확인할 수 있습니다.
제9조. 학생 개인정보 보호
Teacher는 매칭 과정에서 제공받은 학생의 이름, 연락처 및 기타 개인정보를 수업 진행 및 일정 조율 목적으로만 사용하여야 합니다.
학생의 동의 없이 학생 정보를 제3자에게 전달하거나 개인적인 홍보·영업 목적으로 이용할 수 없습니다.
매칭 또는 수업과 관련하여 알게 된 학생의 사적인 정보를 불필요하게 저장하거나 공개하지 않습니다.
제10조. 수업 중 기본 행동 기준
Teacher는 학생에게 안전하고 적절한 수업 환경을 제공하기 위해 다음의 행위를 하지 않습니다.
폭언, 위협 또는 모욕적인 행동
성희롱 또는 부적절한 신체적·언어적 행동
차별적인 표현 또는 행동
학생에게 고의적으로 허위 정보를 제공하는 행위
학생의 개인정보를 부적절하게 사용하는 행위
NADO 또는 다른 기관·개인을 사칭하는 행위
기타 수업의 안전 또는 신뢰를 중대하게 훼손하는 행위
중대한 문제가 발생한 경우 Teacher는 NADO에 관련 사실을 알릴 수 있습니다.
제11조. 서비스 이용 제한 및 계약 종료
Teacher는 더 이상 NADO를 통한 신규 학생 매칭을 원하지 않는 경우 NADO에 이를 요청할 수 있습니다.
다음과 같은 상황이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 매칭을 일시적으로 중단하거나 NADO Teachers 이용을 제한할 수 있습니다.
중대한 허위 프로필 정보
반복적인 무단 수업 불참
학생 개인정보의 부적절한 사용
체험수업 또는 첫 정규 패키지의 결제 및 정산 절차를 고의로 우회하는 행위
학생에게 중대한 피해를 발생시키는 행위
불법행위 또는 서비스의 신뢰를 중대하게 훼손하는 행위
계약 또는 서비스 이용이 종료되더라도 이미 진행된 수업 및 발생한 정산 의무는 별도로 처리합니다.
제12조. 계약 및 정책의 변경
NADO가 수수료, 정산방식 또는 기타 중요한 계약조건을 변경하는 경우 Teacher에게 변경내용을 사전에 안내합니다.
수수료, 플랜, 수업시간, 수업 빈도, 체험수업 또는 정산방식 등 Teacher에게 중요한 영향을 미치는 내용이 변경되는 경우 필요한 경우 NADO Teachers를 통해 새로운 동의를 요청할 수 있습니다.
새롭게 변경된 조건은 별도의 안내가 없는 한 변경 전에 이미 확정된 매칭 또는 수업에 소급하여 적용하지 않는 것을 원칙으로 합니다.
제13조. 전자계약
본 계약은 NADO Teachers 웹사이트를 통한 전자적 방식으로 체결할 수 있습니다.
Teacher가 본 계약을 확인하고 동의 절차를 완료한 경우 해당 행위는 본 계약 체결에 대한 Teacher의 의사표시로 기록됩니다.
NADO는 계약 체결 당시의 계약서 버전, Teacher 계정, 성명, 동의 일시 및 동의 내역을 전자적으로 보관할 수 있습니다.
Teacher는 NADO Teachers를 통해 본인이 동의한 계약 내용을 확인할 수 있습니다.
제14조. 분쟁 및 협의
본 계약 또는 NADO 서비스 이용과 관련하여 문제가 발생하는 경우 NADO와 Teacher는 우선 상호 협의를 통해 해결하도록 노력하며, 협의로 해결되지 않는 사항은 관계 법령에 따라 처리합니다.
전자계약 동의
아래 항목을 모두 확인한 후 동의를 진행합니다.
선택한 플랜, 수업시간 및 수업 빈도에 따라 제3조의 수업료와 첫 정규 패키지 NADO 수수료 및 Teacher 정산액이 적용되는 것을 확인했습니다.
주 1회는 4회, 주 2회는 8회를 정규 패키지 기준으로 하며, 주 2회 금액은 4회 기준 금액의 2배로 적용되는 것을 확인했습니다.
체험수업은 제3조 표의 해당 플랜 및 수업시간에 기재된 NADO 수수료와 Teacher 정산액의 1회분 금액을 기준으로 적용되는 것을 확인했습니다.
첫 정규 패키지 정산은 정규 수업의 첫 수업이 실제 진행된 날짜를 기준으로 31일 후 이루어지고, 첫 정규 패키지 이후에는 해당 수업료 전액을 학생으로부터 직접 지급받는 것을 확인했습니다.
NADO Teacher Service Agreement 전체 내용을 읽고 이해하였으며 이에 동의합니다.
[English]
This Agreement sets out the terms governing use of the NADO Teachers service, student matching, lesson operations, and payment settlement between NADO ("NADO") and a Teacher ("Teacher") who provides English conversation lessons to students through NADO Teachers.
Article 1. Purpose of the Service and Agreement
NADO provides a matching service that connects students seeking English conversation lessons with Teachers.
NADO supports student recruitment, consultation, Teacher matching, first-package payment and settlement, and other service operations.
The Teacher provides English conversation lessons directly to students matched through NADO.
Lessons are generally conducted at a time and place agreed upon by the student and the Teacher.
Article 2. Teacher Registration and Information
The Teacher registers a profile and available lesson schedule on NADO Teachers.
The Teacher may register and update available matching times according to the Teacher’s schedule.
University, major, contact information, KakaoTalk ID, introduction, and other profile information provided by the Teacher must be accurate and based on fact.
The Teacher’s profile photo and short introduction may be displayed on the NADO website or related information pages for service information and student matching.
If the Teacher’s university or institutional affiliation is displayed on NADO Teachers or in NADO promotional materials, it is used only to describe the Teacher’s personal education or affiliation and does not imply an official partnership or sponsorship between that institution and NADO.
If materially false or incorrect profile information is identified, NADO may request correction or restrict new student matching.
Article 3. Lesson Plans, Lesson Duration, Weekly Frequency, and Trial Lessons
The amounts in the tables below are based on
one lesson per week and 4 regular lessons in total
. Tuition is determined by the selected plan and lesson duration.
For
two lessons per week, the regular package consists of 8 lessons
. Student tuition, the NADO fee for the first regular package, the Teacher payout, and the amount received from Month 2 are each
twice
the 4-session amounts shown below.
Supported lesson durations are
30, 35, 40, 45, 60, 70, 80, 90, 100, 110, and 120 minutes
.
1. Economy Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
30 min
KRW 80,000
KRW 28,000
KRW 52,000
KRW 80,000
35 min
KRW 93,400
KRW 32,690
KRW 60,710
KRW 93,400
40 min
KRW 106,700
KRW 37,345
KRW 69,355
KRW 106,700
45 min
KRW 120,000
KRW 42,000
KRW 78,000
KRW 120,000
60 min
KRW 140,000
KRW 49,000
KRW 91,000
KRW 140,000
1 hr 10 min
KRW 163,400
KRW 57,190
KRW 106,210
KRW 163,400
1 hr 20 min
KRW 186,700
KRW 65,345
KRW 121,355
KRW 186,700
1 hr 30 min
KRW 210,000
KRW 73,500
KRW 136,500
KRW 210,000
1 hr 40 min
KRW 233,400
KRW 81,690
KRW 151,710
KRW 233,400
1 hr 50 min
KRW 256,700
KRW 89,845
KRW 166,855
KRW 256,700
2 hr
KRW 280,000
KRW 98,000
KRW 182,000
KRW 280,000
2. Standard Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
30 min
KRW 100,000
KRW 35,000
KRW 65,000
KRW 100,000
35 min
KRW 116,700
KRW 40,845
KRW 75,855
KRW 116,700
40 min
KRW 133,400
KRW 46,690
KRW 86,710
KRW 133,400
45 min
KRW 150,000
KRW 52,500
KRW 97,500
KRW 150,000
60 min
KRW 180,000
KRW 63,000
KRW 117,000
KRW 180,000
1 hr 10 min
KRW 210,000
KRW 73,500
KRW 136,500
KRW 210,000
1 hr 20 min
KRW 240,000
KRW 84,000
KRW 156,000
KRW 240,000
1 hr 30 min
KRW 270,000
KRW 94,500
KRW 175,500
KRW 270,000
1 hr 40 min
KRW 300,000
KRW 105,000
KRW 195,000
KRW 300,000
1 hr 50 min
KRW 330,000
KRW 115,500
KRW 214,500
KRW 330,000
2 hr
KRW 360,000
KRW 126,000
KRW 234,000
KRW 360,000
3. Premium Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
30 min
KRW 120,000
KRW 42,000
KRW 78,000
KRW 120,000
35 min
KRW 140,000
KRW 49,000
KRW 91,000
KRW 140,000
40 min
KRW 160,000
KRW 56,000
KRW 104,000
KRW 160,000
45 min
KRW 180,000
KRW 63,000
KRW 117,000
KRW 180,000
60 min
KRW 220,000
KRW 77,000
KRW 143,000
KRW 220,000
1 hr 10 min
KRW 256,700
KRW 89,845
KRW 166,855
KRW 256,700
1 hr 20 min
KRW 293,400
KRW 102,690
KRW 190,710
KRW 293,400
1 hr 30 min
KRW 330,000
KRW 115,500
KRW 214,500
KRW 330,000
1 hr 40 min
KRW 366,700
KRW 128,345
KRW 238,355
KRW 366,700
1 hr 50 min
KRW 403,400
KRW 141,190
KRW 262,210
KRW 403,400
2 hr
KRW 440,000
KRW 154,000
KRW 286,000
KRW 440,000
4. Trial Lessons
A trial lesson consists of
one lesson
. The student price for a trial lesson is one-fourth of the applicable once-weekly 4-session tuition for the selected plan and lesson duration.
For a trial lesson, the NADO fee and Teacher payout are the one-session amounts obtained by dividing the applicable 4-session NADO fee and Teacher payout shown in Article 3 by four. Any KRW rounding or unit adjustment for partial settlements follows the amount displayed by the NADO Teachers system.
Article 4. First Regular Package Fee and Settlement
For a student first matched through NADO, the NADO fee shown in Article 3 applies once to the first regular package. The first regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service.
The Teacher payout for the first regular package is the Teacher payout amount shown in Article 3 for the applicable plan and lesson duration.
NADO collects the student tuition for the first regular package.
Settlement for the first regular package is made 31 days after the date on which the first regular lesson actually takes place.
If a Teacher does not complete the full package because of a Teacher change, refund, early termination, or another reason, the payout may be calculated proportionally based on the number of lessons eligible for settlement.
Trial lessons are subject to the one-session fee and settlement basis in Article 3, and the specific trial-lesson settlement schedule follows the schedule communicated by NADO for that match.
If the Teacher and student continue lessons after the first regular package, no additional NADO matching fee applies from Month 2.
From Month 2, the Teacher receives the full tuition applicable to the selected plan, lesson duration, and weekly frequency directly from the student.
If the plan, lesson duration, or weekly frequency changes, the changed terms generally apply beginning with the next newly started package.
Article 5. Lesson Operation and Schedule Management
The Teacher coordinates with the matched student to confirm the first lesson schedule.
After the final match is confirmed, a group chat including the student, the NADO operations team, and the Teacher may be created, and the Teacher coordinates lesson time and location through that chat.
Once the first lesson schedule is confirmed, the Teacher shares it through the method designated by NADO.
The Teacher must observe the agreed lesson duration.
If a lesson time or location must be changed, the Teacher coordinates the change with the student in advance.
The Teacher should keep the available lesson schedule on NADO Teachers reasonably up to date.
To support smooth matching, the Teacher should not mark time slots as available when the Teacher cannot realistically teach during those times.
Article 6. Lesson Continuation
If the Teacher and student wish to continue after the first regular package (4 lessons once weekly or 8 lessons twice weekly), they confirm whether to proceed with the next package.
Once continuation is confirmed, from Month 2 the student pays the next tuition directly to the Teacher.
If the plan, lesson duration, or weekly frequency will change, the student or Teacher may inform NADO when necessary.
Article 7. Outside Payment and Circumvention for Trial Lessons and the First Regular Package
Payment for a trial lesson and the first regular package for a student first matched through NADO must be processed through NADO’s payment and settlement procedure.
The Teacher must not ask the student to use a separate payment method, such as a transfer to a personal bank account, for the purpose of avoiding the NADO fee or settlement procedure.
This Article applies to trial lessons and the first regular package.
After the first regular package is completed, continued lessons with the same student may be paid directly between the Teacher and the student in accordance with Article 4.
If intentional circumvention of the payment procedure is confirmed, NADO may review the circumstances and restrict new student matching or use of NADO Teachers.
Article 8. Cancellation, Schedule Changes, and Lesson Issues
If the Teacher or student cannot attend a lesson, that person should notify the other party as early as reasonably possible and coordinate a new schedule.
If a lesson cannot be conducted due to the Teacher’s circumstances, it is not counted as a completed lesson and the Teacher coordinates a replacement schedule with the student.
Specific handling of student cancellations, no-shows, refunds, or early termination follows NADO’s separately communicated cancellation, refund, and lesson-operation policies.
If a refund, Teacher change, or other exceptional situation occurs during a trial lesson or the first regular package, NADO may separately confirm settlement with the Teacher based on lessons actually conducted and the refund circumstances.
Article 9. Student Personal Information
The Teacher may use a student’s name, contact details, and other personal information received through matching only for lesson delivery and schedule coordination.
The Teacher may not disclose student information to a third party or use it for personal promotion or sales without the student’s consent.
The Teacher should not unnecessarily retain or disclose private student information learned through matching or lessons.
Article 10. Basic Standards of Conduct During Lessons
To provide a safe and appropriate lesson environment, the Teacher must not engage in the following conduct:
Abusive, threatening, or insulting behavior
Sexual harassment or inappropriate physical or verbal conduct
Discriminatory language or behavior
Intentionally providing false information to a student
Improper use of student personal information
Impersonating NADO or another institution or individual
Any other conduct that materially undermines the safety or trust of the lesson
If a serious issue occurs, the Teacher may inform NADO of the relevant facts.
Article 11. Service Restrictions and Termination
The Teacher may ask NADO to stop providing new student matches.
If any of the following is confirmed, NADO may review the circumstances and temporarily suspend new matching or restrict use of NADO Teachers:
Materially false profile information
Repeated unexcused absence from lessons
Improper use of student personal information
Intentional circumvention of payment or settlement procedures for a trial lesson or first regular package
Conduct causing material harm to a student
Illegal conduct or conduct that materially damages trust in the service
Termination of this Agreement or service use does not eliminate settlement obligations that have already arisen for lessons already conducted.
Article 12. Changes to the Agreement and Policies
If NADO changes fees, settlement methods, or other material contract terms, NADO will provide advance notice to the Teacher.
If terms materially affecting the Teacher change, including fees, plans, lesson duration, weekly frequency, trial lessons, or settlement methods, NADO may request new consent through NADO Teachers when necessary.
Unless separately stated, newly changed terms generally do not apply retroactively to matches or lessons already confirmed before the change.
Article 13. Electronic Agreement
This Agreement may be entered into electronically through the NADO Teachers website.
When the Teacher reviews this Agreement and completes the consent process, that action is recorded as the Teacher’s expression of intent to enter into this Agreement.
NADO may electronically retain the agreement version, Teacher account, name, consent time, and consent records applicable at the time of contracting.
The Teacher may review the agreement accepted by the Teacher through NADO Teachers.
Article 14. Disputes and Consultation
If an issue arises in connection with this Agreement or use of the NADO service, NADO and the Teacher will first seek to resolve it through mutual consultation. Matters that cannot be resolved through consultation will be handled in accordance with applicable law.
Electronic Agreement Consent
Please review all items below before providing consent.
I confirm that tuition, the NADO fee for the first regular package, and the Teacher payout apply according to the selected plan, lesson duration, and weekly frequency as described in Article 3.
I confirm that a regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service, and that twice-weekly amounts are twice the 4-session amounts.
I confirm that a trial lesson uses the applicable one-session NADO fee and Teacher payout amounts derived from the amounts shown in Article 3.
I confirm that settlement for the first regular package is made 31 days after the first regular lesson actually takes place, and that after the first regular package I receive the applicable tuition directly from the student.
I have read and understood the entire NADO Teacher Service Agreement and agree to it.$agreement$,
  '0fcad6cc81ddbe6fbaccdb69749ebf22dcc10bba812dda2daa3519cbc99066c9'
)
on conflict (version) do nothing;

-- profiles: 본인 또는 관리자만 조회, 본인은 role을 바꾸지 못하도록 컬럼 권한 추가 제한
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = auth.uid() and role = 'teacher');

create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- 일반 authenticated 사용자는 role 컬럼을 직접 수정하지 못함
revoke update on public.profiles from authenticated;
grant update (email, full_name, school, major, phone, kakao_id, bank_name, account_number, bio, experience, profile_photo_path, profile_completed_at, updated_at) on public.profiles to authenticated;
grant select, insert on public.profiles to authenticated;

-- availability: 선생님은 자신의 행만, 관리자는 전체
create policy "availability_own_or_admin_select" on public.availability
for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "availability_own_or_admin_insert" on public.availability
for insert to authenticated with check (teacher_id = auth.uid() or public.is_admin());
create policy "availability_own_or_admin_update" on public.availability
for update to authenticated using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());
create policy "availability_own_or_admin_delete" on public.availability
for delete to authenticated using (teacher_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.availability to authenticated;

create policy "teacher_service_areas_own_or_admin_select" on public.teacher_service_areas
for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "teacher_service_areas_own_or_admin_insert" on public.teacher_service_areas
for insert to authenticated with check (teacher_id = auth.uid() or public.is_admin());
create policy "teacher_service_areas_own_or_admin_update" on public.teacher_service_areas
for update to authenticated using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());
create policy "teacher_service_areas_own_or_admin_delete" on public.teacher_service_areas
for delete to authenticated using (teacher_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.teacher_service_areas to authenticated;

-- student_assignments: 선생님은 자신의 배정만 조회, 관리자는 전체 CRUD
create policy "student_assignments_own_or_admin_select" on public.student_assignments
for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "student_assignments_admin_insert" on public.student_assignments
for insert to authenticated with check (public.is_admin());
create policy "student_assignments_admin_update" on public.student_assignments
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "student_assignments_admin_delete" on public.student_assignments
for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.student_assignments to authenticated;

-- 전자계약: 계약 원문은 로그인 사용자가 조회, 동의 기록은 본인/관리자 조회 + 본인 1회 삽입
create policy "agreement_versions_authenticated_read" on public.teacher_agreement_versions
for select to authenticated using (true);
create policy "teacher_agreements_own_or_admin_select" on public.teacher_agreements
for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "teacher_agreements_own_insert" on public.teacher_agreements
for insert to authenticated with check (teacher_id = auth.uid());
revoke all on public.teacher_agreement_versions from authenticated;
revoke all on public.teacher_agreements from authenticated;
grant select on public.teacher_agreement_versions to authenticated;
grant select on public.teacher_agreements to authenticated;
grant insert (teacher_id, teacher_name, agreement_version, confirmations) on public.teacher_agreements to authenticated;

-- 콘텐츠: 로그인 사용자는 활성 콘텐츠 조회, 관리자는 전체 CRUD
create policy "announcements_authenticated_read" on public.announcements
for select to authenticated using (is_active = true or public.is_admin());
create policy "announcements_admin_all" on public.announcements
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;

create policy "resources_authenticated_read" on public.resources
for select to authenticated using (is_active = true or public.is_admin());
create policy "resources_admin_all" on public.resources
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.resources to authenticated;

create policy "videos_authenticated_read" on public.training_videos
for select to authenticated using (is_active = true or public.is_admin());
create policy "videos_admin_all" on public.training_videos
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.training_videos to authenticated;



-- NADO Teacher Service Agreement v1.3 current seed
insert into public.teacher_agreement_versions (version, title, agreement_text, content_hash)
values (
  'v1.3',
  'NADO Teacher Service Agreement',
  $agreement$NADO Teacher Service Agreement v1.3
[Korean]
본 계약은 NADO(이하 “NADO”)와 NADO Teachers 서비스를 이용하여 학생에게 영어회화 수업을 제공하는 Teacher(이하 “Teacher”) 간의 서비스 이용, 학생 매칭, 수업 운영 및 정산에 관한 사항을 정하는 것을 목적으로 합니다.
제1조. 서비스 및 계약의 목적
NADO는 영어회화 수업을 원하는 학생과 Teacher를 연결하는 매칭 서비스를 제공합니다.
NADO는 학생 모집, 상담, Teacher 매칭, 첫 달 결제 및 정산, 기타 서비스 운영을 지원합니다.
Teacher는 NADO를 통해 매칭된 학생과 직접 영어회화 수업을 진행합니다.
수업은 학생과 Teacher가 협의한 장소 및 시간에 진행하는 것을 원칙으로 합니다.
제2조. Teacher 등록 및 정보
Teacher는 NADO Teachers에 본인의 프로필과 가능한 수업 일정을 등록합니다.
Teacher는 본인의 일정에 따라 매칭 가능한 시간대를 등록·수정할 수 있습니다.
Teacher가 등록하는 학교, 전공, 연락처, 카카오톡 ID, 자기소개 및 기타 프로필 정보는 사실에 기반하여야 합니다.
Teacher의 프로필 사진과 한 줄 소개는 서비스 소개 및 학생 매칭을 위해 NADO 웹사이트 또는 관련 안내 페이지에 표시될 수 있습니다.
Teacher의 학교 또는 소속기관 정보가 NADO Teachers 또는 NADO의 홍보물에 표시되는 경우 이는 Teacher의 개인적인 학력 또는 소속을 설명하기 위한 것이며, 해당 기관과 NADO 사이의 공식적인 제휴·후원 관계를 의미하지 않습니다.
허위 또는 중대한 오류가 있는 프로필 정보가 확인되는 경우 NADO는 정보 수정을 요청하거나 신규 매칭을 제한할 수 있습니다.
제3조. 수업 플랜, 수업시간, 수업 빈도 및 체험수업
아래 표의 금액은
주 1회 · 총 4회 정규 수업
을 기준으로 합니다. Teacher와 학생이 선택한 플랜과 수업시간에 따라 수업료가 결정됩니다.
주 2회 수업은 총 8회
를 기준으로 하며, 학생 수업료, 첫 정규 패키지 NADO 수수료, Teacher 정산액 및 2개월 차부터의 수령액은 아래 4회 기준 금액의
2배
로 적용됩니다.
지원 수업시간은
1시간 또는 2시간
입니다.
1. Economy Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
1시간
140,000원
49,000원
91,000원
140,000원
2시간
280,000원
98,000원
182,000원
280,000원
2. Standard Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
1시간
180,000원
63,000원
117,000원
180,000원
2시간
360,000원
126,000원
234,000원
360,000원
3. Premium Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
1시간
220,000원
77,000원
143,000원
220,000원
2시간
440,000원
154,000원
286,000원
440,000원
4. 체험수업
체험수업은
1회 수업
을 기준으로 합니다. 체험수업의 학생 수업료는 해당 플랜 및 수업시간의 주 1회·4회 기준 수업료를 4로 나눈 1회분 금액을 적용합니다.
체험수업의 NADO 수수료와 Teacher 정산액은 제3조 표의 해당 플랜·수업시간에 기재된 4회 기준 NADO 수수료와 Teacher 정산액을 각각 4로 나눈 1회분 금액으로 적용합니다. 원 단위 반올림 또는 분할 정산 시의 원 단위 조정은 NADO Teachers 시스템에 표시되는 금액을 기준으로 합니다.
제4조. 첫 정규 패키지 수수료 및 정산
NADO를 통해 처음 매칭된 학생의 첫 정규 패키지에는 제3조 표에 기재된 NADO 수수료가 1회에 한하여 적용됩니다. 주 1회 수업은 4회, 주 2회 수업은 8회를 첫 정규 패키지로 봅니다.
Teacher에게 지급되는 첫 정규 패키지 정산액은 제3조 표에 기재된 Teacher 정산액을 기준으로 합니다.
첫 정규 패키지의 학생 수업료는 NADO가 수납합니다.
첫 정규 패키지 정산은 해당 정규 수업의 첫 번째 수업이 실제로 진행된 날짜를 기준으로 31일 후 진행됩니다.
선생님 교체, 환불, 중도 종료 또는 기타 사유로 한 Teacher가 패키지 전체 횟수를 진행하지 않은 경우 실제 정산 대상 수업 횟수에 따라 정산액을 비례하여 계산할 수 있습니다.
체험수업에도 제3조의 1회분 수수료 및 정산 기준이 적용되며, 구체적인 체험수업 정산 일정은 해당 매칭 시 NADO가 안내한 일정에 따릅니다.
Teacher와 학생이 첫 정규 패키지 이후에도 수업을 계속하는 경우, 2개월 차부터는 NADO의 추가 매칭 수수료가 발생하지 않습니다.
2개월 차부터는 해당 플랜, 수업시간 및 수업 빈도에 따른 수업료 전액을 Teacher가 학생으로부터 직접 지급받습니다.
학생이 선택한 플랜, 수업시간 또는 수업 빈도가 변경되는 경우 변경 이후 새로 시작되는 패키지부터 변경된 조건을 적용하는 것을 원칙으로 합니다.
제5조. 수업 진행 및 일정 관리
Teacher는 매칭된 학생과 협의하여 첫 수업 일정을 확정합니다.
학생과 최종적으로 매칭이 확정되면 학생, NADO 운영팀 및 Teacher가 함께 있는 단체 채팅방을 개설할 수 있으며, Teacher는 해당 채팅방을 통해 수업 일정과 장소를 조율합니다.
첫 수업 일정이 확정되면 Teacher는 NADO가 지정한 방법을 통해 첫 수업 일정을 공유합니다.
Teacher는 약속된 수업시간을 준수하여야 합니다.
수업 일정 또는 장소 변경이 필요한 경우 학생과 사전에 협의합니다.
Teacher는 본인의 NADO Teachers 수업 가능 일정을 가능한 최신 상태로 유지합니다.
학생과의 원활한 매칭을 위해 Teacher는 실제로 수업이 어려운 시간대를 가능한 일정으로 표시하지 않도록 합니다.
제6조. 수업 연장
첫 정규 패키지(주 1회 4회 또는 주 2회 8회) 이후 동일 학생과 수업을 계속하고자 하는 경우 Teacher와 학생은 다음 패키지의 진행 여부를 확인합니다.
수업 연장이 확정된 경우 2개월 차부터 학생은 Teacher에게 직접 다음 수업료를 지급합니다.
플랜, 수업시간 또는 수업 빈도를 변경하려는 경우 학생 또는 Teacher는 필요한 경우 NADO에 변경 사항을 전달할 수 있습니다.
제7조. 첫 정규 패키지 및 체험수업의 외부 결제·우회거래
NADO를 통해 최초로 매칭된 학생의 체험수업 및 첫 정규 패키지 수업료는 NADO의 결제 및 정산 절차를 통해 처리합니다.
Teacher는 NADO 수수료 또는 정산 절차를 회피할 목적으로 학생에게 개인 계좌 송금 등 별도의 결제 방법을 요청해서는 안 됩니다.
본 조항은 체험수업과 첫 정규 패키지에 적용됩니다.
첫 정규 패키지가 완료된 이후 동일 학생과 수업을 계속하는 경우에는 제4조에 따라 Teacher와 학생 간 직접 결제가 가능합니다.
결제 절차를 고의로 우회한 사실이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 학생 매칭 또는 NADO Teachers 이용을 제한할 수 있습니다.
제8조. 취소, 일정 변경 및 수업 진행 문제
Teacher 또는 학생이 수업에 참석하기 어려운 경우 상대방에게 가능한 한 사전에 이를 전달하여 일정을 조율합니다.
Teacher의 사정으로 수업을 진행하지 못한 경우 해당 수업은 완료된 수업으로 계산하지 않으며 학생과 대체 일정을 협의합니다.
학생의 취소, 노쇼, 환불 또는 중도 종료와 관련한 구체적인 처리는 NADO가 별도로 안내하는 취소·환불 및 수업 운영 정책에 따릅니다.
체험수업 또는 첫 정규 패키지 중 학생의 환불, Teacher 변경 또는 기타 예외적인 상황이 발생한 경우 NADO는 실제 진행된 수업 및 환불 상황 등을 기준으로 Teacher와 정산 사항을 별도로 확인할 수 있습니다.
제9조. 학생 개인정보 보호
Teacher는 매칭 과정에서 제공받은 학생의 이름, 연락처 및 기타 개인정보를 수업 진행 및 일정 조율 목적으로만 사용하여야 합니다.
학생의 동의 없이 학생 정보를 제3자에게 전달하거나 개인적인 홍보·영업 목적으로 이용할 수 없습니다.
매칭 또는 수업과 관련하여 알게 된 학생의 사적인 정보를 불필요하게 저장하거나 공개하지 않습니다.
제10조. 수업 중 기본 행동 기준
Teacher는 학생에게 안전하고 적절한 수업 환경을 제공하기 위해 다음의 행위를 하지 않습니다.
폭언, 위협 또는 모욕적인 행동
성희롱 또는 부적절한 신체적·언어적 행동
차별적인 표현 또는 행동
학생에게 고의적으로 허위 정보를 제공하는 행위
학생의 개인정보를 부적절하게 사용하는 행위
NADO 또는 다른 기관·개인을 사칭하는 행위
기타 수업의 안전 또는 신뢰를 중대하게 훼손하는 행위
중대한 문제가 발생한 경우 Teacher는 NADO에 관련 사실을 알릴 수 있습니다.
제11조. 서비스 이용 제한 및 계약 종료
Teacher는 더 이상 NADO를 통한 신규 학생 매칭을 원하지 않는 경우 NADO에 이를 요청할 수 있습니다.
다음과 같은 상황이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 매칭을 일시적으로 중단하거나 NADO Teachers 이용을 제한할 수 있습니다.
중대한 허위 프로필 정보
반복적인 무단 수업 불참
학생 개인정보의 부적절한 사용
체험수업 또는 첫 정규 패키지의 결제 및 정산 절차를 고의로 우회하는 행위
학생에게 중대한 피해를 발생시키는 행위
불법행위 또는 서비스의 신뢰를 중대하게 훼손하는 행위
계약 또는 서비스 이용이 종료되더라도 이미 진행된 수업 및 발생한 정산 의무는 별도로 처리합니다.
제12조. 계약 및 정책의 변경
NADO가 수수료, 정산방식 또는 기타 중요한 계약조건을 변경하는 경우 Teacher에게 변경내용을 사전에 안내합니다.
수수료, 플랜, 수업시간, 수업 빈도, 체험수업 또는 정산방식 등 Teacher에게 중요한 영향을 미치는 내용이 변경되는 경우 필요한 경우 NADO Teachers를 통해 새로운 동의를 요청할 수 있습니다.
새롭게 변경된 조건은 별도의 안내가 없는 한 변경 전에 이미 확정된 매칭 또는 수업에 소급하여 적용하지 않는 것을 원칙으로 합니다.
제13조. 전자계약
본 계약은 NADO Teachers 웹사이트를 통한 전자적 방식으로 체결할 수 있습니다.
Teacher가 본 계약을 확인하고 동의 절차를 완료한 경우 해당 행위는 본 계약 체결에 대한 Teacher의 의사표시로 기록됩니다.
NADO는 계약 체결 당시의 계약서 버전, Teacher 계정, 성명, 동의 일시 및 동의 내역을 전자적으로 보관할 수 있습니다.
Teacher는 NADO Teachers를 통해 본인이 동의한 계약 내용을 확인할 수 있습니다.
제14조. 분쟁 및 협의
본 계약 또는 NADO 서비스 이용과 관련하여 문제가 발생하는 경우 NADO와 Teacher는 우선 상호 협의를 통해 해결하도록 노력하며, 협의로 해결되지 않는 사항은 관계 법령에 따라 처리합니다.
전자계약 동의
아래 항목을 모두 확인한 후 동의를 진행합니다.
선택한 플랜, 수업시간 및 수업 빈도에 따라 제3조의 수업료와 첫 정규 패키지 NADO 수수료 및 Teacher 정산액이 적용되는 것을 확인했습니다.
주 1회는 4회, 주 2회는 8회를 정규 패키지 기준으로 하며, 주 2회 금액은 4회 기준 금액의 2배로 적용되는 것을 확인했습니다.
체험수업은 제3조 표의 해당 플랜 및 수업시간에 기재된 NADO 수수료와 Teacher 정산액의 1회분 금액을 기준으로 적용되는 것을 확인했습니다.
첫 정규 패키지 정산은 정규 수업의 첫 수업이 실제 진행된 날짜를 기준으로 31일 후 이루어지고, 첫 정규 패키지 이후에는 해당 수업료 전액을 학생으로부터 직접 지급받는 것을 확인했습니다.
NADO Teacher Service Agreement 전체 내용을 읽고 이해하였으며 이에 동의합니다.
[English]
This Agreement sets out the terms governing use of the NADO Teachers service, student matching, lesson operations, and payment settlement between NADO ("NADO") and a Teacher ("Teacher") who provides English conversation lessons to students through NADO Teachers.
Article 1. Purpose of the Service and Agreement
NADO provides a matching service that connects students seeking English conversation lessons with Teachers.
NADO supports student recruitment, consultation, Teacher matching, first-package payment and settlement, and other service operations.
The Teacher provides English conversation lessons directly to students matched through NADO.
Lessons are generally conducted at a time and place agreed upon by the student and the Teacher.
Article 2. Teacher Registration and Information
The Teacher registers a profile and available lesson schedule on NADO Teachers.
The Teacher may register and update available matching times according to the Teacher’s schedule.
University, major, contact information, KakaoTalk ID, introduction, and other profile information provided by the Teacher must be accurate and based on fact.
The Teacher’s profile photo and short introduction may be displayed on the NADO website or related information pages for service information and student matching.
If the Teacher’s university or institutional affiliation is displayed on NADO Teachers or in NADO promotional materials, it is used only to describe the Teacher’s personal education or affiliation and does not imply an official partnership or sponsorship between that institution and NADO.
If materially false or incorrect profile information is identified, NADO may request correction or restrict new student matching.
Article 3. Lesson Plans, Lesson Duration, Weekly Frequency, and Trial Lessons
The amounts in the tables below are based on
one lesson per week and 4 regular lessons in total
. Tuition is determined by the selected plan and lesson duration.
For
two lessons per week, the regular package consists of 8 lessons
. Student tuition, the NADO fee for the first regular package, the Teacher payout, and the amount received from Month 2 are each
twice
the 4-session amounts shown below.
Supported lesson durations are
1 hour or 2 hours
.
1. Economy Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
1 hr
KRW 140,000
KRW 49,000
KRW 91,000
KRW 140,000
2 hr
KRW 280,000
KRW 98,000
KRW 182,000
KRW 280,000
2. Standard Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
1 hr
KRW 180,000
KRW 63,000
KRW 117,000
KRW 180,000
2 hr
KRW 360,000
KRW 126,000
KRW 234,000
KRW 360,000
3. Premium Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
1 hr
KRW 220,000
KRW 77,000
KRW 143,000
KRW 220,000
2 hr
KRW 440,000
KRW 154,000
KRW 286,000
KRW 440,000
4. Trial Lessons
A trial lesson consists of
one lesson
. The student price for a trial lesson is one-fourth of the applicable once-weekly 4-session tuition for the selected plan and lesson duration.
For a trial lesson, the NADO fee and Teacher payout are the one-session amounts obtained by dividing the applicable 4-session NADO fee and Teacher payout shown in Article 3 by four. Any KRW rounding or unit adjustment for partial settlements follows the amount displayed by the NADO Teachers system.
Article 4. First Regular Package Fee and Settlement
For a student first matched through NADO, the NADO fee shown in Article 3 applies once to the first regular package. The first regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service.
The Teacher payout for the first regular package is the Teacher payout amount shown in Article 3 for the applicable plan and lesson duration.
NADO collects the student tuition for the first regular package.
Settlement for the first regular package is made 31 days after the date on which the first regular lesson actually takes place.
If a Teacher does not complete the full package because of a Teacher change, refund, early termination, or another reason, the payout may be calculated proportionally based on the number of lessons eligible for settlement.
Trial lessons are subject to the one-session fee and settlement basis in Article 3, and the specific trial-lesson settlement schedule follows the schedule communicated by NADO for that match.
If the Teacher and student continue lessons after the first regular package, no additional NADO matching fee applies from Month 2.
From Month 2, the Teacher receives the full tuition applicable to the selected plan, lesson duration, and weekly frequency directly from the student.
If the plan, lesson duration, or weekly frequency changes, the changed terms generally apply beginning with the next newly started package.
Article 5. Lesson Operation and Schedule Management
The Teacher coordinates with the matched student to confirm the first lesson schedule.
After the final match is confirmed, a group chat including the student, the NADO operations team, and the Teacher may be created, and the Teacher coordinates lesson time and location through that chat.
Once the first lesson schedule is confirmed, the Teacher shares it through the method designated by NADO.
The Teacher must observe the agreed lesson duration.
If a lesson time or location must be changed, the Teacher coordinates the change with the student in advance.
The Teacher should keep the available lesson schedule on NADO Teachers reasonably up to date.
To support smooth matching, the Teacher should not mark time slots as available when the Teacher cannot realistically teach during those times.
Article 6. Lesson Continuation
If the Teacher and student wish to continue after the first regular package (4 lessons once weekly or 8 lessons twice weekly), they confirm whether to proceed with the next package.
Once continuation is confirmed, from Month 2 the student pays the next tuition directly to the Teacher.
If the plan, lesson duration, or weekly frequency will change, the student or Teacher may inform NADO when necessary.
Article 7. Outside Payment and Circumvention for Trial Lessons and the First Regular Package
Payment for a trial lesson and the first regular package for a student first matched through NADO must be processed through NADO’s payment and settlement procedure.
The Teacher must not ask the student to use a separate payment method, such as a transfer to a personal bank account, for the purpose of avoiding the NADO fee or settlement procedure.
This Article applies to trial lessons and the first regular package.
After the first regular package is completed, continued lessons with the same student may be paid directly between the Teacher and the student in accordance with Article 4.
If intentional circumvention of the payment procedure is confirmed, NADO may review the circumstances and restrict new student matching or use of NADO Teachers.
Article 8. Cancellation, Schedule Changes, and Lesson Issues
If the Teacher or student cannot attend a lesson, that person should notify the other party as early as reasonably possible and coordinate a new schedule.
If a lesson cannot be conducted due to the Teacher’s circumstances, it is not counted as a completed lesson and the Teacher coordinates a replacement schedule with the student.
Specific handling of student cancellations, no-shows, refunds, or early termination follows NADO’s separately communicated cancellation, refund, and lesson-operation policies.
If a refund, Teacher change, or other exceptional situation occurs during a trial lesson or the first regular package, NADO may separately confirm settlement with the Teacher based on lessons actually conducted and the refund circumstances.
Article 9. Student Personal Information
The Teacher may use a student’s name, contact details, and other personal information received through matching only for lesson delivery and schedule coordination.
The Teacher may not disclose student information to a third party or use it for personal promotion or sales without the student’s consent.
The Teacher should not unnecessarily retain or disclose private student information learned through matching or lessons.
Article 10. Basic Standards of Conduct During Lessons
To provide a safe and appropriate lesson environment, the Teacher must not engage in the following conduct:
Abusive, threatening, or insulting behavior
Sexual harassment or inappropriate physical or verbal conduct
Discriminatory language or behavior
Intentionally providing false information to a student
Improper use of student personal information
Impersonating NADO or another institution or individual
Any other conduct that materially undermines the safety or trust of the lesson
If a serious issue occurs, the Teacher may inform NADO of the relevant facts.
Article 11. Service Restrictions and Termination
The Teacher may ask NADO to stop providing new student matches.
If any of the following is confirmed, NADO may review the circumstances and temporarily suspend new matching or restrict use of NADO Teachers:
Materially false profile information
Repeated unexcused absence from lessons
Improper use of student personal information
Intentional circumvention of payment or settlement procedures for a trial lesson or first regular package
Conduct causing material harm to a student
Illegal conduct or conduct that materially damages trust in the service
Termination of this Agreement or service use does not eliminate settlement obligations that have already arisen for lessons already conducted.
Article 12. Changes to the Agreement and Policies
If NADO changes fees, settlement methods, or other material contract terms, NADO will provide advance notice to the Teacher.
If terms materially affecting the Teacher change, including fees, plans, lesson duration, weekly frequency, trial lessons, or settlement methods, NADO may request new consent through NADO Teachers when necessary.
Unless separately stated, newly changed terms generally do not apply retroactively to matches or lessons already confirmed before the change.
Article 13. Electronic Agreement
This Agreement may be entered into electronically through the NADO Teachers website.
When the Teacher reviews this Agreement and completes the consent process, that action is recorded as the Teacher’s expression of intent to enter into this Agreement.
NADO may electronically retain the agreement version, Teacher account, name, consent time, and consent records applicable at the time of contracting.
The Teacher may review the agreement accepted by the Teacher through NADO Teachers.
Article 14. Disputes and Consultation
If an issue arises in connection with this Agreement or use of the NADO service, NADO and the Teacher will first seek to resolve it through mutual consultation. Matters that cannot be resolved through consultation will be handled in accordance with applicable law.
Electronic Agreement Consent
Please review all items below before providing consent.
I confirm that tuition, the NADO fee for the first regular package, and the Teacher payout apply according to the selected plan, lesson duration, and weekly frequency as described in Article 3.
I confirm that a regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service, and that twice-weekly amounts are twice the 4-session amounts.
I confirm that a trial lesson uses the applicable one-session NADO fee and Teacher payout amounts derived from the amounts shown in Article 3.
I confirm that settlement for the first regular package is made 31 days after the first regular lesson actually takes place, and that after the first regular package I receive the applicable tuition directly from the student.
I have read and understood the entire NADO Teacher Service Agreement and agree to it.$agreement$,
  '0ca306219b8c6d45e1eaac09c067add47d2311b1616ae1128a463f56ba916c80'
)
on conflict (version) do nothing;

-- 예시 콘텐츠: URL을 실제 Google Drive/YouTube 링크로 교체하세요.
insert into public.announcements (title, body, published_at)
select '첫 수업 일정 공유 안내', '첫 수업 일정이 확정되면 매칭 단톡방에 날짜와 시간을 반드시 공유해주세요.', now()
where not exists (select 1 from public.announcements where title = '첫 수업 일정 공유 안내');

insert into public.announcements (title, body, published_at)
select '수업 연장 안내', '마지막 4번째 수업 전에 학생에게 연장 여부를 확인해주세요.', now() - interval '1 day'
where not exists (select 1 from public.announcements where title = '수업 연장 안내');

insert into public.resources (title, description, category, file_url, sort_order)
select '첫 수업 질문 리스트', '초급 학생과 자연스럽게 대화를 시작할 수 있는 질문 모음입니다.', 'PDF', 'https://drive.google.com/', 1
where not exists (select 1 from public.resources where title = '첫 수업 질문 리스트');

insert into public.resources (title, description, category, file_url, sort_order)
select '4주 기본 커리큘럼', '주 1회 수업 기준으로 사용할 수 있는 기본 진행안입니다.', 'PDF', 'https://drive.google.com/', 2
where not exists (select 1 from public.resources where title = '4주 기본 커리큘럼');

insert into public.training_videos (title, description, video_url, sort_order)
select '나도 수업 운영 기본', '수업 구조와 선생님의 역할을 설명합니다.', 'https://www.youtube.com/watch?v=REPLACE_ME', 1
where not exists (select 1 from public.training_videos where title = '나도 수업 운영 기본');

insert into public.training_videos (title, description, video_url, sort_order)
select '첫 수업 진행 방법', '첫 만남부터 피드백까지 실제 진행 순서를 확인합니다.', 'https://www.youtube.com/watch?v=REPLACE_ME', 2
where not exists (select 1 from public.training_videos where title = '첫 수업 진행 방법');

-- =========================================================
-- 최초 관리자 지정 방법
-- 1. Supabase → Authentication → Users에서 본인 계정 생성
-- 2. 아래 이메일을 본인 이메일로 바꾸고 한 번 실행
-- update public.profiles set role = 'admin' where email = 'your@email.com';
-- =========================================================


-- NADO Teacher Service Agreement v1.4 current seed
insert into public.teacher_agreement_versions (version, title, agreement_text, content_hash)
values (
  'v1.4',
  'NADO Teacher Service Agreement',
  $agreement$NADO Teacher Service Agreement v1.4
[Korean]
본 계약은 NADO(이하 “NADO”)와 NADO Teachers 서비스를 이용하여 학생에게 영어회화 수업을 제공하는 Teacher(이하 “Teacher”) 간의 서비스 이용, 학생 매칭, 수업 운영 및 정산에 관한 사항을 정하는 것을 목적으로 합니다.
제1조. 서비스 및 계약의 목적
NADO는 영어회화 수업을 원하는 학생과 Teacher를 연결하는 매칭 서비스를 제공합니다.
NADO는 학생 모집, 상담, Teacher 매칭, 첫 달 결제 및 정산, 기타 서비스 운영을 지원합니다.
Teacher는 NADO를 통해 매칭된 학생과 직접 영어회화 수업을 진행합니다.
수업은 학생과 Teacher가 협의한 장소 및 시간에 진행하는 것을 원칙으로 합니다.
제2조. Teacher 등록 및 정보
Teacher는 NADO Teachers에 본인의 프로필과 가능한 수업 일정을 등록합니다.
Teacher는 본인의 일정에 따라 매칭 가능한 시간대를 등록·수정할 수 있습니다.
Teacher가 등록하는 학교, 전공, 연락처, 카카오톡 ID, 자기소개 및 기타 프로필 정보는 사실에 기반하여야 합니다.
Teacher의 프로필 사진과 한 줄 소개는 서비스 소개 및 학생 매칭을 위해 NADO 웹사이트 또는 관련 안내 페이지에 표시될 수 있습니다.
Teacher의 학교 또는 소속기관 정보가 NADO Teachers 또는 NADO의 홍보물에 표시되는 경우 이는 Teacher의 개인적인 학력 또는 소속을 설명하기 위한 것이며, 해당 기관과 NADO 사이의 공식적인 제휴·후원 관계를 의미하지 않습니다.
허위 또는 중대한 오류가 있는 프로필 정보가 확인되는 경우 NADO는 정보 수정을 요청하거나 신규 매칭을 제한할 수 있습니다.
제3조. 수업 플랜, 수업시간, 수업 빈도 및 체험수업
아래 표의 금액은
주 1회 · 총 4회 정규 수업
을 기준으로 합니다. Teacher와 학생이 선택한 플랜과 수업시간에 따라 수업료가 결정됩니다.
주 2회 수업은 총 8회
를 기준으로 하며, 학생 수업료, 첫 정규 패키지 NADO 수수료, Teacher 정산액 및 2개월 차부터의 수령액은 아래 4회 기준 금액의
2배
로 적용됩니다.
지원 수업시간은
1시간 또는 2시간
입니다.
1. Economy Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
1시간
140,000원
49,000원
91,000원
140,000원
2시간
280,000원
98,000원
182,000원
280,000원
2. Standard Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
1시간
180,000원
63,000원
117,000원
180,000원
2시간
360,000원
126,000원
234,000원
360,000원
3. Premium Plan
수업시간
주 1회 · 4회 기준 수업료
첫 정규 패키지 NADO 수수료
Teacher 첫 정규 패키지 정산액
2개월 차부터 Teacher 수령액
1시간
220,000원
77,000원
143,000원
220,000원
2시간
440,000원
154,000원
286,000원
440,000원
4. 체험수업
체험수업은
학생에게 무료로 제공되는 1회 수업
이며, NADO Teachers 운영상
Economy Plan 체험수업
으로 처리합니다.
체험수업이 실제 진행된 경우 Teacher에게
1회당 20,000원
을 NADO가 지급합니다. 이 지급액은 정규 패키지 가격표와 별도로 적용되며, 학생에게는 체험수업 수업료가 청구되지 않습니다.
체험수업의 수업시간은 해당 매칭 시 안내된 시간에 따르며, 구체적인 지급 일정은 NADO가 안내한 일정에 따릅니다.
제4조. 첫 정규 패키지 수수료 및 정산
NADO를 통해 처음 매칭된 학생의 첫 정규 패키지에는 제3조 표에 기재된 NADO 수수료가 1회에 한하여 적용됩니다. 주 1회 수업은 4회, 주 2회 수업은 8회를 첫 정규 패키지로 봅니다.
Teacher에게 지급되는 첫 정규 패키지 정산액은 제3조 표에 기재된 Teacher 정산액을 기준으로 합니다.
첫 정규 패키지의 학생 수업료는 NADO가 수납합니다.
첫 정규 패키지 정산은 해당 정규 수업의 첫 번째 수업이 실제로 진행된 날짜를 기준으로 31일 후 진행됩니다.
선생님 교체, 환불, 중도 종료 또는 기타 사유로 한 Teacher가 패키지 전체 횟수를 진행하지 않은 경우 실제 정산 대상 수업 횟수에 따라 정산액을 비례하여 계산할 수 있습니다.
체험수업은 학생에게 무료로 제공되며, 실제 진행된 체험수업 1회당 Teacher에게 20,000원을 지급합니다. 구체적인 체험수업 지급 일정은 해당 매칭 시 NADO가 안내한 일정에 따릅니다.
Teacher와 학생이 첫 정규 패키지 이후에도 수업을 계속하는 경우, 2개월 차부터는 NADO의 추가 매칭 수수료가 발생하지 않습니다.
2개월 차부터는 해당 플랜, 수업시간 및 수업 빈도에 따른 수업료 전액을 Teacher가 학생으로부터 직접 지급받습니다.
학생이 선택한 플랜, 수업시간 또는 수업 빈도가 변경되는 경우 변경 이후 새로 시작되는 패키지부터 변경된 조건을 적용하는 것을 원칙으로 합니다.
제5조. 수업 진행 및 일정 관리
Teacher는 매칭된 학생과 협의하여 첫 수업 일정을 확정합니다.
학생과 최종적으로 매칭이 확정되면 학생, NADO 운영팀 및 Teacher가 함께 있는 단체 채팅방을 개설할 수 있으며, Teacher는 해당 채팅방을 통해 수업 일정과 장소를 조율합니다.
첫 수업 일정이 확정되면 Teacher는 NADO가 지정한 방법을 통해 첫 수업 일정을 공유합니다.
Teacher는 약속된 수업시간을 준수하여야 합니다.
수업 일정 또는 장소 변경이 필요한 경우 학생과 사전에 협의합니다.
Teacher는 본인의 NADO Teachers 수업 가능 일정을 가능한 최신 상태로 유지합니다.
학생과의 원활한 매칭을 위해 Teacher는 실제로 수업이 어려운 시간대를 가능한 일정으로 표시하지 않도록 합니다.
제6조. 수업 연장
첫 정규 패키지(주 1회 4회 또는 주 2회 8회) 이후 동일 학생과 수업을 계속하고자 하는 경우 Teacher와 학생은 다음 패키지의 진행 여부를 확인합니다.
수업 연장이 확정된 경우 2개월 차부터 학생은 Teacher에게 직접 다음 수업료를 지급합니다.
플랜, 수업시간 또는 수업 빈도를 변경하려는 경우 학생 또는 Teacher는 필요한 경우 NADO에 변경 사항을 전달할 수 있습니다.
제7조. 첫 정규 패키지 및 체험수업의 외부 결제·우회거래
체험수업은 학생에게 무료로 제공되며 Teacher 지급은 NADO의 정산 절차를 통해 처리합니다. 첫 정규 패키지 수업료는 NADO의 결제 및 정산 절차를 통해 처리합니다.
Teacher는 체험수업에 대해 학생에게 별도의 수업료를 요청해서는 안 되며, 첫 정규 패키지의 NADO 수수료 또는 정산 절차를 회피할 목적으로 학생에게 개인 계좌 송금 등 별도의 결제 방법을 요청해서는 안 됩니다.
본 조항은 체험수업과 첫 정규 패키지에 적용됩니다.
첫 정규 패키지가 완료된 이후 동일 학생과 수업을 계속하는 경우에는 제4조에 따라 Teacher와 학생 간 직접 결제가 가능합니다.
결제 절차를 고의로 우회한 사실이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 학생 매칭 또는 NADO Teachers 이용을 제한할 수 있습니다.
제8조. 취소, 일정 변경 및 수업 진행 문제
Teacher 또는 학생이 수업에 참석하기 어려운 경우 상대방에게 가능한 한 사전에 이를 전달하여 일정을 조율합니다.
Teacher의 사정으로 수업을 진행하지 못한 경우 해당 수업은 완료된 수업으로 계산하지 않으며 학생과 대체 일정을 협의합니다.
학생의 취소, 노쇼, 환불 또는 중도 종료와 관련한 구체적인 처리는 NADO가 별도로 안내하는 취소·환불 및 수업 운영 정책에 따릅니다.
체험수업 또는 첫 정규 패키지 중 학생의 환불, Teacher 변경 또는 기타 예외적인 상황이 발생한 경우 NADO는 실제 진행된 수업 및 환불 상황 등을 기준으로 Teacher와 정산 사항을 별도로 확인할 수 있습니다.
제9조. 학생 개인정보 보호
Teacher는 매칭 과정에서 제공받은 학생의 이름, 연락처 및 기타 개인정보를 수업 진행 및 일정 조율 목적으로만 사용하여야 합니다.
학생의 동의 없이 학생 정보를 제3자에게 전달하거나 개인적인 홍보·영업 목적으로 이용할 수 없습니다.
매칭 또는 수업과 관련하여 알게 된 학생의 사적인 정보를 불필요하게 저장하거나 공개하지 않습니다.
제10조. 수업 중 기본 행동 기준
Teacher는 학생에게 안전하고 적절한 수업 환경을 제공하기 위해 다음의 행위를 하지 않습니다.
폭언, 위협 또는 모욕적인 행동
성희롱 또는 부적절한 신체적·언어적 행동
차별적인 표현 또는 행동
학생에게 고의적으로 허위 정보를 제공하는 행위
학생의 개인정보를 부적절하게 사용하는 행위
NADO 또는 다른 기관·개인을 사칭하는 행위
기타 수업의 안전 또는 신뢰를 중대하게 훼손하는 행위
중대한 문제가 발생한 경우 Teacher는 NADO에 관련 사실을 알릴 수 있습니다.
제11조. 서비스 이용 제한 및 계약 종료
Teacher는 더 이상 NADO를 통한 신규 학생 매칭을 원하지 않는 경우 NADO에 이를 요청할 수 있습니다.
다음과 같은 상황이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 매칭을 일시적으로 중단하거나 NADO Teachers 이용을 제한할 수 있습니다.
중대한 허위 프로필 정보
반복적인 무단 수업 불참
학생 개인정보의 부적절한 사용
체험수업 또는 첫 정규 패키지의 결제 및 정산 절차를 고의로 우회하는 행위
학생에게 중대한 피해를 발생시키는 행위
불법행위 또는 서비스의 신뢰를 중대하게 훼손하는 행위
계약 또는 서비스 이용이 종료되더라도 이미 진행된 수업 및 발생한 정산 의무는 별도로 처리합니다.
제12조. 계약 및 정책의 변경
NADO가 수수료, 정산방식 또는 기타 중요한 계약조건을 변경하는 경우 Teacher에게 변경내용을 사전에 안내합니다.
수수료, 플랜, 수업시간, 수업 빈도, 체험수업 또는 정산방식 등 Teacher에게 중요한 영향을 미치는 내용이 변경되는 경우 필요한 경우 NADO Teachers를 통해 새로운 동의를 요청할 수 있습니다.
새롭게 변경된 조건은 별도의 안내가 없는 한 변경 전에 이미 확정된 매칭 또는 수업에 소급하여 적용하지 않는 것을 원칙으로 합니다.
제13조. 전자계약
본 계약은 NADO Teachers 웹사이트를 통한 전자적 방식으로 체결할 수 있습니다.
Teacher가 본 계약을 확인하고 동의 절차를 완료한 경우 해당 행위는 본 계약 체결에 대한 Teacher의 의사표시로 기록됩니다.
NADO는 계약 체결 당시의 계약서 버전, Teacher 계정, 성명, 동의 일시 및 동의 내역을 전자적으로 보관할 수 있습니다.
Teacher는 NADO Teachers를 통해 본인이 동의한 계약 내용을 확인할 수 있습니다.
제14조. 분쟁 및 협의
본 계약 또는 NADO 서비스 이용과 관련하여 문제가 발생하는 경우 NADO와 Teacher는 우선 상호 협의를 통해 해결하도록 노력하며, 협의로 해결되지 않는 사항은 관계 법령에 따라 처리합니다.
전자계약 동의
아래 항목을 모두 확인한 후 동의를 진행합니다.
선택한 플랜, 수업시간 및 수업 빈도에 따라 제3조의 수업료와 첫 정규 패키지 NADO 수수료 및 Teacher 정산액이 적용되는 것을 확인했습니다.
주 1회는 4회, 주 2회는 8회를 정규 패키지 기준으로 하며, 주 2회 금액은 4회 기준 금액의 2배로 적용되는 것을 확인했습니다.
체험수업은 학생에게 무료로 제공되고 Economy Plan 체험수업으로 처리되며, 실제 진행된 체험수업 1회당 Teacher 지급액이 20,000원인 것을 확인했습니다.
첫 정규 패키지 정산은 정규 수업의 첫 수업이 실제 진행된 날짜를 기준으로 31일 후 이루어지고, 첫 정규 패키지 이후에는 해당 수업료 전액을 학생으로부터 직접 지급받는 것을 확인했습니다.
NADO Teacher Service Agreement 전체 내용을 읽고 이해하였으며 이에 동의합니다.
[English]
This Agreement sets out the terms governing use of the NADO Teachers service, student matching, lesson operations, and payment settlement between NADO ("NADO") and a Teacher ("Teacher") who provides English conversation lessons to students through NADO Teachers.
Article 1. Purpose of the Service and Agreement
NADO provides a matching service that connects students seeking English conversation lessons with Teachers.
NADO supports student recruitment, consultation, Teacher matching, first-package payment and settlement, and other service operations.
The Teacher provides English conversation lessons directly to students matched through NADO.
Lessons are generally conducted at a time and place agreed upon by the student and the Teacher.
Article 2. Teacher Registration and Information
The Teacher registers a profile and available lesson schedule on NADO Teachers.
The Teacher may register and update available matching times according to the Teacher’s schedule.
University, major, contact information, KakaoTalk ID, introduction, and other profile information provided by the Teacher must be accurate and based on fact.
The Teacher’s profile photo and short introduction may be displayed on the NADO website or related information pages for service information and student matching.
If the Teacher’s university or institutional affiliation is displayed on NADO Teachers or in NADO promotional materials, it is used only to describe the Teacher’s personal education or affiliation and does not imply an official partnership or sponsorship between that institution and NADO.
If materially false or incorrect profile information is identified, NADO may request correction or restrict new student matching.
Article 3. Lesson Plans, Lesson Duration, Weekly Frequency, and Trial Lessons
The amounts in the tables below are based on
one lesson per week and 4 regular lessons in total
. Tuition is determined by the selected plan and lesson duration.
For
two lessons per week, the regular package consists of 8 lessons
. Student tuition, the NADO fee for the first regular package, the Teacher payout, and the amount received from Month 2 are each
twice
the 4-session amounts shown below.
Supported lesson durations are
1 hour or 2 hours
.
1. Economy Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
1 hr
KRW 140,000
KRW 49,000
KRW 91,000
KRW 140,000
2 hr
KRW 280,000
KRW 98,000
KRW 182,000
KRW 280,000
2. Standard Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
1 hr
KRW 180,000
KRW 63,000
KRW 117,000
KRW 180,000
2 hr
KRW 360,000
KRW 126,000
KRW 234,000
KRW 360,000
3. Premium Plan
Lesson duration
Once weekly · 4-session tuition
NADO fee for first regular package
Teacher payout for first regular package
Teacher receipt from Month 2
1 hr
KRW 220,000
KRW 77,000
KRW 143,000
KRW 220,000
2 hr
KRW 440,000
KRW 154,000
KRW 286,000
KRW 440,000
4. Trial Lessons
A trial lesson is
one lesson provided to the student free of charge
and is handled in NADO Teachers as an
Economy Plan trial lesson
.
When a trial lesson is actually completed, NADO pays the Teacher
KRW 20,000 per trial lesson
. This payout is separate from the regular-package pricing table, and the student is not charged tuition for the trial lesson.
The lesson duration for a trial lesson follows the duration communicated for that match, and the specific payout schedule follows the schedule communicated by NADO.
Article 4. First Regular Package Fee and Settlement
For a student first matched through NADO, the NADO fee shown in Article 3 applies once to the first regular package. The first regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service.
The Teacher payout for the first regular package is the Teacher payout amount shown in Article 3 for the applicable plan and lesson duration.
NADO collects the student tuition for the first regular package.
Settlement for the first regular package is made 31 days after the date on which the first regular lesson actually takes place.
If a Teacher does not complete the full package because of a Teacher change, refund, early termination, or another reason, the payout may be calculated proportionally based on the number of lessons eligible for settlement.
Trial lessons are free for the student, and the Teacher is paid KRW 20,000 for each completed trial lesson. The specific trial-lesson payout schedule follows the schedule communicated by NADO for that match.
If the Teacher and student continue lessons after the first regular package, no additional NADO matching fee applies from Month 2.
From Month 2, the Teacher receives the full tuition applicable to the selected plan, lesson duration, and weekly frequency directly from the student.
If the plan, lesson duration, or weekly frequency changes, the changed terms generally apply beginning with the next newly started package.
Article 5. Lesson Operation and Schedule Management
The Teacher coordinates with the matched student to confirm the first lesson schedule.
After the final match is confirmed, a group chat including the student, the NADO operations team, and the Teacher may be created, and the Teacher coordinates lesson time and location through that chat.
Once the first lesson schedule is confirmed, the Teacher shares it through the method designated by NADO.
The Teacher must observe the agreed lesson duration.
If a lesson time or location must be changed, the Teacher coordinates the change with the student in advance.
The Teacher should keep the available lesson schedule on NADO Teachers reasonably up to date.
To support smooth matching, the Teacher should not mark time slots as available when the Teacher cannot realistically teach during those times.
Article 6. Lesson Continuation
If the Teacher and student wish to continue after the first regular package (4 lessons once weekly or 8 lessons twice weekly), they confirm whether to proceed with the next package.
Once continuation is confirmed, from Month 2 the student pays the next tuition directly to the Teacher.
If the plan, lesson duration, or weekly frequency will change, the student or Teacher may inform NADO when necessary.
Article 7. Outside Payment and Circumvention for Trial Lessons and the First Regular Package
A trial lesson is provided to the student free of charge, and the Teacher payout is handled through NADO’s settlement procedure. Payment for the first regular package must be processed through NADO’s payment and settlement procedure.
The Teacher must not ask the student to pay separate tuition for a trial lesson and must not request a separate payment method, such as a transfer to a personal bank account, to avoid the NADO fee or settlement procedure for the first regular package.
This Article applies to trial lessons and the first regular package.
After the first regular package is completed, continued lessons with the same student may be paid directly between the Teacher and the student in accordance with Article 4.
If intentional circumvention of the payment procedure is confirmed, NADO may review the circumstances and restrict new student matching or use of NADO Teachers.
Article 8. Cancellation, Schedule Changes, and Lesson Issues
If the Teacher or student cannot attend a lesson, that person should notify the other party as early as reasonably possible and coordinate a new schedule.
If a lesson cannot be conducted due to the Teacher’s circumstances, it is not counted as a completed lesson and the Teacher coordinates a replacement schedule with the student.
Specific handling of student cancellations, no-shows, refunds, or early termination follows NADO’s separately communicated cancellation, refund, and lesson-operation policies.
If a refund, Teacher change, or other exceptional situation occurs during a trial lesson or the first regular package, NADO may separately confirm settlement with the Teacher based on lessons actually conducted and the refund circumstances.
Article 9. Student Personal Information
The Teacher may use a student’s name, contact details, and other personal information received through matching only for lesson delivery and schedule coordination.
The Teacher may not disclose student information to a third party or use it for personal promotion or sales without the student’s consent.
The Teacher should not unnecessarily retain or disclose private student information learned through matching or lessons.
Article 10. Basic Standards of Conduct During Lessons
To provide a safe and appropriate lesson environment, the Teacher must not engage in the following conduct:
Abusive, threatening, or insulting behavior
Sexual harassment or inappropriate physical or verbal conduct
Discriminatory language or behavior
Intentionally providing false information to a student
Improper use of student personal information
Impersonating NADO or another institution or individual
Any other conduct that materially undermines the safety or trust of the lesson
If a serious issue occurs, the Teacher may inform NADO of the relevant facts.
Article 11. Service Restrictions and Termination
The Teacher may ask NADO to stop providing new student matches.
If any of the following is confirmed, NADO may review the circumstances and temporarily suspend new matching or restrict use of NADO Teachers:
Materially false profile information
Repeated unexcused absence from lessons
Improper use of student personal information
Intentional circumvention of payment or settlement procedures for a trial lesson or first regular package
Conduct causing material harm to a student
Illegal conduct or conduct that materially damages trust in the service
Termination of this Agreement or service use does not eliminate settlement obligations that have already arisen for lessons already conducted.
Article 12. Changes to the Agreement and Policies
If NADO changes fees, settlement methods, or other material contract terms, NADO will provide advance notice to the Teacher.
If terms materially affecting the Teacher change, including fees, plans, lesson duration, weekly frequency, trial lessons, or settlement methods, NADO may request new consent through NADO Teachers when necessary.
Unless separately stated, newly changed terms generally do not apply retroactively to matches or lessons already confirmed before the change.
Article 13. Electronic Agreement
This Agreement may be entered into electronically through the NADO Teachers website.
When the Teacher reviews this Agreement and completes the consent process, that action is recorded as the Teacher’s expression of intent to enter into this Agreement.
NADO may electronically retain the agreement version, Teacher account, name, consent time, and consent records applicable at the time of contracting.
The Teacher may review the agreement accepted by the Teacher through NADO Teachers.
Article 14. Disputes and Consultation
If an issue arises in connection with this Agreement or use of the NADO service, NADO and the Teacher will first seek to resolve it through mutual consultation. Matters that cannot be resolved through consultation will be handled in accordance with applicable law.
Electronic Agreement Consent
Please review all items below before providing consent.
I confirm that tuition, the NADO fee for the first regular package, and the Teacher payout apply according to the selected plan, lesson duration, and weekly frequency as described in Article 3.
I confirm that a regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service, and that twice-weekly amounts are twice the 4-session amounts.
I confirm that a trial lesson is free for the student, is handled as an Economy Plan trial lesson, and pays the Teacher KRW 20,000 for each completed trial lesson.
I confirm that settlement for the first regular package is made 31 days after the first regular lesson actually takes place, and that after the first regular package I receive the applicable tuition directly from the student.
I have read and understood the entire NADO Teacher Service Agreement and agree to it.$agreement$,
  '3daac8ca78d4b243713e538fc8e7a96a37be598fca93fff2b100b5dcb63ffee2'
)
on conflict (version) do nothing;


-- 2026-10-27: private administrator nicknames and introduction limit
-- Private teacher aliases are shared by administrators, never public profiles.
create table if not exists public.teacher_admin_nicknames (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  nickname text not null default '' constraint teacher_admin_nickname_length check (char_length(nickname) <= 80),
  updated_at timestamptz not null default now()
);
alter table public.teacher_admin_nicknames enable row level security;
revoke all on public.teacher_admin_nicknames from public, anon, authenticated;
grant select, insert, update on public.teacher_admin_nicknames to authenticated;
grant all on public.teacher_admin_nicknames to service_role;

drop policy if exists teacher_nicknames_admin_select on public.teacher_admin_nicknames;
create policy teacher_nicknames_admin_select on public.teacher_admin_nicknames
for select to authenticated using ((select public.is_admin()));
drop policy if exists teacher_nicknames_admin_insert on public.teacher_admin_nicknames;
create policy teacher_nicknames_admin_insert on public.teacher_admin_nicknames
for insert to authenticated with check ((select public.is_admin()));
drop policy if exists teacher_nicknames_admin_update on public.teacher_admin_nicknames;
create policy teacher_nicknames_admin_update on public.teacher_admin_nicknames
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

comment on table public.teacher_admin_nicknames is 'Internal teacher nicknames; only active administrators may read or modify.';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 500);
  end if;
end;
$$;


-- 2026-10-28: paid trials and private teacher characteristics
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


-- 2026-10-29: internal curriculum CMS
-- Fail before changes if this is run against an incomplete historical bootstrap.
do $prerequisites$
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.can_read_member_resources()') is null
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='account_status')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_active')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='resources' and column_name='storage_path') then
    raise exception 'Apply the deployed account-status, teacher-activation, and member-resource authorization setup before internal_curriculum_update.sql';
  end if;
end;
$prerequisites$;

-- Own-profile UPDATE is allowed elsewhere, so protect the administrator's
-- activation flag with the same guard already protecting role/account_status.
create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.role is distinct from old.role
     or new.account_status is distinct from old.account_status
     or new.is_active is distinct from old.is_active then
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception using errcode = '42501',
        message = 'role, account_status, and is_active may only be changed by an active administrator';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists profiles_protect_authorization_fields on public.profiles;
create trigger profiles_protect_authorization_fields
before update of role, account_status, is_active on public.profiles
for each row execute function public.protect_profile_authorization_fields();

-- This function uses the caller's existing own-profile SELECT policy.
-- It neither reads user-editable JWT metadata nor bypasses profile RLS.
create or replace function public.can_read_curriculum()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and account_status = 'active'
      and (role = 'admin' or (role = 'teacher' and is_active is true))
  );
$function$;
revoke all on function public.can_read_curriculum() from public, anon, authenticated;
grant execute on function public.can_read_curriculum() to authenticated, service_role;

-- Plain text sections are rendered by the client as text, never raw HTML.
-- Validate shape and bounds so direct API writes have the same limits as the UI.
create or replace function public.curriculum_sections_valid(value jsonb, require_published boolean default false)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $function$
declare
  section jsonb;
  section_id text;
  section_ids text[] := array[]::text[];
  field_name text;
  field_limit integer;
  has_content boolean := false;
begin
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 20 then
    return false;
  end if;
  for section in select item from jsonb_array_elements(value) as rows(item)
  loop
    if jsonb_typeof(section) <> 'object'
       or jsonb_typeof(section->'id') is distinct from 'string'
       or jsonb_typeof(section->'type') is distinct from 'string' then
      return false;
    end if;
    section_id := section->>'id';
    if char_length(btrim(section_id)) = 0 or char_length(section_id) > 100
       or section_id = any(section_ids)
       or char_length(btrim(section->>'type')) = 0
       or char_length(section->>'type') > 40 then
      return false;
    end if;
    section_ids := array_append(section_ids,section_id);
    foreach field_name in array array['title','body','teacher_notes']
    loop
      field_limit := case field_name when 'title' then 160 when 'body' then 16000 else 4000 end;
      if section ? field_name and (
        jsonb_typeof(section->field_name) <> 'string'
        or char_length(section->>field_name) > field_limit
      ) then return false; end if;
    end loop;
    if require_published and coalesce(section->>'title','') !~ '[^[:space:]]' then return false; end if;
    has_content := has_content or coalesce(section->>'body','') ~ '[^[:space:]]';
    if section ? 'minutes' then
      if jsonb_typeof(section->'minutes') <> 'number' then return false; end if;
      if (section->>'minutes')::numeric < 0 or (section->>'minutes')::numeric > 240
         or mod((section->>'minutes')::numeric,1) <> 0 then return false; end if;
    end if;
  end loop;
  return not require_published or (jsonb_array_length(value) > 0 and has_content);
end;
$function$;
revoke all on function public.curriculum_sections_valid(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.curriculum_sections_valid(jsonb, boolean) to authenticated, service_role;

create table if not exists public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 160 and title ~ '[^[:space:]]'),
  summary text not null default '' check (char_length(summary) <= 600),
  plan text not null default 'all' check (plan in ('all','economy','standard','premium')),
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  topic text not null default '' check (char_length(topic) <= 80),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 240),
  sections jsonb not null default '[]'::jsonb check (public.curriculum_sections_valid(sections,status='published')),
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists curriculum_lessons_status_order_idx
  on public.curriculum_lessons(status,sort_order,created_at);

create table if not exists public.curriculum_settings (
  id boolean primary key default true check (id is true),
  legacy_links_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Server-owned timestamps also advance inside one transaction, supporting
-- UPDATE ... WHERE updated_at = the previously loaded value.
create or replace function public.set_curriculum_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  else
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$function$;
revoke all on function public.set_curriculum_updated_at() from public, anon, authenticated;
grant execute on function public.set_curriculum_updated_at() to authenticated, service_role;
drop trigger if exists curriculum_lessons_updated_at on public.curriculum_lessons;
create trigger curriculum_lessons_updated_at before insert or update on public.curriculum_lessons
for each row execute function public.set_curriculum_updated_at();
drop trigger if exists curriculum_settings_updated_at on public.curriculum_settings;
create trigger curriculum_settings_updated_at before insert or update on public.curriculum_settings
for each row execute function public.set_curriculum_updated_at();

alter table public.curriculum_lessons enable row level security;
alter table public.curriculum_settings enable row level security;
revoke all on public.curriculum_lessons, public.curriculum_settings from public, anon, authenticated;
grant select, insert, update, delete on public.curriculum_lessons to authenticated;
grant select, update on public.curriculum_settings to authenticated;
grant all on public.curriculum_lessons, public.curriculum_settings to service_role;

drop policy if exists curriculum_lessons_read on public.curriculum_lessons;
create policy curriculum_lessons_read on public.curriculum_lessons
for select to authenticated using (
  (select public.is_admin()) or
  (status='published' and (select public.can_read_curriculum()))
);
drop policy if exists curriculum_lessons_admin_insert on public.curriculum_lessons;
create policy curriculum_lessons_admin_insert on public.curriculum_lessons
for insert to authenticated with check ((select public.is_admin()));
drop policy if exists curriculum_lessons_admin_update on public.curriculum_lessons;
create policy curriculum_lessons_admin_update on public.curriculum_lessons
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists curriculum_lessons_admin_delete on public.curriculum_lessons;
create policy curriculum_lessons_admin_delete on public.curriculum_lessons
for delete to authenticated using ((select public.is_admin()));
drop policy if exists curriculum_settings_read on public.curriculum_settings;
create policy curriculum_settings_read on public.curriculum_settings
for select to authenticated using ((select public.can_read_curriculum()));
drop policy if exists curriculum_settings_admin_update on public.curriculum_settings;
create policy curriculum_settings_admin_update on public.curriculum_settings
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Keep existing external resources available until an administrator switches off.
-- Reapplying the update must never reset a switch that was deliberately disabled.
insert into public.curriculum_settings(id,legacy_links_enabled)
values(true,true) on conflict(id) do nothing;

-- Hide external resources at the Data API as well as in the teacher UI.
-- Private uploaded files and the separate student platform keep existing access.
drop policy if exists resources_authenticated_read on public.resources;
drop policy if exists resources_member_read on public.resources;
create policy resources_member_read on public.resources
for select to authenticated using (
  is_active and public.can_read_member_resources() and (
    nullif(btrim(storage_path),'') is not null
    or not exists (select 1 from public.profiles where id=(select auth.uid()) and role='teacher')
    or exists (select 1 from public.curriculum_settings where id and legacy_links_enabled)
  )
);

comment on table public.curriculum_lessons is 'Internal curriculum. Active teachers read published lessons; active administrators manage drafts and publication.';
comment on table public.curriculum_settings is 'Singleton administrator setting controlling legacy external links for teachers.';


-- 2026-10-29: teacher public profiles use English (Latin alphabet)
-- Generated with Node v24.22.1 / Unicode 17.0:
-- for every Unicode code point, reject /\p{L}/u && !/\p{Script=Latin}/u.
-- Explicit ranges make the server rule independent of database collation/locale.
-- Latin letters (including accents), digits, punctuation, whitespace, marks and
-- symbols are allowed. This is an alphabet rule, not a language-detection model.
create or replace function public.profile_text_is_english(value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  forbidden constant int4multirange := '{[181,182),[697,706),[710,722),[748,749),[750,751),[880,885),[886,888),[890,894),[895,896),[902,903),[904,907),[908,909),[910,930),[931,1014),[1015,1154),[1162,1328),[1329,1367),[1369,1370),[1376,1417),[1488,1515),[1519,1523),[1568,1611),[1646,1648),[1649,1748),[1749,1750),[1765,1767),[1774,1776),[1786,1789),[1791,1792),[1808,1809),[1810,1840),[1869,1958),[1969,1970),[1994,2027),[2036,2038),[2042,2043),[2048,2070),[2074,2075),[2084,2085),[2088,2089),[2112,2137),[2144,2155),[2160,2184),[2185,2192),[2208,2250),[2308,2362),[2365,2366),[2384,2385),[2392,2402),[2417,2433),[2437,2445),[2447,2449),[2451,2473),[2474,2481),[2482,2483),[2486,2490),[2493,2494),[2510,2511),[2524,2526),[2527,2530),[2544,2546),[2556,2557),[2565,2571),[2575,2577),[2579,2601),[2602,2609),[2610,2612),[2613,2615),[2616,2618),[2649,2653),[2654,2655),[2674,2677),[2693,2702),[2703,2706),[2707,2729),[2730,2737),[2738,2740),[2741,2746),[2749,2750),[2768,2769),[2784,2786),[2809,2810),[2821,2829),[2831,2833),[2835,2857),[2858,2865),[2866,2868),[2869,2874),[2877,2878),[2908,2910),[2911,2914),[2929,2930),[2947,2948),[2949,2955),[2958,2961),[2962,2966),[2969,2971),[2972,2973),[2974,2976),[2979,2981),[2984,2987),[2990,3002),[3024,3025),[3077,3085),[3086,3089),[3090,3113),[3114,3130),[3133,3134),[3160,3163),[3164,3166),[3168,3170),[3200,3201),[3205,3213),[3214,3217),[3218,3241),[3242,3252),[3253,3258),[3261,3262),[3292,3295),[3296,3298),[3313,3315),[3332,3341),[3342,3345),[3346,3387),[3389,3390),[3406,3407),[3412,3415),[3423,3426),[3450,3456),[3461,3479),[3482,3506),[3507,3516),[3517,3518),[3520,3527),[3585,3633),[3634,3636),[3648,3655),[3713,3715),[3716,3717),[3718,3723),[3724,3748),[3749,3750),[3751,3761),[3762,3764),[3773,3774),[3776,3781),[3782,3783),[3804,3808),[3840,3841),[3904,3912),[3913,3949),[3976,3981),[4096,4139),[4159,4160),[4176,4182),[4186,4190),[4193,4194),[4197,4199),[4206,4209),[4213,4226),[4238,4239),[4256,4294),[4295,4296),[4301,4302),[4304,4347),[4348,4681),[4682,4686),[4688,4695),[4696,4697),[4698,4702),[4704,4745),[4746,4750),[4752,4785),[4786,4790),[4792,4799),[4800,4801),[4802,4806),[4808,4823),[4824,4881),[4882,4886),[4888,4955),[4992,5008),[5024,5110),[5112,5118),[5121,5741),[5743,5760),[5761,5787),[5792,5867),[5873,5881),[5888,5906),[5919,5938),[5952,5970),[5984,5997),[5998,6001),[6016,6068),[6103,6104),[6108,6109),[6176,6265),[6272,6277),[6279,6313),[6314,6315),[6320,6390),[6400,6431),[6480,6510),[6512,6517),[6528,6572),[6576,6602),[6656,6679),[6688,6741),[6823,6824),[6917,6964),[6981,6989),[7043,7073),[7086,7088),[7098,7142),[7168,7204),[7245,7248),[7258,7294),[7296,7307),[7312,7355),[7357,7360),[7401,7405),[7406,7412),[7413,7415),[7418,7419),[7462,7468),[7517,7522),[7526,7531),[7544,7545),[7615,7616),[7936,7958),[7960,7966),[7968,8006),[8008,8014),[8016,8024),[8025,8026),[8027,8028),[8029,8030),[8031,8062),[8064,8117),[8118,8125),[8126,8127),[8130,8133),[8134,8141),[8144,8148),[8150,8156),[8160,8173),[8178,8181),[8182,8189),[8450,8451),[8455,8456),[8458,8468),[8469,8470),[8473,8478),[8484,8485),[8486,8487),[8488,8489),[8492,8494),[8495,8498),[8499,8506),[8508,8512),[8517,8522),[11264,11360),[11392,11493),[11499,11503),[11506,11508),[11520,11558),[11559,11560),[11565,11566),[11568,11624),[11631,11632),[11648,11671),[11680,11687),[11688,11695),[11696,11703),[11704,11711),[11712,11719),[11720,11727),[11728,11735),[11736,11743),[11823,11824),[12293,12295),[12337,12342),[12347,12349),[12353,12439),[12445,12448),[12449,12539),[12540,12544),[12549,12592),[12593,12687),[12704,12736),[12784,12800),[13312,19904),[19968,42125),[42192,42238),[42240,42509),[42512,42528),[42538,42540),[42560,42607),[42623,42654),[42656,42726),[42775,42784),[42888,42889),[43008,43010),[43011,43014),[43015,43019),[43020,43043),[43072,43124),[43138,43188),[43250,43256),[43259,43260),[43261,43263),[43274,43302),[43312,43335),[43360,43389),[43396,43443),[43471,43472),[43488,43493),[43494,43504),[43514,43519),[43520,43561),[43584,43587),[43588,43596),[43616,43639),[43642,43643),[43646,43696),[43697,43698),[43701,43703),[43705,43710),[43712,43713),[43714,43715),[43739,43742),[43744,43755),[43762,43765),[43777,43783),[43785,43791),[43793,43799),[43808,43815),[43816,43823),[43877,43878),[43888,44003),[44032,55204),[55216,55239),[55243,55292),[63744,64110),[64112,64218),[64275,64280),[64285,64286),[64287,64297),[64298,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),[64326,64434),[64467,64830),[64848,64912),[64914,64968),[65008,65020),[65136,65141),[65142,65277),[65382,65471),[65474,65480),[65482,65488),[65490,65496),[65498,65501),[65536,65548),[65549,65575),[65576,65595),[65596,65598),[65599,65614),[65616,65630),[65664,65787),[66176,66205),[66208,66257),[66304,66336),[66349,66369),[66370,66378),[66384,66422),[66432,66462),[66464,66500),[66504,66512),[66560,66718),[66736,66772),[66776,66812),[66816,66856),[66864,66916),[66928,66939),[66940,66955),[66956,66963),[66964,66966),[66967,66978),[66979,66994),[66995,67002),[67003,67005),[67008,67060),[67072,67383),[67392,67414),[67424,67432),[67584,67590),[67592,67593),[67594,67638),[67639,67641),[67644,67645),[67647,67670),[67680,67703),[67712,67743),[67808,67827),[67828,67830),[67840,67862),[67872,67898),[67904,67930),[67968,68024),[68030,68032),[68096,68097),[68112,68116),[68117,68120),[68121,68150),[68192,68221),[68224,68253),[68288,68296),[68297,68325),[68352,68406),[68416,68438),[68448,68467),[68480,68498),[68608,68681),[68736,68787),[68800,68851),[68864,68900),[68938,68966),[68975,68998),[69248,69290),[69296,69298),[69314,69320),[69376,69405),[69415,69416),[69424,69446),[69488,69506),[69552,69573),[69600,69623),[69635,69688),[69745,69747),[69749,69750),[69763,69808),[69840,69865),[69891,69927),[69956,69957),[69959,69960),[69968,70003),[70006,70007),[70019,70067),[70081,70085),[70106,70107),[70108,70109),[70144,70162),[70163,70188),[70207,70209),[70272,70279),[70280,70281),[70282,70286),[70287,70302),[70303,70313),[70320,70367),[70405,70413),[70415,70417),[70419,70441),[70442,70449),[70450,70452),[70453,70458),[70461,70462),[70480,70481),[70493,70498),[70528,70538),[70539,70540),[70542,70543),[70544,70582),[70583,70584),[70609,70610),[70611,70612),[70656,70709),[70727,70731),[70751,70754),[70784,70832),[70852,70854),[70855,70856),[71040,71087),[71128,71132),[71168,71216),[71236,71237),[71296,71339),[71352,71353),[71424,71451),[71488,71495),[71680,71724),[71840,71904),[71935,71943),[71945,71946),[71948,71956),[71957,71959),[71960,71984),[71999,72000),[72001,72002),[72096,72104),[72106,72145),[72161,72162),[72163,72164),[72192,72193),[72203,72243),[72250,72251),[72272,72273),[72284,72330),[72349,72350),[72368,72441),[72640,72673),[72704,72713),[72714,72751),[72768,72769),[72818,72848),[72960,72967),[72968,72970),[72971,73009),[73030,73031),[73056,73062),[73063,73065),[73066,73098),[73112,73113),[73136,73180),[73440,73459),[73474,73475),[73476,73489),[73490,73524),[73648,73649),[73728,74650),[74880,75076),[77712,77809),[77824,78896),[78913,78919),[78944,82939),[82944,83527),[90368,90398),[92160,92729),[92736,92767),[92784,92863),[92880,92910),[92928,92976),[92992,92996),[93027,93048),[93053,93072),[93504,93549),[93760,93824),[93856,93881),[93883,93908),[93952,94027),[94032,94033),[94099,94112),[94176,94178),[94179,94180),[94194,94196),[94208,101590),[101631,101663),[101760,101875),[110576,110580),[110581,110588),[110589,110591),[110592,110883),[110898,110899),[110928,110931),[110933,110934),[110948,110952),[110960,111356),[113664,113771),[113776,113789),[113792,113801),[113808,113818),[119808,119893),[119894,119965),[119966,119968),[119970,119971),[119973,119975),[119977,119981),[119982,119994),[119995,119996),[119997,120004),[120005,120070),[120071,120075),[120077,120085),[120086,120093),[120094,120122),[120123,120127),[120128,120133),[120134,120135),[120138,120145),[120146,120486),[120488,120513),[120514,120539),[120540,120571),[120572,120597),[120598,120629),[120630,120655),[120656,120687),[120688,120713),[120714,120745),[120746,120771),[120772,120780),[122928,122990),[123136,123181),[123191,123198),[123214,123215),[123536,123566),[123584,123628),[124112,124140),[124368,124398),[124400,124401),[124608,124639),[124640,124643),[124644,124646),[124647,124654),[124656,124661),[124670,124672),[124896,124903),[124904,124908),[124909,124911),[124912,124927),[124928,125125),[125184,125252),[125259,125260),[126464,126468),[126469,126496),[126497,126499),[126500,126501),[126503,126504),[126505,126515),[126516,126520),[126521,126522),[126523,126524),[126530,126531),[126535,126536),[126537,126538),[126539,126540),[126541,126544),[126545,126547),[126548,126549),[126551,126552),[126553,126554),[126555,126556),[126557,126558),[126559,126560),[126561,126563),[126564,126565),[126567,126571),[126572,126579),[126580,126584),[126585,126589),[126590,126591),[126592,126602),[126603,126620),[126625,126628),[126629,126634),[126635,126652),[131072,173792),[173824,178206),[178208,183982),[183984,191457),[191472,192094),[194560,195102),[196608,201547),[201552,210042)}'::int4multirange;
  character_index integer;
begin
  if value is null or value = '' or octet_length(value)=char_length(value) then return true; end if;
  for character_index in 1..char_length(value)
  loop
    if forbidden @> ascii(substr(value,character_index,1)) then return false; end if;
  end loop;
  return true;
end;
$function$;
revoke all on function public.profile_text_is_english(text) from public, anon, authenticated;
grant execute on function public.profile_text_is_english(text) to authenticated, service_role;

create or replace function public.profile_experience_is_english(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  category text;
  entry jsonb;
  field_name text;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'object' then return false; end if;
  foreach category in array array['teaching','work','internship','activities']
  loop
    if not (value ? category) then continue; end if;
    if jsonb_typeof(value->category) <> 'array' then return false; end if;
    for entry in select item from jsonb_array_elements(value->category) as entries(item)
    loop
      if jsonb_typeof(entry) <> 'object' then return false; end if;
      foreach field_name in array array['organization','role','period','description']
      loop
        if not (entry ? field_name) then continue; end if;
        if jsonb_typeof(entry->field_name) <> 'string'
           or not public.profile_text_is_english(entry->>field_name) then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$function$;
revoke all on function public.profile_experience_is_english(jsonb) from public, anon, authenticated;
grant execute on function public.profile_experience_is_english(jsonb) to authenticated, service_role;

create or replace function public.enforce_teacher_profile_english()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  field_name text;
begin
  -- Auth provisioning has no end-user JWT, and administrator maintenance remains
  -- possible. Existing Korean text is checked only when its owner explicitly
  -- writes the public profile or completes onboarding.
  if new.role <> 'teacher' or (select auth.uid()) is null
     or new.id <> (select auth.uid()) or public.is_admin() then return new; end if;

  foreach field_name in array array['full_name','school','major','bio']
  loop
    if not public.profile_text_is_english(to_jsonb(new)->>field_name) then
      raise exception using errcode='23514',
        message='profile_english_only: Please write your profile in English.',
        detail=field_name;
    end if;
  end loop;
  if not public.profile_experience_is_english(new.experience) then
    raise exception using errcode='23514',
      message='profile_english_only: Please write your profile in English.',
      detail='experience';
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_teacher_profile_english() from public, anon, authenticated;
grant execute on function public.enforce_teacher_profile_english() to authenticated, service_role;

drop trigger if exists profiles_teacher_english_insert on public.profiles;
create trigger profiles_teacher_english_insert before insert on public.profiles
for each row execute function public.enforce_teacher_profile_english();
drop trigger if exists profiles_teacher_english_update on public.profiles;
create trigger profiles_teacher_english_update
before update of full_name, school, major, bio, experience, profile_completed_at on public.profiles
for each row execute function public.enforce_teacher_profile_english();
