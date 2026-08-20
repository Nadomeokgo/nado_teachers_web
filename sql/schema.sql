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
  bank_name text,
  account_number text,
  bio text,
  profile_photo_path text,
  profile_completed_at timestamptz,
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists profile_completed_at timestamptz;
alter table public.profiles
  add column if not exists profile_photo_path text;

-- 프로필 완료 시 모든 필수 정보가 입력되어 있어야 함
alter table public.profiles
  drop constraint if exists profiles_completion_requires_fields;
alter table public.profiles
  add constraint profiles_completion_requires_fields
  check (
    profile_completed_at is null or (
      nullif(btrim(coalesce(full_name, '')), '') is not null and
      nullif(btrim(coalesce(school, '')), '') is not null and
      nullif(btrim(coalesce(major, '')), '') is not null and
      nullif(btrim(coalesce(phone, '')), '') is not null and
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
  location text not null default '송도 내 협의',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_time_range check (start_time < end_time),
  constraint unique_teacher_slot unique (teacher_id, day_of_week, start_time, end_time)
);
create index if not exists availability_teacher_idx on public.availability(teacher_id);

-- 3) 학생 배정 및 첫 달 수업료 정산 예정일
create table if not exists public.student_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_name text not null check (char_length(btrim(student_name)) between 1 and 100),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_assignments_valid_dates check (settlement_date >= first_lesson_date),
  constraint student_assignments_settlement_matches_frequency check (
    weekly_frequency is null or settlement_sessions is null or settlement_sessions <= 4 * weekly_frequency
  )
);
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

create index if not exists student_assignments_teacher_idx on public.student_assignments(teacher_id);
create index if not exists student_assignments_first_lesson_idx on public.student_assignments(first_lesson_date);
create index if not exists student_assignments_settlement_idx on public.student_assignments(settlement_date);

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
grant update (email, full_name, school, major, phone, bank_name, account_number, bio, profile_photo_path, profile_completed_at, updated_at) on public.profiles to authenticated;
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
