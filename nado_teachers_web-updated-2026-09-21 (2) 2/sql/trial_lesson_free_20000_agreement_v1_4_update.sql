-- NADO free trial lesson + Teacher KRW 20,000 payout + Agreement v1.4
-- Run once in Supabase SQL Editor before deploying the matching GitHub patch.
-- Existing assignments and v1.0-v1.3 agreement records are preserved.

begin;

alter table public.student_assignments
  add column if not exists assignment_type text;

update public.student_assignments
set assignment_type = 'regular'
where assignment_type is null;

alter table public.student_assignments
  alter column assignment_type set default 'regular';

alter table public.student_assignments
  alter column assignment_type set not null;

alter table public.student_assignments
  drop constraint if exists student_assignments_assignment_type_check;

alter table public.student_assignments
  add constraint student_assignments_assignment_type_check
  check (assignment_type in ('regular', 'trial'));

alter table public.student_assignments
  drop constraint if exists student_assignments_trial_shape_check;

alter table public.student_assignments
  add constraint student_assignments_trial_shape_check
  check (
    assignment_type <> 'trial'
    or (
      plan = 'economy'
      and lesson_duration_minutes in (60, 120)
      and weekly_frequency = 1
      and settlement_sessions = 1
      and teacher_payout_amount = 20000
      and four_lesson_tuition is null
      and nado_fee_percent is null
      and four_lesson_nado_fee is null
      and four_lesson_teacher_payout is null
    )
  );

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

commit;
