(() => {
  "use strict";
  const config = window.NADO_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const supabase = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const PROFILE_PHOTO_BUCKET = "profile-photos";
  const PROFILE_PHOTO_SIGNED_URL_SECONDS = 60 * 60;
  const CURRENT_AGREEMENT_VERSION = "v1.4";
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const planLabels = { economy: "이코노미", standard: "스탠다드", premium: "프리미엄" };
  const pricingCatalog = window.NADO_PRICING || {};
  const NADO_FEE_RATE = pricingCatalog.NADO_FEE_RATE ?? 0.35;
  const PACKAGE_SESSIONS = pricingCatalog.PACKAGE_SESSIONS ?? 4;
  const PRICING_VERSION = pricingCatalog.PRICING_VERSION || "NADO-2026-08-60-120-W2";
  const TRIAL_PLAN = pricingCatalog.TRIAL_PLAN || "economy";
  const TRIAL_TEACHER_PAYOUT = pricingCatalog.TRIAL_TEACHER_PAYOUT ?? 20000;
  const TRIAL_PRICING_VERSION = pricingCatalog.TRIAL_PRICING_VERSION || "NADO-TRIAL-FREE-20000-2026-08";
  const lessonPriceTable = pricingCatalog.lessonPriceTable || {
    economy: { 30: 80000, 35: 93400, 40: 106700, 45: 120000, 60: 140000, 70: 163400, 80: 186700, 90: 210000, 100: 233400, 110: 256700, 120: 280000 },
    standard: { 30: 100000, 35: 116700, 40: 133400, 45: 150000, 60: 180000, 70: 210000, 80: 240000, 90: 270000, 100: 300000, 110: 330000, 120: 360000 },
    premium: { 30: 120000, 35: 140000, 40: 160000, 45: 180000, 60: 220000, 70: 256700, 80: 293400, 90: 330000, 100: 366700, 110: 403400, 120: 440000 }
  };
  let teachers = [];
  let assignments = [];
  let assignmentFilter = "current";
  let editingAssignmentId = null;
  let adminLogoutInProgress = false;
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const contentCache = { announcement: [], resource: [], video: [] };
  const editingContentId = { announcement: null, resource: null, video: null };

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function currentLanguage() {
    return window.NADO_I18N?.getLanguage?.() || "ko";
  }

  function currentLocale() {
    return currentLanguage() === "en" ? "en-US" : "ko-KR";
  }

  function stringHash(value = "") {
    let hash = 0;
    for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash);
  }

  function hueFor(value, offset = 0) {
    return (stringHash(value) * 47 + offset) % 360;
  }

  async function signedProfilePhotoUrl(photoPath) {
    if (!photoPath) return "";
    const { data, error } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrl(photoPath, PROFILE_PHOTO_SIGNED_URL_SECONDS);
    if (error) {
      console.warn("Admin profile photo signed URL failed:", error);
      return "";
    }
    return data?.signedUrl || "";
  }

  async function hydrateTeacherPhotos() {
    await Promise.all(teachers.map(async (teacher) => {
      teacher.profile_photo_url = await signedProfilePhotoUrl(teacher.profile_photo_path);
    }));
  }


  async function hydrateTeacherAgreements() {
    const { data, error } = await supabase
      .from("teacher_agreements")
      .select("teacher_id, teacher_name, agreement_version, agreed_at")
      .eq("agreement_version", CURRENT_AGREEMENT_VERSION);
    if (error) {
      console.error("Teacher agreement lookup failed:", error);
      throw error;
    }
    const agreementMap = new Map((data || []).map((item) => [item.teacher_id, item]));
    teachers.forEach((teacher) => { teacher.agreement = agreementMap.get(teacher.id) || null; });
  }

  function safeDownloadName(value = "teacher") {
    return String(value || "teacher").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_") || "teacher";
  }

  async function downloadTeacherProfilePhoto(teacherId, button) {
    const teacher = teachers.find((item) => item.id === teacherId);
    if (!teacher?.profile_photo_path) return toast("등록된 프로필 사진이 없습니다.", true);
    const originalText = button?.textContent || "사진 다운로드";
    if (button) { button.disabled = true; button.textContent = "다운로드 중..."; }
    try {
      const { data, error } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).download(teacher.profile_photo_path);
      if (error) throw error;
      const extension = teacher.profile_photo_path.split(".").pop()?.toLowerCase() || "jpg";
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeDownloadName(teacher.full_name || teacher.email)}_profile.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      console.error("Profile photo download failed:", error);
      toast("프로필 사진 다운로드에 실패했습니다.", true);
    } finally {
      if (button) { button.disabled = false; button.textContent = originalText; }
    }
  }

  function toast(message, error = false) { const el = $("toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`; setTimeout(() => el.className = "toast", 2600); }

  function formatKoreanDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return "-";
    return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function planLabel(plan) {
    return planLabels[plan] || "플랜 미지정";
  }

  function assignmentTypeLabel(value) {
    const isTrial = value === "trial";
    if (currentLanguage() === "en") return isTrial ? "Free trial lesson" : "Regular lesson";
    return isTrial ? "무료 체험수업" : "정규 수업";
  }

  function isTrialAssignment(assignment) {
    return assignment?.assignment_type === "trial";
  }

  function lessonDurationLabel(minutes) {
    const value = Number(minutes);
    if (!value) return currentLanguage() === "en" ? "Lesson time not set" : "수업 시간 미지정";
    if (currentLanguage() === "en") {
      if (value < 60) return `${value} min`;
      if (value === 60) return "1 hr";
      if (value === 120) return "2 hr";
      return `1 hr ${value - 60} min`;
    }
    if (value < 60) return `${value}분`;
    if (value === 60) return "1시간";
    if (value === 120) return "2시간";
    return `1시간 ${value - 60}분`;
  }

  function weeklyFrequencyLabel(value) {
    const count = Number(value);
    if (!count) return currentLanguage() === "en" ? "Frequency not set" : "수업 빈도 미지정";
    return currentLanguage() === "en" ? `${count}x/week` : `주 ${count}회`;
  }

  function sessionCountLabel(value) {
    const count = Number(value);
    if (!count) return currentLanguage() === "en" ? "Not set" : "미지정";
    return currentLanguage() === "en" ? `${count} session${count === 1 ? "" : "s"}` : `${count}회`;
  }

  function formatWon(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "-";
    return currentLanguage() === "en" ? `₩${Math.round(amount).toLocaleString("en-US")}` : `${Math.round(amount).toLocaleString("ko-KR")}원`;
  }

  function packageSessionCount(weeklyFrequency) {
    const weekly = Number(weeklyFrequency);
    return PACKAGE_SESSIONS * (weekly === 2 ? 2 : 1);
  }

  function pricingFor(plan, durationMinutes, weeklyFrequency, settlementSessions) {
    const baseTuition = lessonPriceTable[plan]?.[Number(durationMinutes)];
    const weekly = Number(weeklyFrequency);
    const sessions = Number(settlementSessions);
    if (!baseTuition || ![1, 2].includes(weekly)) return null;

    const packageSessions = packageSessionCount(weekly);
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > packageSessions) return null;

    const baseNadoFee = Math.round(baseTuition * NADO_FEE_RATE);
    const baseTeacherPayout = baseTuition - baseNadoFee;
    const tuition = baseTuition * weekly;
    const nadoFee = baseNadoFee * weekly;
    const fullTeacherPayout = baseTeacherPayout * weekly;
    const teacherPayout = Math.round((baseTeacherPayout * sessions) / PACKAGE_SESSIONS);

    return {
      baseTuition,
      baseNadoFee,
      baseTeacherPayout,
      tuition,
      nadoFee,
      fullTeacherPayout,
      teacherPayout,
      sessions,
      packageSessions,
      weekly
    };
  }

  function trialPricingFor(durationMinutes) {
    const fromCatalog = pricingCatalog.trialPricing?.(durationMinutes);
    if (fromCatalog) return fromCatalog;
    const duration = Number(durationMinutes);
    if (![60, 120].includes(duration)) return null;
    return {
      plan: TRIAL_PLAN,
      durationMinutes: duration,
      studentTuition: 0,
      teacherPayout: TRIAL_TEACHER_PAYOUT,
      sessions: 1
    };
  }

  function syncSettlementSessionOptions(preferredValue = null) {
    const select = $("assignmentSettlementSessions");
    if (!select) return;
    const isTrial = $("assignmentType")?.value === "trial";
    const weekly = Number($("assignmentWeeklyFrequency")?.value) || 1;
    const maxSessions = isTrial ? 1 : packageSessionCount(weekly);
    const requested = Number(preferredValue);
    const nextValue = Number.isInteger(requested) && requested >= 1 && requested <= maxSessions
      ? requested
      : maxSessions;

    select.innerHTML = Array.from({ length: maxSessions }, (_, index) => {
      const count = index + 1;
      const label = currentLanguage() === "en" ? `${count} session${count === 1 ? "" : "s"}` : `${count}회`;
      return `<option value="${count}">${label}</option>`;
    }).join("");
    select.value = String(nextValue);
  }

  function syncAssignmentTypeFields(preferredSessions = null) {
    const isTrial = $("assignmentType")?.value === "trial";
    const planSelect = $("assignmentPlan");
    const weeklySelect = $("assignmentWeeklyFrequency");
    const sessionSelect = $("assignmentSettlementSessions");
    const note = $("assignmentPackageNote");
    const emailInput = $("assignmentStudentEmail");

    if (isTrial) {
      if (emailInput) emailInput.required = false;
      planSelect.value = TRIAL_PLAN;
      weeklySelect.value = "1";
      planSelect.disabled = true;
      weeklySelect.disabled = true;
      sessionSelect.disabled = true;
      syncSettlementSessionOptions(1);
      if (note) {
        note.textContent = currentLanguage() === "en"
          ? "Free trial lessons are handled as Economy. Students pay ₩0, and the Teacher receives ₩20,000 for one completed trial lesson."
          : "무료 체험수업은 Economy로 처리됩니다. 학생 결제 금액은 0원이며, 실제 체험수업 1회 진행 시 Teacher에게 20,000원이 지급됩니다.";
      }
    } else {
      if (emailInput) emailInput.required = true;
      planSelect.disabled = false;
      weeklySelect.disabled = false;
      sessionSelect.disabled = false;
      syncSettlementSessionOptions(preferredSessions);
      if (note) {
        note.textContent = currentLanguage() === "en"
          ? "Once a week uses 4 sessions and twice a week uses 8 sessions. If only part of a package is being settled, select the actual number of lessons taught by this Teacher."
          : "주 1회는 4회, 주 2회는 8회 기준으로 수업료와 첫 달 정산액이 계산됩니다. 선생님 교체 등으로 일부 수업만 정산할 경우 실제 담당 횟수를 선택해주세요.";
      }
    }
  }

  function assignmentHasPricing(assignment) {
    return Number.isFinite(Number(assignment?.teacher_payout_amount)) && Number(assignment?.settlement_sessions) > 0;
  }

  function renderAssignmentPricingPreview() {
    const target = $("assignmentPricingPreview");
    if (!target) return;

    const assignmentType = $("assignmentType")?.value || "regular";
    const duration = Number($("assignmentLessonDuration").value);

    if (assignmentType === "trial") {
      const pricing = trialPricingFor(duration);
      if (!pricing) {
        target.innerHTML = `<div class="assignment-pricing-placeholder">${escapeHtml(currentLanguage() === "en"
          ? "Select a lesson duration to see the trial-lesson payout."
          : "수업 시간을 선택하면 체험수업 지급액이 표시됩니다.")}</div>`;
        return;
      }

      target.innerHTML = `
        <div class="assignment-pricing-head">
          <div><span>${escapeHtml(currentLanguage() === "en" ? "Trial lesson payout" : "체험수업 지급")}</span><strong>${escapeHtml(assignmentTypeLabel("trial"))} · ${escapeHtml(planLabel(TRIAL_PLAN))} · ${escapeHtml(lessonDurationLabel(duration))}</strong></div>
          <span class="assignment-pricing-rate trial">${escapeHtml(currentLanguage() === "en" ? "Student FREE" : "학생 무료")}</span>
        </div>
        <dl class="assignment-pricing-grid">
          <div><dt>${escapeHtml(currentLanguage() === "en" ? "Student payment" : "학생 결제 금액")}</dt><dd>${escapeHtml(formatWon(0))}</dd></div>
          <div><dt>${escapeHtml(currentLanguage() === "en" ? "Trial lessons" : "체험수업 횟수")}</dt><dd>${escapeHtml(sessionCountLabel(1))}</dd></div>
          <div class="assignment-pricing-total"><dt>${escapeHtml(currentLanguage() === "en" ? "Teacher trial-lesson payout" : "Teacher 체험수업 지급액")}</dt><dd>${escapeHtml(formatWon(pricing.teacherPayout))}</dd></div>
        </dl>
        <p class="assignment-pricing-rounding">${escapeHtml(currentLanguage() === "en"
          ? "Trial lessons are recorded as Economy and are separate from the regular-package pricing table."
          : "체험수업은 Economy로 기록되며, 정규 패키지 가격표와 별도의 체험수업 지급 기준이 적용됩니다.")}</p>`;
      return;
    }

    const plan = $("assignmentPlan").value;
    const sessions = Number($("assignmentSettlementSessions").value);
    const weekly = Number($("assignmentWeeklyFrequency").value);
    const pricing = pricingFor(plan, duration, weekly, sessions);
    if (!pricing) {
      target.innerHTML = `<div class="assignment-pricing-placeholder">${escapeHtml(currentLanguage() === "en"
        ? "Select a plan and lesson duration to calculate the first-month payout."
        : "플랜과 수업 시간을 선택하면 첫 달 정산액이 자동 계산됩니다.")}</div>`;
      return;
    }
    const basisLabel = currentLanguage() === "en" ? `${pricing.packageSessions}-session` : `${pricing.packageSessions}회 기준`;
    target.innerHTML = `
      <div class="assignment-pricing-head">
        <div><span>${currentLanguage() === "en" ? "Automatic payout calculation" : "자동 정산 계산"}</span><strong>${escapeHtml(planLabel(plan))} · ${escapeHtml(lessonDurationLabel(duration))} · ${escapeHtml(weeklyFrequencyLabel(weekly))}</strong></div>
        <span class="assignment-pricing-rate">NADO 35%</span>
      </div>
      <dl class="assignment-pricing-grid">
        <div><dt>${escapeHtml(currentLanguage() === "en" ? `Student tuition (${pricing.packageSessions} sessions)` : `${basisLabel} 학생 수업료`)}</dt><dd>${escapeHtml(formatWon(pricing.tuition))}</dd></div>
        <div><dt>${escapeHtml(currentLanguage() === "en" ? "First-month NADO fee" : "첫 달 NADO 수수료")}</dt><dd>${escapeHtml(formatWon(pricing.nadoFee))}</dd></div>
        <div><dt>${escapeHtml(currentLanguage() === "en" ? `Teacher payout (${pricing.packageSessions} sessions)` : `${basisLabel} Teacher 정산액`)}</dt><dd>${escapeHtml(formatWon(pricing.fullTeacherPayout))}</dd></div>
        <div class="assignment-pricing-total"><dt>${escapeHtml(currentLanguage() === "en" ? `This teacher payout · ${sessionCountLabel(pricing.sessions)}` : `이번 Teacher 정산 예정액 · ${sessionCountLabel(pricing.sessions)}`)}</dt><dd>${escapeHtml(formatWon(pricing.teacherPayout))}</dd></div>
      </dl>
      <p class="assignment-pricing-rounding">${escapeHtml(currentLanguage() === "en"
        ? `Once a week uses 4 sessions and twice a week uses 8 sessions. Partial payouts are calculated from the 4-session per-session rate and rounded to the nearest won.`
        : `주 1회는 4회, 주 2회는 8회 기준입니다. 부분 정산은 4회 기준 1회당 정산 단가에 실제 담당 횟수를 적용하고 원 단위로 반올림합니다.`)}</p>`;
  }

  function assignmentGroups() {
    return {
      current: assignments.filter((item) => !item.status || item.status === "active"),
      history: assignments.filter((item) => item.status && item.status !== "active")
    };
  }

  async function initialize() {
    if (!supabase) return toast("js/config.js에 Supabase 정보를 입력해주세요.", true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return location.replace("index.html");
    const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (me?.role !== "admin") { alert("관리자 권한이 없습니다."); return location.replace("index.html"); }
    await loadData();
  }

  async function loadData() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, school, major, phone, kakao_id, bio, bank_name, account_number, profile_photo_path, availability(id, day_of_week, start_time, end_time, location, memo, updated_at)")
      .neq("role", "admin")
      .order("full_name");
    if (error) return toast("데이터를 불러오지 못했습니다: " + error.message, true);
    teachers = data || [];
    try {
      await Promise.all([hydrateTeacherPhotos(), hydrateTeacherAgreements()]);
    } catch (error) {
      toast("전자계약 데이터를 불러오지 못했습니다. Supabase 계약 업데이트 SQL을 확인해주세요.", true);
      return;
    }
    populateTeacherOptions();
    updateStats();
    render();
    await Promise.all([loadAssignments(), loadContent()]);
  }

  function populateTeacherOptions() {
    const select = $("assignmentTeacher");
    const previousValue = select.value;
    select.innerHTML = '<option value="">선생님을 선택해주세요</option>' + teachers.map((teacher) =>
      `<option value="${escapeHtml(teacher.id)}">${escapeHtml(teacher.full_name || "이름 미입력")} · ${escapeHtml(teacher.email || "")}</option>`
    ).join("");
    if (teachers.some((teacher) => teacher.id === previousValue)) select.value = previousValue;
    select.disabled = teachers.length === 0;
    $("assignmentSubmitButton").disabled = teachers.length === 0;
  }

  function updateStats() {
    const slots = teachers.flatMap((teacher) => teacher.availability || []);
    const latest = slots.map((slot) => slot.updated_at).filter(Boolean).sort().at(-1);
    $("teacherCount").textContent = `${teachers.length}명`;
    $("slotTotalCount").textContent = `${slots.length}개`;
    $("latestUpdate").textContent = latest ? new Date(latest).toLocaleDateString("ko-KR") : "없음";
    const { current } = assignmentGroups();
    $("assignmentTotalCount").textContent = `${current.length}명`;
    const acceptedCount = teachers.filter((teacher) => teacher.agreement?.agreement_version === CURRENT_AGREEMENT_VERSION).length;
    $("agreementAcceptedCount").textContent = `${acceptedCount}/${teachers.length}명`;
  }

  function filteredTeachers() {
    const keyword = $("teacherSearch").value.trim().toLowerCase();
    const day = $("dayFilter").value;
    return teachers.map((teacher) => ({
      ...teacher,
      availability: (teacher.availability || []).filter((slot) => day === "all" || String(slot.day_of_week) === day)
    })).filter((teacher) => {
      const matchesText = !keyword || `${teacher.full_name || ""} ${teacher.email || ""} ${teacher.school || ""} ${teacher.major || ""} ${teacher.phone || ""} ${teacher.kakao_id || ""}`.toLowerCase().includes(keyword);
      const matchesDay = day === "all" || teacher.availability.length > 0;
      return matchesText && matchesDay;
    });
  }

  function render() {
    const list = filteredTeachers();
    if (!list.length) {
      $("adminTeacherList").innerHTML = '<article class="panel empty-state">조건에 맞는 선생님이 없습니다.</article>';
      return;
    }
    $("adminTeacherList").innerHTML = list.map((teacher) => {
      const slots = [...(teacher.availability || [])].sort((a,b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
      const latest = slots.map((s) => s.updated_at).filter(Boolean).sort().at(-1);
      const memo = slots.find((s) => s.memo)?.memo;
      return `<article class="panel teacher-admin-card">
        <div class="teacher-admin-head">
          <div class="teacher-admin-profile">
            <span class="teacher-admin-avatar">${teacher.profile_photo_url
              ? `<img src="${escapeHtml(teacher.profile_photo_url)}" alt="${escapeHtml(teacher.full_name || "선생님")} 프로필 사진" loading="lazy" />`
              : `<b>${escapeHtml((teacher.full_name || "T").slice(0,1).toUpperCase())}</b>`}</span>
            <div><strong>${escapeHtml(teacher.full_name || "이름 미입력")}</strong><span>${escapeHtml(teacher.email || "")} · ${escapeHtml(teacher.school || "학교 미입력")} ${teacher.major ? `· ${escapeHtml(teacher.major)}` : ""}</span></div>
          </div>
          <div class="teacher-admin-head-actions">
            ${teacher.profile_photo_path ? `<button class="button ghost small teacher-photo-download" type="button" data-download-teacher-photo="${escapeHtml(teacher.id)}">사진 다운로드</button>` : ""}
            <span class="updated-at">${latest ? `업데이트 ${new Date(latest).toLocaleString(currentLocale())}` : "미제출"}</span>
          </div>
        </div>
        <div class="teacher-admin-details">
          <div><span>연락처</span><strong>${escapeHtml(teacher.phone || "미입력")}</strong></div>
          <div><span>카카오톡 ID</span><strong>${escapeHtml(teacher.kakao_id || "미입력")}</strong></div>
          <div><span>정산 계좌</span><strong>${escapeHtml(teacher.bank_name || "은행 미입력")} ${escapeHtml(teacher.account_number || "계좌번호 미입력")}</strong></div>
          <div class="teacher-admin-bio"><span>한 줄 소개</span><strong>${escapeHtml(teacher.bio || "미입력")}</strong></div>
          <div class="teacher-agreement-detail"><span>서비스 계약</span>${teacher.agreement
            ? `<strong class="agreement-ok">동의 완료 · ${escapeHtml(teacher.agreement.agreement_version)}</strong><small>${escapeHtml(new Date(teacher.agreement.agreed_at).toLocaleString(currentLocale()))} · ${escapeHtml(teacher.agreement.teacher_name)}</small>`
            : `<strong class="agreement-missing">미동의 · ${CURRENT_AGREEMENT_VERSION}</strong><small>다음 로그인 시 계약 동의 화면이 표시됩니다.</small>`}</div>
        </div>
        <div class="admin-slots">${slots.length ? slots.map((slot) => `<div class="admin-slot"><strong>${days[Number(slot.day_of_week)]}</strong>${escapeHtml(slot.start_time.slice(0,5))}–${escapeHtml(slot.end_time.slice(0,5))}<br>${escapeHtml(slot.location || "")}</div>`).join("") : '<div class="empty-state compact">제출된 시간이 없습니다.</div>'}</div>
        ${memo ? `<div class="admin-memo"><strong>메모:</strong> ${escapeHtml(memo)}</div>` : ""}
      </article>`;
    }).join("");
  }

  async function loadAssignments() {
    const { data, error } = await supabase
      .from("student_assignments")
      .select("id, teacher_id, student_id, student_name, student_email, assignment_type, plan, lesson_duration_minutes, weekly_frequency, settlement_sessions, four_lesson_tuition, nado_fee_percent, four_lesson_nado_fee, four_lesson_teacher_payout, teacher_payout_amount, pricing_version, first_lesson_date, settlement_date, status, ended_at, created_at, updated_at")
      .order("first_lesson_date", { ascending: true })
      .order("student_name", { ascending: true });

    if (error) {
      console.error("Assignment lookup failed:", error);
      assignments = [];
      $("adminAssignmentCount").textContent = "0건";
      $("assignmentTotalCount").textContent = "-";
      $("adminAssignmentList").innerHTML = '<div class="empty-state">학생 배정 테이블을 불러오지 못했습니다.<br>Supabase에서 학생 배정 SQL을 먼저 실행해주세요.</div>';
      return;
    }

    assignments = data || [];
    updateStats();
    renderAssignmentList();
    renderAssignmentCalendar();
  }

  function teacherById(id) {
    return teachers.find((teacher) => teacher.id === id) || null;
  }

  function calendarDateKey(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function studentHueForAssignment(assignment) {
    const ordered = [...assignments].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const index = Math.max(0, ordered.findIndex((item) => item.id === assignment.id));
    return Math.round((18 + index * 137.508) % 360);
  }

  function teacherHueForId(teacherId, teacherName = "") {
    const teacherIds = teachers.map((teacher) => teacher.id).sort();
    const index = Math.max(0, teacherIds.indexOf(teacherId));
    if (!teacherId || !teacherIds.includes(teacherId)) return hueFor(teacherName, 191);
    return Math.round((205 + index * 137.508) % 360);
  }

  function calendarEventsForDate(dateKey) {
    const events = [];
    assignments.forEach((assignment) => {
      const teacher = teacherById(assignment.teacher_id);
      const teacherName = teacher?.full_name || "삭제된 선생님";
      const studentHue = studentHueForAssignment(assignment);
      const teacherHue = teacherHueForId(assignment.teacher_id, teacherName);
      if (assignment.first_lesson_date === dateKey) {
        events.push({ assignment, teacherName, studentHue, teacherHue, type: "first" });
      }
      if (assignment.settlement_date === dateKey) {
        events.push({ assignment, teacherName, studentHue, teacherHue, type: "settlement" });
      }
    });
    return events.sort((a, b) => a.assignment.student_name.localeCompare(b.assignment.student_name, "ko"));
  }

  function renderCalendarEvent(event) {
    const isTrial = isTrialAssignment(event.assignment);
    const typeLabel = event.type === "first"
      ? (isTrial ? (currentLanguage() === "en" ? "Trial" : "체험수업") : (currentLanguage() === "en" ? "First lesson" : "첫 수업"))
      : (currentLanguage() === "en" ? "Payout" : "정산");
    return `<div class="calendar-event calendar-event-${event.type}${isTrial ? " calendar-event-trial" : ""}" data-calendar-assignment="${escapeHtml(event.assignment.id)}">
      <span class="calendar-event-type">${typeLabel}</span>
      <strong class="calendar-student-name" style="--calendar-name-hue:${event.studentHue}">${escapeHtml(event.assignment.student_name)}</strong>
      <span class="calendar-teacher-name" style="--calendar-name-hue:${event.teacherHue}">${escapeHtml(event.teacherName)}</span>
    </div>`;
  }

  function renderAssignmentCalendar() {
    const calendar = $("adminCalendar");
    if (!calendar) return;
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const todayKey = localDateKey();
    const weekLabels = currentLanguage() === "en"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["일", "월", "화", "수", "목", "금", "토"];

    $("calendarMonthTitle").textContent = firstDay.toLocaleDateString(currentLocale(), { year: "numeric", month: "long" });

    const cells = weekLabels.map((label) => `<div class="calendar-weekday" role="columnheader">${label}</div>`);
    for (let blank = 0; blank < firstDay.getDay(); blank += 1) {
      cells.push('<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>');
    }
    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const dateKey = calendarDateKey(year, month, day);
      const events = calendarEventsForDate(dateKey);
      cells.push(`<div class="calendar-day${dateKey === todayKey ? " is-today" : ""}" role="gridcell" data-calendar-date="${dateKey}">
        <div class="calendar-day-number"><span>${day}</span>${events.length ? `<b>${events.length}</b>` : ""}</div>
        <div class="calendar-events">${events.map(renderCalendarEvent).join("")}</div>
      </div>`);
    }
    calendar.innerHTML = cells.join("");
  }

  function moveCalendarMonth(amount) {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + amount, 1);
    renderAssignmentCalendar();
  }

  function renderAssignmentList() {
    const target = $("adminAssignmentList");
    const { current, history } = assignmentGroups();
    $("adminCurrentAssignmentCount").textContent = current.length;
    $("adminHistoryAssignmentCount").textContent = history.length;
    $("adminAllAssignmentCount").textContent = assignments.length;

    const source = assignmentFilter === "current" ? current : assignmentFilter === "history" ? history : assignments;
    const visible = [...source].sort((a, b) => {
      const direction = assignmentFilter === "history" ? -1 : 1;
      return direction * a.settlement_date.localeCompare(b.settlement_date) || a.student_name.localeCompare(b.student_name, "ko");
    });

    $("adminAssignmentCount").textContent = `${visible.length}건`;
    document.querySelectorAll("[data-assignment-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.assignmentFilter === assignmentFilter);
    });

    if (!visible.length) {
      const message = assignmentFilter === "current" ? "현재 관리 중인 학생이 없습니다." : assignmentFilter === "history" ? "아직 학생 기록이 없습니다." : "아직 등록된 학생 배정이 없습니다.";
      target.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    target.innerHTML = visible.map((assignment) => {
      const teacher = teacherById(assignment.teacher_id);
      const isHistory = Boolean(assignment.status && assignment.status !== "active");
      const isTrial = isTrialAssignment(assignment);
      const plan = assignment.plan || "unassigned";
      const typeBadge = isTrial
        ? `<span class="assignment-type-badge trial">${escapeHtml(assignmentTypeLabel("trial"))}</span>`
        : "";
      const serviceTags = assignment.lesson_duration_minutes
        ? `<div class="admin-assignment-service-tags">
            <span>${escapeHtml(lessonDurationLabel(assignment.lesson_duration_minutes))}</span>
            ${isTrial
              ? `<span>${escapeHtml(currentLanguage() === "en" ? "1 trial session" : "체험 1회")}</span>`
              : `<span>${escapeHtml(weeklyFrequencyLabel(assignment.weekly_frequency))}</span>
                 <span>${escapeHtml(currentLanguage() === "en" ? `Payout ${sessionCountLabel(assignment.settlement_sessions)}` : `정산 ${sessionCountLabel(assignment.settlement_sessions)}`)}</span>`}
          </div>`
        : '<div class="assignment-pricing-missing">기존 기록 · 수업/정산 상세 미지정</div>';

      const payoutDetail = isTrial
        ? (currentLanguage() === "en" ? "Student free · Economy trial lesson" : "학생 무료 · Economy 체험수업")
        : (() => {
            const weekly = Number(assignment.weekly_frequency) === 2 ? 2 : 1;
            const packageSessions = PACKAGE_SESSIONS * weekly;
            const packageTeacherPayout = Number(assignment.four_lesson_teacher_payout) * weekly;
            const packageTuition = Number(assignment.four_lesson_tuition) * weekly;
            return currentLanguage() === "en"
              ? `${packageSessions}-session basis ${formatWon(packageTeacherPayout)} · Tuition ${formatWon(packageTuition)}`
              : `${packageSessions}회 기준 ${formatWon(packageTeacherPayout)} · 학생 수업료 ${formatWon(packageTuition)}`;
          })();

      return `<article class="admin-assignment-item${isHistory ? " is-history" : ""}${isTrial ? " is-trial" : ""}">
        <div class="admin-assignment-person">
          <div class="admin-assignment-badges">
            ${typeBadge}
            <span class="plan-badge plan-${escapeHtml(plan)}">${escapeHtml(planLabel(assignment.plan))}</span>
            <span class="assignment-status-badge ${isHistory ? "completed" : "current"}">${isHistory ? "학생 기록" : "현재 학생"}</span>
          </div>
          <strong>${escapeHtml(assignment.student_name)}</strong>
          <small>${assignment.student_email ? `${escapeHtml(assignment.student_email)} · ` : ""}담당: ${escapeHtml(teacher?.full_name || "삭제된 선생님")} ${teacher?.email ? `· ${escapeHtml(teacher.email)}` : ""}</small>
          ${!isTrial ? `<small class="assignment-account-state">${assignment.student_id ? "학생 계정 연결됨" : "학생 계정 초대 대기"}</small>` : ""}
          ${serviceTags}
        </div>
        <div class="admin-assignment-summary">
          <dl class="admin-assignment-dates">
            <div><dt>${escapeHtml(isTrial ? (currentLanguage() === "en" ? "Trial lesson date" : "체험수업일") : (currentLanguage() === "en" ? "First lesson date" : "첫 수업일"))}</dt><dd>${escapeHtml(formatKoreanDate(assignment.first_lesson_date))}</dd></div>
            <div><dt>${escapeHtml(currentLanguage() === "en" ? (isHistory ? "Payout date" : "Scheduled payout date") : (isHistory ? "정산일" : "정산 예정일"))}</dt><dd>${escapeHtml(formatKoreanDate(assignment.settlement_date))}</dd></div>
          </dl>
          ${assignmentHasPricing(assignment) ? `<div class="admin-assignment-payout${isTrial ? " trial" : ""}">
            <span>${escapeHtml(isTrial
              ? (currentLanguage() === "en" ? "Trial lesson teacher payout" : "Teacher 체험수업 지급액")
              : (currentLanguage() === "en" ? (isHistory ? "Teacher payout" : "Scheduled teacher payout") : `Teacher ${isHistory ? "정산액" : "정산 예정액"}`))}</span>
            <strong>${escapeHtml(formatWon(assignment.teacher_payout_amount))}</strong>
            <small>${escapeHtml(payoutDetail)}</small>
          </div>` : ""}
        </div>
        <div class="admin-assignment-actions">
          ${!isHistory && !isTrial && assignment.student_id ? `<a class="button primary small" href="classroom.html?assignment=${escapeHtml(assignment.id)}">공유 공간</a>` : ""}
          <button class="button secondary small" data-edit-assignment="${escapeHtml(assignment.id)}" type="button">수정</button>
          ${!isHistory ? `<button class="button ghost small assignment-delete-button" data-delete-assignment="${escapeHtml(assignment.id)}" type="button">배정 종료</button>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  function resetAssignmentForm() {
    editingAssignmentId = null;
    $("assignmentForm").reset();
    $("assignmentType").value = "regular";
    $("assignmentWeeklyFrequency").value = "1";
    syncAssignmentTypeFields(4);
    $("assignmentFormTitle").textContent = "새 학생 배정";
    $("assignmentSubmitButton").textContent = "배정 및 초대";
    $("assignmentCancelButton").classList.add("hidden");
    renderAssignmentPricingPreview();
  }

  function startAssignmentEdit(id) {
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    editingAssignmentId = id;
    $("assignmentTeacher").value = assignment.teacher_id;
    $("assignmentStudentName").value = assignment.student_name;
    $("assignmentStudentEmail").value = assignment.student_email || "";
    $("assignmentType").value = assignment.assignment_type || "regular";
    $("assignmentPlan").value = assignment.plan || "";
    $("assignmentLessonDuration").value = assignment.lesson_duration_minutes ? String(assignment.lesson_duration_minutes) : "";
    $("assignmentWeeklyFrequency").value = assignment.weekly_frequency ? String(assignment.weekly_frequency) : "1";
    syncAssignmentTypeFields(assignment.settlement_sessions || packageSessionCount(assignment.weekly_frequency || 1));
    $("assignmentFirstLessonDate").value = assignment.first_lesson_date;
    $("assignmentSettlementDate").value = assignment.settlement_date;
    $("assignmentFormTitle").textContent = "학생 배정 수정";
    $("assignmentSubmitButton").textContent = "배정 정보 수정";
    $("assignmentCancelButton").classList.remove("hidden");
    renderAssignmentPricingPreview();
    $("assignmentForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveAssignment(event) {
    event.preventDefault();
    const button = event.submitter || $("assignmentSubmitButton");
    const assignmentType = $("assignmentType").value === "trial" ? "trial" : "regular";
    const isTrial = assignmentType === "trial";
    const plan = isTrial ? TRIAL_PLAN : $("assignmentPlan").value;
    const lessonDurationMinutes = Number($("assignmentLessonDuration").value);
    const weeklyFrequency = isTrial ? 1 : Number($("assignmentWeeklyFrequency").value);
    const settlementSessions = isTrial ? 1 : Number($("assignmentSettlementSessions").value);
    const pricing = isTrial
      ? trialPricingFor(lessonDurationMinutes)
      : pricingFor(plan, lessonDurationMinutes, weeklyFrequency, settlementSessions);

    const payload = {
      teacher_id: $("assignmentTeacher").value,
      student_name: $("assignmentStudentName").value.trim(),
      student_email: $("assignmentStudentEmail").value.trim().toLowerCase() || null,
      assignment_type: assignmentType,
      plan,
      lesson_duration_minutes: lessonDurationMinutes,
      weekly_frequency: weeklyFrequency,
      settlement_sessions: settlementSessions,
      four_lesson_tuition: isTrial ? null : (pricing?.baseTuition ?? null),
      nado_fee_percent: isTrial ? null : 35,
      four_lesson_nado_fee: isTrial ? null : (pricing?.baseNadoFee ?? null),
      four_lesson_teacher_payout: isTrial ? null : (pricing?.baseTeacherPayout ?? null),
      teacher_payout_amount: pricing?.teacherPayout ?? null,
      pricing_version: isTrial ? TRIAL_PRICING_VERSION : PRICING_VERSION,
      first_lesson_date: $("assignmentFirstLessonDate").value,
      settlement_date: $("assignmentSettlementDate").value
    };

    const validRegularSessions = Number.isInteger(settlementSessions)
      && settlementSessions >= 1
      && settlementSessions <= packageSessionCount(weeklyFrequency);
    const validAssignment = isTrial
      ? Boolean(pricing && plan === TRIAL_PLAN && weeklyFrequency === 1 && settlementSessions === 1 && pricing.teacherPayout === TRIAL_TEACHER_PAYOUT)
      : Boolean(pricing && [1, 2].includes(weeklyFrequency) && validRegularSessions);

    if (!payload.teacher_id || !payload.student_name || (!isTrial && !payload.student_email) || !payload.plan || !lessonDurationMinutes || !validAssignment || !payload.first_lesson_date || !payload.settlement_date) {
      return toast(isTrial ? "체험수업 배정 정보를 모두 입력해주세요." : "모든 학생 배정 및 정산 정보를 입력해주세요.", true);
    }
    if (payload.settlement_date < payload.first_lesson_date) {
      $("assignmentSettlementDate").focus();
      return toast("정산 예정일은 첫 수업일과 같거나 이후여야 합니다.", true);
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = editingAssignmentId ? "수정 중..." : "등록 중...";

    const confirmation = isTrial
      ? `${payload.student_name} 학생의 무료 체험수업을 배정할까요?`
      : `${payload.student_name} 학생을 배정하고 ${payload.student_email} 계정이 없으면 초대 이메일을 보낼까요?`;
    if (!confirm(confirmation)) {
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    const { data: resultData, error: resultError } = await supabase.functions.invoke("assign-student", {
      body: { ...payload, assignment_id: editingAssignmentId || null }
    });

    button.disabled = false;
    button.textContent = originalText;
    if (resultError || resultData?.error) return toast("학생 배정 저장 실패: " + (resultData?.error || resultError?.message || "알 수 없는 오류"), true);

    toast(editingAssignmentId
      ? (resultData?.reassigned ? "새 선생님으로 재배정했습니다. 기존 공유 공간 접근은 종료되었습니다." : "학생 배정 정보를 수정했습니다.")
      : (isTrial ? "무료 체험수업을 배정했습니다." : (resultData?.invitation_sent ? "학생 배정과 계정 초대를 완료했습니다." : "기존 학생 계정에 선생님 배정을 연결했습니다.")));
    resetAssignmentForm();
    await loadAssignments();
  }


  async function deleteAssignment(id) {
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    if (!confirm(`${assignment.student_name} 학생의 현재 배정을 종료할까요? 종료 후 선생님과 학생은 이 공유 공간에 접근할 수 없습니다.`)) return;
    const { error } = await supabase.from("student_assignments").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast("학생 배정 종료 실패: " + error.message, true);
    if (editingAssignmentId === id) resetAssignmentForm();
    toast("학생 배정을 종료했습니다. 기존 자료는 관리자 기록으로 보관됩니다.");
    await loadAssignments();
  }

  async function loadContent() {
    const [announcementResult, resourceResult, videoResult] = await Promise.all([
      supabase.from("announcements").select("id, title, body, title_en, body_en, is_active, published_at").order("published_at", { ascending: false }),
      supabase.from("resources").select("id, title, description, title_en, description_en, category, file_url, storage_path, original_name, size_bytes, sort_order, is_active").order("sort_order"),
      supabase.from("training_videos").select("id, title, description, title_en, description_en, video_url, sort_order, is_active").order("sort_order")
    ]);
    if (announcementResult.error || resourceResult.error || videoResult.error) {
      return toast("콘텐츠 목록 일부를 불러오지 못했습니다.", true);
    }
    contentCache.announcement = announcementResult.data || [];
    contentCache.resource = resourceResult.data || [];
    contentCache.video = videoResult.data || [];
    renderManagerList("adminAnnouncementList", contentCache.announcement, "announcement");
    renderManagerList("adminResourceList", contentCache.resource, "resource");
    renderManagerList("adminVideoList", contentCache.video, "video");
  }

  function renderManagerList(targetId, items = [], type) {
    const target = $(targetId);
    if (!items.length) {
      target.innerHTML = '<div class="empty-state">등록된 항목이 없습니다.</div>';
      return;
    }
    const table = type === "announcement" ? "announcements" : type === "resource" ? "resources" : "training_videos";
    target.innerHTML = items.map((item) => {
      const detail = type === "announcement"
        ? new Date(item.published_at).toLocaleDateString(currentLocale())
        : type === "resource" ? `${item.category} · ${item.storage_path ? "회원 전용 파일" : "외부 링크"} · 순서 ${item.sort_order}` : `순서 ${item.sort_order}`;
      const missingEnglishLabel = currentLanguage() === "en" ? "EN · Not entered" : "EN · 미입력";
      const englishTitle = item.title_en ? `<small class="manager-item-en">EN · ${escapeHtml(item.title_en)}</small>` : `<small class="manager-item-en muted">${missingEnglishLabel}</small>`;
      return `<div class="manager-item">
        <div><strong>${escapeHtml(item.title)}</strong>${englishTitle}<small>${escapeHtml(detail)}</small></div>
        <div class="manager-item-actions">
          <button data-edit-content="${type}" data-edit-id="${item.id}" type="button" aria-label="수정">수정</button>
          <button data-delete-table="${table}" data-delete-id="${item.id}" type="button" aria-label="삭제">×</button>
        </div>
      </div>`;
    }).join("");
  }

  function resetContentForm(type) {
    editingContentId[type] = null;
    if (type === "announcement") {
      $("announcementForm").reset();
      $("announcementCancelButton").classList.add("hidden");
      $("announcementSubmitButton").textContent = "공지 등록";
    } else if (type === "resource") {
      $("resourceForm").reset();
      $("resourceOrder").value = "1";
      $("resourceCancelButton").classList.add("hidden");
      $("resourceSubmitButton").textContent = "자료 등록";
    } else {
      $("videoForm").reset();
      $("videoOrder").value = "1";
      $("videoCancelButton").classList.add("hidden");
      $("videoSubmitButton").textContent = "영상 등록";
    }
  }

  function startContentEdit(type, id) {
    const item = contentCache[type].find((entry) => String(entry.id) === String(id));
    if (!item) return;
    editingContentId[type] = item.id;
    if (type === "announcement") {
      $("announcementTitle").value = item.title || "";
      $("announcementBody").value = item.body || "";
      $("announcementTitleEn").value = item.title_en || "";
      $("announcementBodyEn").value = item.body_en || "";
      $("announcementCancelButton").classList.remove("hidden");
      $("announcementSubmitButton").textContent = "공지 수정";
      $("announcementForm").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (type === "resource") {
      $("resourceTitle").value = item.title || "";
      $("resourceDescription").value = item.description || "";
      $("resourceTitleEn").value = item.title_en || "";
      $("resourceDescriptionEn").value = item.description_en || "";
      $("resourceCategory").value = item.category || "PDF";
      $("resourceUrl").value = item.file_url || "";
      $("resourceOrder").value = item.sort_order ?? 1;
      $("resourceCancelButton").classList.remove("hidden");
      $("resourceSubmitButton").textContent = "자료 수정";
      $("resourceForm").scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      $("videoTitle").value = item.title || "";
      $("videoDescription").value = item.description || "";
      $("videoTitleEn").value = item.title_en || "";
      $("videoDescriptionEn").value = item.description_en || "";
      $("videoUrl").value = item.video_url || "";
      $("videoOrder").value = item.sort_order ?? 1;
      $("videoCancelButton").classList.remove("hidden");
      $("videoSubmitButton").textContent = "영상 수정";
      $("videoForm").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function addAnnouncement(event) {
    event.preventDefault();
    const button = event.submitter || $("announcementSubmitButton");
    button.disabled = true;
    const payload = {
      title: $("announcementTitle").value.trim(),
      body: $("announcementBody").value.trim(),
      title_en: $("announcementTitleEn").value.trim() || null,
      body_en: $("announcementBodyEn").value.trim() || null,
      is_active: true
    };
    if (!editingContentId.announcement) payload.published_at = new Date().toISOString();
    const result = editingContentId.announcement
      ? await supabase.from("announcements").update(payload).eq("id", editingContentId.announcement)
      : await supabase.from("announcements").insert(payload);
    button.disabled = false;
    if (result.error) return toast("공지 등록 실패: " + result.error.message, true);
    toast(editingContentId.announcement ? "공지사항을 수정했습니다." : "공지사항을 등록했습니다.");
    resetContentForm("announcement");
    await loadContent();
  }

  async function addResource(event) {
    event.preventDefault();
    const button = event.submitter || $("resourceSubmitButton");
    button.disabled = true;
    const existing = editingContentId.resource
      ? contentCache.resource.find((item) => String(item.id) === String(editingContentId.resource))
      : null;
    const selectedFile = $("resourceFile").files[0] || null;
    const externalUrl = $("resourceUrl").value.trim();
    if (!selectedFile && !externalUrl && !existing?.storage_path) {
      button.disabled = false;
      return toast("회원 전용 파일 또는 외부 공유 URL 중 하나를 입력해주세요.", true);
    }

    let uploadedPath = null;
    if (selectedFile) {
      if (selectedFile.size > 50 * 1024 * 1024) {
        button.disabled = false;
        return toast("자료 파일은 50MB 이하만 업로드할 수 있습니다.", true);
      }
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
      uploadedPath = `${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("member-resources").upload(uploadedPath, selectedFile, {
        contentType: selectedFile.type || "application/octet-stream",
        upsert: false
      });
      if (uploadError) {
        button.disabled = false;
        return toast("회원 자료 파일 업로드 실패: " + uploadError.message, true);
      }
    }

    const payload = {
      title: $("resourceTitle").value.trim(),
      description: $("resourceDescription").value.trim(),
      title_en: $("resourceTitleEn").value.trim() || null,
      description_en: $("resourceDescriptionEn").value.trim() || null,
      category: $("resourceCategory").value,
      file_url: externalUrl || null,
      storage_path: uploadedPath || existing?.storage_path || null,
      original_name: selectedFile?.name || existing?.original_name || null,
      size_bytes: selectedFile?.size || existing?.size_bytes || null,
      sort_order: Number($("resourceOrder").value) || 0,
      is_active: true
    };
    const result = editingContentId.resource
      ? await supabase.from("resources").update(payload).eq("id", editingContentId.resource)
      : await supabase.from("resources").insert(payload);
    button.disabled = false;
    if (result.error) {
      if (uploadedPath) await supabase.storage.from("member-resources").remove([uploadedPath]);
      return toast("자료 등록 실패: " + result.error.message, true);
    }
    if (uploadedPath && existing?.storage_path && existing.storage_path !== uploadedPath) {
      await supabase.storage.from("member-resources").remove([existing.storage_path]);
    }
    toast(editingContentId.resource ? "수업 자료를 수정했습니다." : "수업 자료를 등록했습니다.");
    resetContentForm("resource");
    await loadContent();
  }

  async function addVideo(event) {
    event.preventDefault();
    const button = event.submitter || $("videoSubmitButton");
    button.disabled = true;
    const payload = {
      title: $("videoTitle").value.trim(),
      description: $("videoDescription").value.trim(),
      title_en: $("videoTitleEn").value.trim() || null,
      description_en: $("videoDescriptionEn").value.trim() || null,
      video_url: $("videoUrl").value.trim(),
      sort_order: Number($("videoOrder").value) || 0,
      is_active: true
    };
    const result = editingContentId.video
      ? await supabase.from("training_videos").update(payload).eq("id", editingContentId.video)
      : await supabase.from("training_videos").insert(payload);
    button.disabled = false;
    if (result.error) return toast("영상 등록 실패: " + result.error.message, true);
    toast(editingContentId.video ? "교육 영상을 수정했습니다." : "교육 영상을 등록했습니다.");
    resetContentForm("video");
    await loadContent();
  }

  async function deleteContent(table, id) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    const allowed = ["announcements", "resources", "training_videos"];
    if (!allowed.includes(table)) return;
    const resource = table === "resources" ? contentCache.resource.find((item) => String(item.id) === String(id)) : null;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast("삭제 실패: " + error.message, true);
    if (resource?.storage_path) await supabase.storage.from("member-resources").remove([resource.storage_path]);
    toast("삭제했습니다.");
    await loadContent();
  }

  function exportCsv() {
    const rows = [["선생님", "이메일", "학교", "전공", "카카오톡 ID", "요일", "시작", "종료", "장소", "메모", "업데이트"]];
    teachers.forEach((teacher) => {
      if (!(teacher.availability || []).length) rows.push([teacher.full_name, teacher.email, teacher.school, teacher.major, teacher.kakao_id, "미제출", "", "", "", "", ""]);
      (teacher.availability || []).forEach((slot) => rows.push([teacher.full_name, teacher.email, teacher.school, teacher.major, teacher.kakao_id, days[slot.day_of_week], slot.start_time.slice(0,5), slot.end_time.slice(0,5), slot.location, slot.memo, slot.updated_at]));
    });
    const csv = "\ufeff" + rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `nado-teacher-schedules-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  $("assignmentForm").addEventListener("submit", saveAssignment);
  $("assignmentCancelButton").addEventListener("click", resetAssignmentForm);
  $("assignmentType").addEventListener("change", () => {
    syncAssignmentTypeFields();
    renderAssignmentPricingPreview();
  });
  ["assignmentPlan", "assignmentLessonDuration", "assignmentSettlementSessions"].forEach((id) => {
    $(id).addEventListener("change", renderAssignmentPricingPreview);
  });
  $("assignmentWeeklyFrequency").addEventListener("change", () => {
    syncSettlementSessionOptions();
    renderAssignmentPricingPreview();
  });
  document.querySelectorAll("[data-assignment-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      assignmentFilter = button.dataset.assignmentFilter;
      renderAssignmentList();
    });
  });
  $("adminAssignmentList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-assignment]");
    if (editButton) return startAssignmentEdit(editButton.dataset.editAssignment);
    const deleteButton = event.target.closest("[data-delete-assignment]");
    if (deleteButton) deleteAssignment(deleteButton.dataset.deleteAssignment);
  });
  $("calendarPrevButton").addEventListener("click", () => moveCalendarMonth(-1));
  $("calendarNextButton").addEventListener("click", () => moveCalendarMonth(1));
  $("calendarTodayButton").addEventListener("click", () => {
    const now = new Date();
    calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    renderAssignmentCalendar();
  });
  $("announcementForm").addEventListener("submit", addAnnouncement);
  $("resourceForm").addEventListener("submit", addResource);
  $("videoForm").addEventListener("submit", addVideo);
  $("announcementCancelButton").addEventListener("click", () => resetContentForm("announcement"));
  $("resourceCancelButton").addEventListener("click", () => resetContentForm("resource"));
  $("videoCancelButton").addEventListener("click", () => resetContentForm("video"));
  document.querySelector(".admin-content-grid").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-content]");
    if (editButton) return startContentEdit(editButton.dataset.editContent, editButton.dataset.editId);
    const button = event.target.closest("[data-delete-table]");
    if (button) deleteContent(button.dataset.deleteTable, button.dataset.deleteId);
  });
  document.addEventListener("nado:languagechange", () => {
    render();
    renderAssignmentList();
    syncAssignmentTypeFields(Number($("assignmentSettlementSessions").value));
    renderAssignmentPricingPreview();
    renderAssignmentCalendar();
    renderManagerList("adminAnnouncementList", contentCache.announcement, "announcement");
    renderManagerList("adminResourceList", contentCache.resource, "resource");
    renderManagerList("adminVideoList", contentCache.video, "video");
  });
  $("adminTeacherList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-teacher-photo]");
    if (button) downloadTeacherProfilePhoto(button.dataset.downloadTeacherPhoto, button);
  });
  $("teacherSearch").addEventListener("input", render);
  $("dayFilter").addEventListener("change", render);
  $("exportCsvButton").addEventListener("click", exportCsv);
  $("adminLogoutButton").addEventListener("click", async () => {
    if (!supabase || adminLogoutInProgress) return;

    adminLogoutInProgress = true;
    const button = $("adminLogoutButton");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "로그아웃 중...";

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      location.replace("./index.html");
    } catch (error) {
      console.error("Admin logout failed:", error);
      toast("로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.", true);
      button.disabled = false;
      button.textContent = originalText;
      adminLogoutInProgress = false;
    }
  });
  syncAssignmentTypeFields(4);
  renderAssignmentPricingPreview();
  initialize();
})();
