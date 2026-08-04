(() => {
  "use strict";

  const STORAGE_KEY = "nado-ui-language";
  const SUPPORTED = new Set(["ko", "en"]);
  const translations = {
  "수업 준비부터": "From lesson prep",
  "일정 제출까지.": "to schedule submission.",
  "선생님이 수업에만 집중할 수 있도록 필요한 정보와 업무를 한곳에 모았습니다.": "Everything you need to manage lessons is organized in one place, so you can focus on teaching.",
  "주간 가능 스케줄 제출·수정": "Submit and update weekly availability",
  "첫 수업 가이드와 커리큘럼 확인": "Review the first-lesson guide and curriculum",
  "교육 영상과 공지사항 열람": "View training videos and notices",
  "선생님 로그인": "Teacher Login",
  "나도에서 등록한 이메일과 비밀번호를 입력해주세요.": "Enter the email and password registered by NADO.",
  "이메일": "Email",
  "비밀번호": "Password",
  "비밀번호 입력": "Enter your password",
  "로그인": "Log In",
  "비밀번호를 잊으셨나요?": "Forgot your password?",
  "계정이 없거나 로그인이 되지 않으면 나도 운영팀에 문의해주세요.": "Contact the NADO operations team if you do not have an account or cannot log in.",
  "나도 Teachers": "NADO Teachers",
  "나도 Teachers 홈": "NADO Teachers Home",
  "수업을 시작하기 전에": "Before you start teaching,",
  "선생님 정보를 완성해주세요.": "please complete your profile.",
  "입력하신 정보는 학생 매칭과 첫 달 수업료 정산을 위해 사용됩니다. 최초 한 번만 작성하면 됩니다.": "This information is used for student matching and your first-month payout. You only need to complete it once.",
  "로그인 계정": "Signed-in account",
  "필수 프로필 작성": "Required Profile Setup",
  "모든 항목을 입력해야 나도 Teachers를 이용할 수 있습니다.": "Complete every field before using NADO Teachers.",
  "필수 입력": "Required",
  "이름": "Name",
  "학교": "University",
  "전공": "Major",
  "휴대전화": "Mobile number",
  "은행명": "Bank name",
  "계좌번호": "Account number",
  "한 줄 소개": "Short introduction",
  "예: 카카오뱅크": "e.g. KakaoBank",
  "숫자와 하이픈(-)만 입력": "Use numbers and hyphens (-) only",
  "학생들에게 보여줄 간단한 소개를 작성해주세요.": "Write a short introduction for students.",
  "정산 계좌를 정확히 확인해주세요.": "Please verify your payout account carefully.",
  "은행명 또는 계좌번호가 정상적으로 입력되지 않으면 첫 달 수업료 지급이 지연되거나 차질이 발생할 수 있습니다.": "Incorrect bank details may delay or disrupt your first-month payout.",
  "다른 계정으로 로그인": "Sign in with another account",
  "프로필 저장하고 시작하기": "Save Profile and Continue",
  "내 정보": "My Profile",
  "운영팀이 매칭에 참고할 기본 정보를 관리합니다.": "Manage the basic information used by the operations team for matching.",
  "기본 정보 및 정산 계좌": "Profile and Payout Account",
  "아래 항목은 매칭과 첫 달 수업료 정산을 위해 모두 필수입니다.": "All fields below are required for matching and the first-month payout.",
  "내 정보 저장": "Save Profile",
  "메뉴 닫기": "Close menu",
  "메뉴 열기": "Open menu",
  "선생님 메뉴": "Teacher menu",
  "홈": "Home",
  "학생 기록": "Student History",
  "스케줄 제출": "Availability",
  "첫 수업 가이드": "First Lesson Guide",
  "커리큘럼": "Curriculum",
  "교육 영상": "Training Videos",
  "관리자 페이지": "Admin Page",
  "도움이 필요하신가요?": "Need help?",
  "수업 또는 정산 문의는 운영팀에 연락해주세요.": "Contact the operations team about lessons or payouts.",
  "운영팀 문의": "Contact Operations",
  "로그아웃": "Log Out",
  "선생님": "Teacher",
  "현재 학생": "Current Students",
  "정산 예정일까지 나도에서 관리하는 학생입니다.": "Students managed by NADO through the scheduled payout date.",
  "학생 기록 보기 →": "View Student History →",
  "중요 공지사항": "Important Notices",
  "운영팀에서 전달하는 수업 및 정산 안내를 꼭 확인해주세요.": "Please review lesson and payout updates from the operations team.",
  "운영 공지": "Operations Notice",
  "오늘도 좋은 수업 부탁드려요.": "Have a great lesson today.",
  "스케줄 제출과 수업 준비 자료를 이 페이지에서 바로 확인할 수 있습니다.": "Check availability submissions and lesson-prep materials directly from this page.",
  "제출한 스케줄": "Submitted Availability",
  "아직 제출된 스케줄이 없습니다.": "No availability has been submitted yet.",
  "수정하기 →": "Edit →",
  "수업 운영 방법 빠르게 익히기": "Quickly learn how to manage lessons",
  "첫 만남 전 필수 체크사항": "Essential checklist before the first meeting",
  "현재 나도에서 관리 중인 학생이 없습니다.": "There are no students currently managed by NADO.",
  "아직 지난 학생 기록이 없습니다.": "There is no past student history yet.",
  "학생 이름": "Student name",
  "첫 수업일": "First lesson date",
  "첫 달 수업료 정산 예정일": "First-month payout date",
  "첫 달 수업료 정산일": "First-month payout date",
  "정산 완료": "Payout completed",
  "플랜 미지정": "Plan not selected",
  "이코노미": "Economy",
  "스탠다드": "Standard",
  "프리미엄": "Premium",
  "지난 학생": "Past Students",
  "첫 달 수업료 정산일이 지난 학생을 확인할 수 있습니다. 기록은 삭제되지 않고 계속 보관됩니다.": "View students whose first-month payout date has passed. Records remain available and are not deleted.",
  "자동 기록 안내": "Automatic history",
  "정산 예정일 당일까지는 현재 학생으로 표시되고, 다음 날부터 학생 기록으로 자동 이동합니다.": "A student remains under Current Students through the payout date and moves to Student History the following day.",
  "수업 가능 스케줄 제출": "Submit Lesson Availability",
  "주간 시간표에서 매칭 가능한 시간을 모두 선택해주세요. 선택한 시간은 언제든 다시 수정할 수 있습니다.": "Select every weekly time slot when you are available for matching. You can update your selection at any time.",
  "수업 가능한 요일과 시간 등록": "Choose available days and times",
  "When2meet처럼 가능한 모든 시간 칸을 선택한 뒤 한 번에 저장해주세요.": "Select all available time slots like When2meet, then save them at once.",
  "저장 전": "Not saved",
  "저장됨": "Saved",
  "저장 필요": "Changes not saved",
  "가능 시간 선택": "Select Availability",
  "선택 가능": "Available",
  "선택됨": "Selected",
  "시간": "Time",
  "주간 수업 가능 시간 선택표": "Weekly availability grid",
  "PC에서는 시작 칸을 누른 채 드래그하고, 모바일에서는 가능한 시간 칸을 하나씩 탭해주세요. 선택된 칸은 파란색으로 표시됩니다.": "On desktop, click and drag from a starting cell. On mobile, tap each available time slot. Selected slots appear in blue.",
  "선호 장소": "Preferred location",
  "송도 내 협의": "Discuss within Songdo",
  "트리플스트리트": "Triple Street",
  "장소 배정 안내": "Location assignment notice",
  "선호 장소는 매칭 시 참고용이며 반드시 해당 장소로 배정되는 것은 아닙니다. 학생이 선택한 요금제와 선호 조건에 따라 학생의 희망 장소를 우선해 다른 장소로 조율해야 할 수 있습니다.": "Your preferred location is used as a reference and is not guaranteed. Depending on the student’s plan and preferences, you may need to coordinate a different location that prioritizes the student’s request.",
  "운영팀에 전달할 메모": "Note for the operations team",
  "예: 월요일은 18시 이후만 가능하며, 시험 기간에는 일정이 변경될 수 있습니다.": "e.g. I am available after 6 PM on Mondays, and my schedule may change during exam periods.",
  "전체 삭제": "Clear All",
  "스케줄 저장하기": "Save Availability",
  "현재 선택한 시간": "Selected Times",
  "추가된 시간대가 없습니다.": "No time slots have been added.",
  "선택한 가능 시간이 없습니다.": "No available times selected.",
  "안내": "Note",
  "실제 수업 일정은 학생과 매칭된 이후 조율될 수 있습니다. 가능한 시간을 넓게 제출할수록 빠른 매칭에 도움이 됩니다.": "The final lesson schedule may be coordinated after matching. Providing broader availability can help you get matched faster.",
  "시간표 선택 상태 안내": "Availability selection status",
  "이 시간대 선택 해제": "Deselect this time slot",
  "첫 수업 전 필수 가이드": "Required First-Lesson Guide",
  "처음 만나는 학생에게 좋은 경험을 제공하기 위해 아래 순서대로 준비해주세요.": "Follow the steps below to give a new student a great first experience.",
  "첫 수업 준비도": "First-lesson readiness",
  "나도가 보낸 학생 정보 확인": "Review the student information from NADO",
  "학생 이름, 목표, 레벨, 선호 시간과 장소를 먼저 확인합니다.": "Review the student’s name, goals, level, preferred time, and location first.",
  "나도 단톡방에 전달되는 학생 정보 예시": "Example student information shared in the NADO group chat",
  "학생에게 첫 안내 문자 보내기": "Send the first message to the student",
  "수업 방식, 배우고 싶은 내용, 원하시는 장소, 희망 첫 수업 일정을 편하게 여쭤봅니다.": "Ask about the preferred lesson style, learning goals, location, and first-lesson schedule.",
  "1. 원하시는 수업 방식": "1. Preferred lesson style",
  "2. 배우고 싶은 내용": "2. What the student wants to learn",
  "3. 원하시는 장소": "3. Preferred location",
  "4. 희망 첫 수업 일정": "4. Preferred first-lesson schedule",
  "문자 포맷": "Message template",
  "빈칸을 채워서 학생에게 첫 안내 문자로 보내주세요.": "Fill in the blanks and send this as your first message to the student.",
  "안녕하세요! 이번에 영어회화 수업을 맡게 된 [이름]이라고 합니다. 만나서 반갑습니다 😊": "Hello! My name is [Name], and I will be your English conversation teacher. Nice to meet you 😊",
  "수업 시작 전에 원하시는 수업 방식이나 배우고 싶은 내용을 편하게 말씀해주시면, 미리 참고해서 준비하겠습니다!": "Before we begin, please feel free to tell me your preferred lesson style or what you would like to learn. I will use that information to prepare in advance!",
  "원하시는 수업 장소를 구체적으로 말씀해주세요.": "Please let me know your preferred lesson location in detail.",
  "첫 수업은 [쌤이 원하는 날짜] 오전/오후 [희망 시간]에 가능하실까요?": "Would you be available for the first lesson on [Teacher’s preferred date] at [Preferred time] AM/PM?",
  "편하신 시간에 답변 주시면 일정 확정하겠습니다 :)": "Reply whenever convenient, and I will confirm the schedule :)",
  "빠른 매칭을 위해 1~2일 내로 답변 부탁드립니다.": "Please reply within 1–2 days to help us complete the matching quickly.",
  "확정된 장소 및 시간 '나도' 단톡에 알리기": "Share the confirmed time and location in the NADO group chat",
  "일정이 확정되면 단톡방에 학생명, 일시, 장소를 반드시 남겨주세요.": "Once confirmed, post the student name, date, time, and location in the group chat.",
  "공지 포맷": "Notice template",
  "[학생명] 학생 첫 수업 확정되었습니다. 일시: 8/OO(요일) 오후 O시, 장소: OOO": "[Student name]’s first lesson is confirmed. Date/time: 8/OO (Day) O PM, Location: OOO",
  "학생 맞춤 질문 준비": "Prepare personalized questions",
  "나도가 보낸 학생 정보와 문자 답변에서 파악한 관심사·목표를 바탕으로, 부담 없이 답할 수 있는 대화 주제 2~3가지를 미리 준비합니다.": "Prepare two or three easy conversation topics based on the student’s interests and goals from the information and messages you received.",
  "커리큘럼 탭에서 자료 보기 →": "View materials in Curriculum →",
  "수업 자료와 커리큘럼": "Lesson Materials and Curriculum",
  "학생의 수준과 목표에 맞게 선택하여 활용하세요. 운영팀이 Supabase에서 자료를 추가하면 자동으로 표시됩니다.": "Choose materials based on the student’s level and goals. New materials added by the operations team in Supabase appear automatically.",
  "선생님 교육 영상": "Teacher Training Videos",
  "첫 수업 전 핵심 영상부터 순서대로 시청해주세요.": "Watch the essential videos in order before your first lesson.",
  "등록된 자료가 없습니다. 관리자에게 자료 URL 등록을 요청해주세요.": "No materials are available. Ask an administrator to add a material URL.",
  "자료 열기 →": "Open Material →",
  "등록된 교육 영상이 없습니다.": "No training videos are available.",
  "영상 URL을 확인해주세요.": "Please check the video URL.",
  "현재 등록된 공지사항이 없습니다.": "There are no current notices.",
  "나도 Teachers 관리자": "NADO Teachers Admin",
  "선생님 화면": "Teacher View",
  "선생님 운영 관리": "Teacher Operations Management",
  "학생 배정과 정산 예정일을 등록하고, 선생님별 가능 스케줄을 확인할 수 있습니다.": "Manage student assignments and payout dates, and review each teacher’s availability.",
  "등록 선생님": "Registered Teachers",
  "제출 시간대": "Submitted Time Slots",
  "최근 업데이트": "Latest Update",
  "학생 배정 및 정산 관리": "Student Assignment and Payout Management",
  "담당 선생님, 학생 플랜, 첫 수업일과 첫 달 수업료 정산 예정일을 등록하세요.": "Select the teacher and plan, then enter the first-lesson and first-month payout dates.",
  "새 학생 배정": "New Student Assignment",
  "담당 선생님": "Assigned teacher",
  "선생님을 선택해주세요": "Select a teacher",
  "학생 이름 입력": "Enter student name",
  "학생 플랜": "Student plan",
  "플랜을 선택해주세요": "Select a plan",
  "정산 예정일": "Scheduled payout date",
  "학생 배정 등록": "Add Student Assignment",
  "수정 취소": "Cancel Edit",
  "정산 예정일 당일까지 현재 학생으로 표시되며, 다음 날 학생 기록으로 자동 분류됩니다.": "The student appears under Current Students through the payout date and is automatically moved to Student History the following day.",
  "학생 관리 목록": "Student Management List",
  "학생 상태 필터": "Student status filter",
  "전체": "All",
  "선생님 스케줄": "Teacher Availability",
  "선생님별 제출 시간과 정산 계좌 정보를 확인할 수 있습니다.": "Review each teacher’s submitted availability and payout account information.",
  "선생님 검색": "Search teachers",
  "이름 또는 이메일 검색": "Search by name or email",
  "요일 필터": "Day filter",
  "전체 요일": "All days",
  "CSV 다운로드": "Download CSV",
  "사이트 콘텐츠 관리": "Site Content Management",
  "공지사항, 커리큘럼 링크, YouTube 교육 영상을 이 화면에서 등록할 수 있습니다.": "Add notices, curriculum links, and YouTube training videos from this page.",
  "공지사항 등록": "Add Notice",
  "제목": "Title",
  "내용": "Content",
  "공지 등록": "Publish Notice",
  "수업 자료 등록": "Add Lesson Material",
  "자료 제목": "Material title",
  "설명": "Description",
  "종류": "Type",
  "순서": "Order",
  "공유 URL": "Share URL",
  "자료 등록": "Add Material",
  "교육 영상 등록": "Add Training Video",
  "영상 제목": "Video title",
  "영상 등록": "Add Video",
  "일": "Sun",
  "월": "Mon",
  "화": "Tue",
  "수": "Wed",
  "목": "Thu",
  "금": "Fri",
  "토": "Sat",
  "일요일": "Sunday",
  "월요일": "Monday",
  "화요일": "Tuesday",
  "수요일": "Wednesday",
  "목요일": "Thursday",
  "금요일": "Friday",
  "토요일": "Saturday",
  "처리 중...": "Processing...",
  "로그아웃 중...": "Logging out...",
  "등록 중...": "Adding...",
  "수정 중...": "Updating...",
  "모든 학생 배정 정보를 입력해주세요.": "Complete all student assignment fields.",
  "정산 예정일은 첫 수업일과 같거나 이후여야 합니다.": "The payout date must be on or after the first lesson date.",
  "학생 배정 저장 실패:": "Failed to save student assignment:",
  "학생 배정 정보를 수정했습니다.": "Student assignment updated.",
  "학생을 선생님에게 배정했습니다.": "Student assigned to the teacher.",
  "학생 배정 삭제 실패:": "Failed to delete student assignment:",
  "학생 배정 정보를 삭제했습니다.": "Student assignment deleted.",
  "배정 정보 수정": "Edit Assignment",
  "학생 배정 수정": "Update Assignment",
  "삭제": "Delete",
  "현재 관리 중인 학생이 없습니다.": "There are no currently managed students.",
  "아직 학생 기록이 없습니다.": "There is no student history yet.",
  "아직 등록된 학생 배정이 없습니다.": "No student assignments have been added yet.",
  "등록된 항목이 없습니다.": "No items have been added.",
  "콘텐츠 목록 일부를 불러오지 못했습니다.": "Some content lists could not be loaded.",
  "공지사항을 등록했습니다.": "Notice published.",
  "수업 자료를 등록했습니다.": "Lesson material added.",
  "교육 영상을 등록했습니다.": "Training video added.",
  "이 항목을 삭제할까요?": "Delete this item?",
  "삭제 실패:": "Delete failed:",
  "삭제했습니다.": "Deleted.",
  "이름 미입력": "Name not entered",
  "학교 미입력": "University not entered",
  "없음": "None",
  "미제출": "Not submitted",
  "먼저 js/config.js에 Supabase 주소와 키를 입력해주세요.": "Enter the Supabase URL and key in js/config.js first.",
  "로그인 세션을 만들지 못했습니다.": "Could not create a login session.",
  "이메일 또는 비밀번호를 확인해주세요.": "Check your email and password.",
  "로그인 중 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.": "An error occurred while signing in. Refresh the page and try again.",
  "먼저 이메일을 입력해주세요.": "Enter your email first.",
  "비밀번호 재설정 메일을 보냈습니다.": "A password reset email has been sent.",
  "로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.": "Log out failed. Please try again shortly.",
  "계좌번호는 숫자와 하이픈(-)만 사용해 8자 이상 입력해주세요.": "Use at least 8 characters containing only numbers and hyphens (-) for the account number.",
  "내 정보가 저장되었습니다.": "Your profile has been saved.",
  "프로필 데이터베이스 설정이 필요합니다. 운영팀에 문의해주세요.": "The profile database needs to be configured. Contact the operations team.",
  "알 수 없는 오류": "Unknown error",
  "최초 프로필 설정용 데이터베이스 업데이트가 필요합니다.": "A database update is required for first-time profile setup.",
  "프로필 작성이 완료되었습니다.": "Profile setup completed.",
  "스케줄을 불러오지 못했습니다.": "Could not load availability.",
  "현재 선택한 가능 시간과 메모를 모두 삭제할까요? 저장 버튼을 누르기 전까지 서버 데이터는 유지됩니다.": "Clear all selected availability and notes? Server data remains unchanged until you press Save.",
  "가능 시간을 비워서 저장할까요? 기존 제출 내용이 모두 삭제됩니다.": "Save with no available times? All previously submitted availability will be deleted.",
  "선호 장소를 선택해주세요.": "Select a preferred location.",
  "가능 시간이 운영팀에 제출되었습니다.": "Your availability has been submitted to the operations team.",
  "연락처": "Contact",
  "미입력": "Not entered",
  "은행 미입력": "Bank not entered",
  "계좌번호 미입력": "Account number not entered",
  "제출된 시간이 없습니다.": "No submitted time slots.",
  "조건에 맞는 선생님이 없습니다.": "No teachers match the selected conditions.",
  "데이터를 불러오지 못했습니다:": "Failed to load data:",
  "관리자 권한이 없습니다.": "You do not have administrator access.",
  "js/config.js에 Supabase 정보를 입력해주세요.": "Enter the Supabase information in js/config.js.",
  "학생 배정 테이블을 불러오지 못했습니다.": "Could not load the student assignment table.",
  "Supabase에서 학생 배정 SQL을 먼저 실행해주세요.": "Run the student assignment SQL in Supabase first.",
  "담당": "Teacher",
  "삭제된 선생님": "Deleted teacher",
  "정산일": "Payout date",
  "수정": "Edit",
  "공지 등록 실패:": "Failed to publish notice:",
  "자료 등록 실패:": "Failed to add material:",
  "영상 등록 실패:": "Failed to add video:",
  "시작": "Start",
  "종료": "End",
  "장소": "Location",
  "메모": "Note",
  "업데이트": "Updated"
};
  const partials = {
  " 항목을 입력해주세요.": " field is required.",
  "저장에 실패했습니다: ": "Save failed: ",
  "프로필 저장에 실패했습니다: ": "Profile save failed: ",
  "기존 스케줄 정리에 실패했습니다: ": "Failed to clear the previous availability: ",
  "정산 계좌": "Payout account",
  "메모:": "Note:",
  "업데이트 ": "Updated ",
  "순서 ": "Order ",
  "요일 ": " ",
  "부터 30분": " for 30 minutes",
  "학생의 배정 정보를 삭제할까요?": "student assignment?"
};
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let observer = null;
  let currentLanguage = readInitialLanguage();

  function readInitialLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.has(saved)) return saved;
    } catch (_) {}
    return String(navigator.language || "ko").toLowerCase().startsWith("en") ? "en" : "ko";
  }

  function preserveWhitespace(source, translated) {
    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    return leading + translated + trailing;
  }

  function translatePattern(value) {
    if (!value) return value;
    if (translations[value]) return translations[value];

    let match = value.match(/^(\d+)\s*명$/);
    if (match) return match[1];
    match = value.match(/^(\d+)\s*건$/);
    if (match) return match[1];
    match = value.match(/^(\d+)\s*개$/);
    if (match) return `${match[1]}`;
    match = value.match(/^(\d+)\s*개 시간대$/);
    if (match) return `${match[1]} time slot${match[1] === "1" ? "" : "s"}`;
    match = value.match(/^(\d+)\s*칸 선택$/);
    if (match) return `${match[1]} slot${match[1] === "1" ? "" : "s"} selected`;
    match = value.match(/^(\d+)\s*\/\s*(\d+)\s*완료$/);
    if (match) return `${match[1]} / ${match[2]} completed`;
    match = value.match(/^([일월화수목금토])요일\s+(\d{2}:\d{2})부터 30분$/);
    if (match) {
      const shortDays = { "일": "Sunday", "월": "Monday", "화": "Tuesday", "수": "Wednesday", "목": "Thursday", "금": "Friday", "토": "Saturday" };
      return `${shortDays[match[1]]} ${match[2]} for 30 minutes`;
    }
    match = value.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(date);
    }
    match = value.match(/^(.+?)요일$/);
    if (match && translations[value]) return translations[value];
    match = value.match(/^(.+?) 학생의 배정 정보를 삭제할까요\?$/);
    if (match) return `Delete the assignment for ${match[1]}?`;
    match = value.match(/^(.+?) 항목을 입력해주세요\.$/);
    if (match) return `${translations[match[1]] || match[1]} is required.`;

    let output = value;
    Object.entries(partials).forEach(([ko, en]) => { output = output.replaceAll(ko, en); });
    return output;
  }

  function isUserAuthoredContent(element) {
    return Boolean(element?.closest?.(
      "#announcementList h4, #announcementList p, #announcementList .announcement-item strong, " +
      "#resourceGrid h3, #resourceGrid p, #videoGrid h3, #videoGrid p, " +
      ".assignment-student-name strong, .admin-assignment-person > strong, " +
      ".teacher-admin-profile strong, .teacher-admin-profile span, .teacher-admin-bio strong, .admin-memo"
    ));
  }

  function isTranslatableTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) return false;
    if (isUserAuthoredContent(node.parentElement)) return false;
    return /[가-힣]/.test(node.nodeValue || "");
  }

  function translateTextNode(node) {
    const source = node.nodeValue || "";
    if (!originalText.has(node) || source !== originalText.get(node)?.translated) {
      originalText.set(node, { korean: source, translated: source });
    }
    const record = originalText.get(node);
    const core = record.korean.trim();
    if (!core) return;
    const translatedCore = translatePattern(core);
    const translated = preserveWhitespace(record.korean, translatedCore);
    record.translated = translated;
    node.nodeValue = translated;
  }

  function restoreTextNode(node) {
    const record = originalText.get(node);
    if (record) node.nodeValue = record.korean;
  }

  const ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];

  function translateAttribute(element, attribute) {
    const value = element.getAttribute(attribute);
    if (!value || !/[가-힣]/.test(value)) return;
    let records = originalAttributes.get(element);
    if (!records) { records = new Map(); originalAttributes.set(element, records); }
    const existing = records.get(attribute);
    if (!existing || value !== existing.translated) records.set(attribute, { korean: value, translated: value });
    const record = records.get(attribute);
    record.translated = translatePattern(record.korean);
    element.setAttribute(attribute, record.translated);
  }

  function restoreAttributes(element) {
    const records = originalAttributes.get(element);
    if (!records) return;
    records.forEach((record, attribute) => element.setAttribute(attribute, record.korean));
  }

  function walk(root, action) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) action(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      ATTRIBUTES.forEach((attribute) => action(root, attribute));
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) action(node);
      else ATTRIBUTES.forEach((attribute) => action(node, attribute));
    }
  }

  function applyLanguage(root = document) {
    if (observer) observer.disconnect();
    if (currentLanguage === "en") {
      walk(root, (node, attribute) => {
        if (attribute) translateAttribute(node, attribute);
        else if (isTranslatableTextNode(node)) translateTextNode(node);
      });
    } else {
      walk(root, (node, attribute) => {
        if (attribute) restoreAttributes(node);
        else restoreTextNode(node);
      });
    }
    document.documentElement.lang = currentLanguage;
    updateToggle();
    connectObserver();
    document.dispatchEvent(new CustomEvent("nado:languagechange", { detail: { language: currentLanguage } }));
  }

  function connectObserver() {
    if (!document.body) return;
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        if (currentLanguage !== "en") return;
        observer.disconnect();
        mutations.forEach((mutation) => {
          if (mutation.type === "characterData") {
            if (isTranslatableTextNode(mutation.target)) translateTextNode(mutation.target);
          } else if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => walk(node, (target, attribute) => {
              if (attribute) translateAttribute(target, attribute);
              else if (isTranslatableTextNode(target)) translateTextNode(target);
            }));
          } else if (mutation.type === "attributes") {
            translateAttribute(mutation.target, mutation.attributeName);
          }
        });
        connectObserver();
      });
    }
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  }

  function createToggle() {
    if (document.getElementById("nadoLanguageToggle")) return;
    const wrapper = document.createElement("div");
    wrapper.id = "nadoLanguageToggle";
    wrapper.className = "nado-language-toggle";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", "언어 선택");
    wrapper.innerHTML = `
      <button type="button" data-nado-language="ko">한국어</button>
      <button type="button" data-nado-language="en">English</button>`;
    wrapper.addEventListener("click", (event) => {
      const button = event.target.closest("[data-nado-language]");
      if (button) setLanguage(button.dataset.nadoLanguage);
    });
    document.body.appendChild(wrapper);
  }

  function updateToggle() {
    const toggle = document.getElementById("nadoLanguageToggle");
    if (!toggle) return;
    toggle.querySelectorAll("[data-nado-language]").forEach((button) => {
      const active = button.dataset.nadoLanguage === currentLanguage;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    toggle.setAttribute("aria-label", currentLanguage === "en" ? "Select language" : "언어 선택");
  }

  function setLanguage(language) {
    if (!SUPPORTED.has(language) || language === currentLanguage) return;
    currentLanguage = language;
    try { localStorage.setItem(STORAGE_KEY, language); } catch (_) {}
    applyLanguage(document);
  }

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  window.alert = (message) => nativeAlert(currentLanguage === "en" ? translatePattern(String(message)) : message);
  window.confirm = (message) => nativeConfirm(currentLanguage === "en" ? translatePattern(String(message)) : message);

  window.NADO_I18N = {
    setLanguage,
    getLanguage: () => currentLanguage,
    translate: (value) => currentLanguage === "en" ? translatePattern(String(value)) : String(value),
    refresh: () => applyLanguage(document)
  };

  function init() {
    createToggle();
    applyLanguage(document);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
