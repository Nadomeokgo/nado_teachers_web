-- NADO Teacher Service Agreement v1.0
-- 기존 프로필/학생/스케줄 데이터는 삭제하지 않습니다.

begin;

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

insert into public.teacher_agreement_versions (version, title, agreement_text, content_hash)
values (
  'v1.0',
  'NADO Teacher Service Agreement',
  $agreement$NADO Teacher Service Agreement
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
계약서 버전: NADO Teacher Service Agreement v1.0$agreement$,
  '7d51ff003b79d1910075b5e7fd65b16deea957bec1ea9b542b799068ce91cd79'
)
on conflict (version) do nothing;

alter table public.teacher_agreement_versions enable row level security;
alter table public.teacher_agreements enable row level security;

drop policy if exists "agreement_versions_authenticated_read" on public.teacher_agreement_versions;
drop policy if exists "teacher_agreements_own_or_admin_select" on public.teacher_agreements;
drop policy if exists "teacher_agreements_own_insert" on public.teacher_agreements;

create policy "agreement_versions_authenticated_read" on public.teacher_agreement_versions
for select to authenticated
using (true);

create policy "teacher_agreements_own_or_admin_select" on public.teacher_agreements
for select to authenticated
using (teacher_id = auth.uid() or public.is_admin());

create policy "teacher_agreements_own_insert" on public.teacher_agreements
for insert to authenticated
with check (teacher_id = auth.uid());

revoke all on public.teacher_agreement_versions from authenticated;
revoke all on public.teacher_agreements from authenticated;
grant select on public.teacher_agreement_versions to authenticated;
grant select on public.teacher_agreements to authenticated;
grant insert (teacher_id, teacher_name, agreement_version, confirmations) on public.teacher_agreements to authenticated;

comment on table public.teacher_agreement_versions is 'NADO Teacher Service Agreement 버전별 원문 보관';
comment on table public.teacher_agreements is 'Teacher별 전자계약 동의 이력. agreed_at은 서버 기본값으로 기록';

commit;
