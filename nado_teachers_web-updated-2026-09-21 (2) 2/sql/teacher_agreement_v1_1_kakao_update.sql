-- NADO Teacher Service Agreement v1.1 + KakaoTalk ID required profile update
-- Run this once in Supabase SQL Editor before deploying the matching GitHub patch.
-- Existing student, schedule, photo, and agreement history is preserved.

begin;

-- 1) Add required KakaoTalk ID to teacher profiles.
alter table public.profiles add column if not exists kakao_id text;

-- Existing teachers without a KakaoTalk ID must complete the required profile screen again.
update public.profiles
set profile_completed_at = null, updated_at = now()
where role = 'teacher'
  and nullif(btrim(coalesce(kakao_id, '')), '') is null
  and profile_completed_at is not null;

alter table public.profiles drop constraint if exists profiles_completion_requires_fields;
alter table public.profiles add constraint profiles_completion_requires_fields check (
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

revoke update on public.profiles from authenticated;
grant update (email, full_name, school, major, phone, kakao_id, bank_name, account_number, bio, profile_photo_path, profile_completed_at, updated_at) on public.profiles to authenticated;
grant select, insert on public.profiles to authenticated;

comment on column public.profiles.kakao_id is 'Teacher KakaoTalk ID used for matching and group-chat setup';

-- 2) Publish the updated bilingual Teacher Service Agreement as v1.1.
-- v1.0 records remain unchanged. Existing teachers will be asked to accept v1.1 once.
insert into public.teacher_agreement_versions (version, title, agreement_text, content_hash)
values (
  'v1.1',
  'NADO Teacher Service Agreement',
  $agreement$NADO Teacher Service Agreement v1.1
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
 아래 표의 금액은 주 1회 · 총 4회 정규 수업 을 기준으로 합니다. Teacher와 학생이 선택한 플랜과 수업시간에 따라 수업료가 결정됩니다.
 주 2회 수업은 총 8회 를 기준으로 하며, 학생 수업료, 첫 정규 패키지 NADO 수수료, Teacher 정산액 및 2개월 차부터의 수령액은 아래 4회 기준 금액의 2배 로 적용됩니다.
 지원 수업시간은 30분, 35분, 40분, 45분, 60분, 1시간 10분, 1시간 20분, 1시간 30분, 1시간 40분, 1시간 50분, 2시간 입니다.
 1. Economy Plan
 수업시간 주 1회 · 4회 기준 수업료 첫 정규 패키지 NADO 수수료 (35%) Teacher 첫 정규 패키지 정산액 (65%) 2개월 차부터 Teacher 수령액 
 30분 80,000원 28,000원 52,000원 80,000원 
 35분 93,400원 32,690원 60,710원 93,400원 
 40분 106,700원 37,345원 69,355원 106,700원 
 45분 120,000원 42,000원 78,000원 120,000원 
 60분 140,000원 49,000원 91,000원 140,000원 
 1시간 10분 163,400원 57,190원 106,210원 163,400원 
 1시간 20분 186,700원 65,345원 121,355원 186,700원 
 1시간 30분 210,000원 73,500원 136,500원 210,000원 
 1시간 40분 233,400원 81,690원 151,710원 233,400원 
 1시간 50분 256,700원 89,845원 166,855원 256,700원 
 2시간 280,000원 98,000원 182,000원 280,000원 
 2. Standard Plan
 수업시간 주 1회 · 4회 기준 수업료 첫 정규 패키지 NADO 수수료 (35%) Teacher 첫 정규 패키지 정산액 (65%) 2개월 차부터 Teacher 수령액 
 30분 100,000원 35,000원 65,000원 100,000원 
 35분 116,700원 40,845원 75,855원 116,700원 
 40분 133,400원 46,690원 86,710원 133,400원 
 45분 150,000원 52,500원 97,500원 150,000원 
 60분 180,000원 63,000원 117,000원 180,000원 
 1시간 10분 210,000원 73,500원 136,500원 210,000원 
 1시간 20분 240,000원 84,000원 156,000원 240,000원 
 1시간 30분 270,000원 94,500원 175,500원 270,000원 
 1시간 40분 300,000원 105,000원 195,000원 300,000원 
 1시간 50분 330,000원 115,500원 214,500원 330,000원 
 2시간 360,000원 126,000원 234,000원 360,000원 
 3. Premium Plan
 수업시간 주 1회 · 4회 기준 수업료 첫 정규 패키지 NADO 수수료 (35%) Teacher 첫 정규 패키지 정산액 (65%) 2개월 차부터 Teacher 수령액 
 30분 120,000원 42,000원 78,000원 120,000원 
 35분 140,000원 49,000원 91,000원 140,000원 
 40분 160,000원 56,000원 104,000원 160,000원 
 45분 180,000원 63,000원 117,000원 180,000원 
 60분 220,000원 77,000원 143,000원 220,000원 
 1시간 10분 256,700원 89,845원 166,855원 256,700원 
 1시간 20분 293,400원 102,690원 190,710원 293,400원 
 1시간 30분 330,000원 115,500원 214,500원 330,000원 
 1시간 40분 366,700원 128,345원 238,355원 366,700원 
 1시간 50분 403,400원 141,190원 262,210원 403,400원 
 2시간 440,000원 154,000원 286,000원 440,000원 
 4. 체험수업
 체험수업은 1회 수업 을 기준으로 합니다. 체험수업의 학생 수업료는 해당 플랜 및 수업시간의 주 1회·4회 기준 수업료를 4로 나눈 1회분 금액을 적용합니다.
 체험수업에도 동일한 정산 원칙을 적용하여 NADO 수수료는 1회분 수업료의 35%, Teacher 정산액은 65%를 기준으로 계산합니다. 원 단위 반올림 또는 분할 정산 시의 원 단위 조정은 NADO Teachers 시스템에 표시되는 금액을 기준으로 합니다.
 제4조. 첫 정규 패키지 수수료 및 정산
 NADO를 통해 처음 매칭된 학생의 첫 정규 패키지에는 NADO 수수료 35%가 1회에 한하여 적용됩니다. 주 1회 수업은 4회, 주 2회 수업은 8회를 첫 정규 패키지로 봅니다.
 Teacher에게 지급되는 첫 정규 패키지 정산액은 적용 수업료의 65%를 기준으로 합니다.
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
 다음과 같은 상황이 확인되는 경우 NADO는 사실관계를 확인한 후 신규 매칭을 일시적으로 중단하거나 NADO Teachers 이용을 제한할 수 있습니다. 중대한 허위 프로필 정보
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
 체험수업은 해당 플랜 및 수업시간의 1회분 금액을 기준으로 하며 NADO 수수료 35%와 Teacher 정산 65% 원칙이 적용되는 것을 확인했습니다.
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
 The amounts in the tables below are based on one lesson per week and 4 regular lessons in total . Tuition is determined by the selected plan and lesson duration.
 For two lessons per week, the regular package consists of 8 lessons . Student tuition, the NADO fee for the first regular package, the Teacher payout, and the amount received from Month 2 are each twice the 4-session amounts shown below.
 Supported lesson durations are 30, 35, 40, 45, 60, 70, 80, 90, 100, 110, and 120 minutes .
 1. Economy Plan
 Lesson duration Once weekly · 4-session tuition NADO fee for first regular package (35%) Teacher payout for first regular package (65%) Teacher receipt from Month 2 
 30 min KRW 80,000 KRW 28,000 KRW 52,000 KRW 80,000 
 35 min KRW 93,400 KRW 32,690 KRW 60,710 KRW 93,400 
 40 min KRW 106,700 KRW 37,345 KRW 69,355 KRW 106,700 
 45 min KRW 120,000 KRW 42,000 KRW 78,000 KRW 120,000 
 60 min KRW 140,000 KRW 49,000 KRW 91,000 KRW 140,000 
 1 hr 10 min KRW 163,400 KRW 57,190 KRW 106,210 KRW 163,400 
 1 hr 20 min KRW 186,700 KRW 65,345 KRW 121,355 KRW 186,700 
 1 hr 30 min KRW 210,000 KRW 73,500 KRW 136,500 KRW 210,000 
 1 hr 40 min KRW 233,400 KRW 81,690 KRW 151,710 KRW 233,400 
 1 hr 50 min KRW 256,700 KRW 89,845 KRW 166,855 KRW 256,700 
 2 hr KRW 280,000 KRW 98,000 KRW 182,000 KRW 280,000 
 2. Standard Plan
 Lesson duration Once weekly · 4-session tuition NADO fee for first regular package (35%) Teacher payout for first regular package (65%) Teacher receipt from Month 2 
 30 min KRW 100,000 KRW 35,000 KRW 65,000 KRW 100,000 
 35 min KRW 116,700 KRW 40,845 KRW 75,855 KRW 116,700 
 40 min KRW 133,400 KRW 46,690 KRW 86,710 KRW 133,400 
 45 min KRW 150,000 KRW 52,500 KRW 97,500 KRW 150,000 
 60 min KRW 180,000 KRW 63,000 KRW 117,000 KRW 180,000 
 1 hr 10 min KRW 210,000 KRW 73,500 KRW 136,500 KRW 210,000 
 1 hr 20 min KRW 240,000 KRW 84,000 KRW 156,000 KRW 240,000 
 1 hr 30 min KRW 270,000 KRW 94,500 KRW 175,500 KRW 270,000 
 1 hr 40 min KRW 300,000 KRW 105,000 KRW 195,000 KRW 300,000 
 1 hr 50 min KRW 330,000 KRW 115,500 KRW 214,500 KRW 330,000 
 2 hr KRW 360,000 KRW 126,000 KRW 234,000 KRW 360,000 
 3. Premium Plan
 Lesson duration Once weekly · 4-session tuition NADO fee for first regular package (35%) Teacher payout for first regular package (65%) Teacher receipt from Month 2 
 30 min KRW 120,000 KRW 42,000 KRW 78,000 KRW 120,000 
 35 min KRW 140,000 KRW 49,000 KRW 91,000 KRW 140,000 
 40 min KRW 160,000 KRW 56,000 KRW 104,000 KRW 160,000 
 45 min KRW 180,000 KRW 63,000 KRW 117,000 KRW 180,000 
 60 min KRW 220,000 KRW 77,000 KRW 143,000 KRW 220,000 
 1 hr 10 min KRW 256,700 KRW 89,845 KRW 166,855 KRW 256,700 
 1 hr 20 min KRW 293,400 KRW 102,690 KRW 190,710 KRW 293,400 
 1 hr 30 min KRW 330,000 KRW 115,500 KRW 214,500 KRW 330,000 
 1 hr 40 min KRW 366,700 KRW 128,345 KRW 238,355 KRW 366,700 
 1 hr 50 min KRW 403,400 KRW 141,190 KRW 262,210 KRW 403,400 
 2 hr KRW 440,000 KRW 154,000 KRW 286,000 KRW 440,000 
 4. Trial Lessons
 A trial lesson consists of one lesson . The student price for a trial lesson is one-fourth of the applicable once-weekly 4-session tuition for the selected plan and lesson duration.
 The same settlement principle applies to a trial lesson: the NADO fee is calculated at 35% of the one-session amount and the Teacher payout at 65%. Any KRW rounding or unit adjustment for partial settlements follows the amount displayed by the NADO Teachers system.
 Article 4. First Regular Package Fee and Settlement
 For a student first matched through NADO, the NADO fee of 35% applies once to the first regular package. The first regular package consists of 4 lessons for once-weekly service and 8 lessons for twice-weekly service.
 The Teacher payout for the first regular package is calculated at 65% of the applicable tuition.
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
 If any of the following is confirmed, NADO may review the circumstances and temporarily suspend new matching or restrict use of NADO Teachers: Materially false profile information
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
 I confirm that a trial lesson uses the applicable one-session amount and follows the NADO fee 35% / Teacher payout 65% principle.
 I confirm that settlement for the first regular package is made 31 days after the first regular lesson actually takes place, and that after the first regular package I receive the applicable tuition directly from the student.
 I have read and understood the entire NADO Teacher Service Agreement and agree to it.$agreement$,
  '60e75001ea4df859d0e454e1b13221c0fe7926561d524c79f3da94536a341cd0'
)
on conflict (version) do nothing;

commit;
