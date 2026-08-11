(() => {
  "use strict";
  const config = window.NADO_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const supabase = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const PROFILE_PHOTO_BUCKET = "profile-photos";
  const PROFILE_PHOTO_SIGNED_URL_SECONDS = 60 * 60;
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const planLabels = { economy: "이코노미", standard: "스탠다드", premium: "프리미엄" };
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

  function assignmentGroups() {
    const today = localDateKey();
    return {
      current: assignments.filter((item) => item.settlement_date >= today),
      history: assignments.filter((item) => item.settlement_date < today)
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
      .select("id, full_name, email, school, major, phone, bio, bank_name, account_number, profile_photo_path, availability(id, day_of_week, start_time, end_time, location, memo, updated_at)")
      .neq("role", "admin")
      .order("full_name");
    if (error) return toast("데이터를 불러오지 못했습니다: " + error.message, true);
    teachers = data || [];
    await hydrateTeacherPhotos();
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
  }

  function filteredTeachers() {
    const keyword = $("teacherSearch").value.trim().toLowerCase();
    const day = $("dayFilter").value;
    return teachers.map((teacher) => ({
      ...teacher,
      availability: (teacher.availability || []).filter((slot) => day === "all" || String(slot.day_of_week) === day)
    })).filter((teacher) => {
      const matchesText = !keyword || `${teacher.full_name || ""} ${teacher.email || ""} ${teacher.school || ""} ${teacher.major || ""} ${teacher.phone || ""}`.toLowerCase().includes(keyword);
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
          <div><span>정산 계좌</span><strong>${escapeHtml(teacher.bank_name || "은행 미입력")} ${escapeHtml(teacher.account_number || "계좌번호 미입력")}</strong></div>
          <div class="teacher-admin-bio"><span>한 줄 소개</span><strong>${escapeHtml(teacher.bio || "미입력")}</strong></div>
        </div>
        <div class="admin-slots">${slots.length ? slots.map((slot) => `<div class="admin-slot"><strong>${days[Number(slot.day_of_week)]}</strong>${escapeHtml(slot.start_time.slice(0,5))}–${escapeHtml(slot.end_time.slice(0,5))}<br>${escapeHtml(slot.location || "")}</div>`).join("") : '<div class="empty-state compact">제출된 시간이 없습니다.</div>'}</div>
        ${memo ? `<div class="admin-memo"><strong>메모:</strong> ${escapeHtml(memo)}</div>` : ""}
      </article>`;
    }).join("");
  }

  async function loadAssignments() {
    const { data, error } = await supabase
      .from("student_assignments")
      .select("id, teacher_id, student_name, plan, first_lesson_date, settlement_date, created_at, updated_at")
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
    const typeLabel = event.type === "first" ? "첫 수업" : "정산";
    return `<div class="calendar-event calendar-event-${event.type}" data-calendar-assignment="${escapeHtml(event.assignment.id)}">
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

    const today = localDateKey();
    target.innerHTML = visible.map((assignment) => {
      const teacher = teacherById(assignment.teacher_id);
      const isHistory = assignment.settlement_date < today;
      const plan = assignment.plan || "unassigned";
      return `<article class="admin-assignment-item${isHistory ? " is-history" : ""}">
        <div class="admin-assignment-person">
          <div class="admin-assignment-badges">
            <span class="plan-badge plan-${escapeHtml(plan)}">${escapeHtml(planLabel(assignment.plan))}</span>
            <span class="assignment-status-badge ${isHistory ? "completed" : "current"}">${isHistory ? "학생 기록" : "현재 학생"}</span>
          </div>
          <strong>${escapeHtml(assignment.student_name)}</strong>
          <small>담당: ${escapeHtml(teacher?.full_name || "삭제된 선생님")} ${teacher?.email ? `· ${escapeHtml(teacher.email)}` : ""}</small>
        </div>
        <dl class="admin-assignment-dates">
          <div><dt>첫 수업일</dt><dd>${escapeHtml(formatKoreanDate(assignment.first_lesson_date))}</dd></div>
          <div><dt>${isHistory ? "정산일" : "정산 예정일"}</dt><dd>${escapeHtml(formatKoreanDate(assignment.settlement_date))}</dd></div>
        </dl>
        <div class="admin-assignment-actions">
          <button class="button secondary small" data-edit-assignment="${escapeHtml(assignment.id)}" type="button">수정</button>
          <button class="button ghost small assignment-delete-button" data-delete-assignment="${escapeHtml(assignment.id)}" type="button">삭제</button>
        </div>
      </article>`;
    }).join("");
  }

  function resetAssignmentForm() {
    editingAssignmentId = null;
    $("assignmentForm").reset();
    $("assignmentFormTitle").textContent = "새 학생 배정";
    $("assignmentSubmitButton").textContent = "학생 배정 등록";
    $("assignmentCancelButton").classList.add("hidden");
  }

  function startAssignmentEdit(id) {
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    editingAssignmentId = id;
    $("assignmentTeacher").value = assignment.teacher_id;
    $("assignmentStudentName").value = assignment.student_name;
    $("assignmentPlan").value = assignment.plan || "";
    $("assignmentFirstLessonDate").value = assignment.first_lesson_date;
    $("assignmentSettlementDate").value = assignment.settlement_date;
    $("assignmentFormTitle").textContent = "학생 배정 수정";
    $("assignmentSubmitButton").textContent = "배정 정보 수정";
    $("assignmentCancelButton").classList.remove("hidden");
    $("assignmentForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveAssignment(event) {
    event.preventDefault();
    const button = event.submitter || $("assignmentSubmitButton");
    const payload = {
      teacher_id: $("assignmentTeacher").value,
      student_name: $("assignmentStudentName").value.trim(),
      plan: $("assignmentPlan").value,
      first_lesson_date: $("assignmentFirstLessonDate").value,
      settlement_date: $("assignmentSettlementDate").value
    };

    if (!payload.teacher_id || !payload.student_name || !payload.plan || !payload.first_lesson_date || !payload.settlement_date) {
      return toast("모든 학생 배정 정보를 입력해주세요.", true);
    }
    if (payload.settlement_date < payload.first_lesson_date) {
      $("assignmentSettlementDate").focus();
      return toast("정산 예정일은 첫 수업일과 같거나 이후여야 합니다.", true);
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = editingAssignmentId ? "수정 중..." : "등록 중...";

    const result = editingAssignmentId
      ? await supabase.from("student_assignments").update(payload).eq("id", editingAssignmentId)
      : await supabase.from("student_assignments").insert(payload);

    button.disabled = false;
    button.textContent = originalText;
    if (result.error) return toast("학생 배정 저장 실패: " + result.error.message, true);

    toast(editingAssignmentId ? "학생 배정 정보를 수정했습니다." : "학생을 선생님에게 배정했습니다.");
    resetAssignmentForm();
    await loadAssignments();
  }

  async function deleteAssignment(id) {
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    if (!confirm(`${assignment.student_name} 학생의 배정 정보를 삭제할까요?`)) return;
    const { error } = await supabase.from("student_assignments").delete().eq("id", id);
    if (error) return toast("학생 배정 삭제 실패: " + error.message, true);
    if (editingAssignmentId === id) resetAssignmentForm();
    toast("학생 배정 정보를 삭제했습니다.");
    await loadAssignments();
  }

  async function loadContent() {
    const [announcementResult, resourceResult, videoResult] = await Promise.all([
      supabase.from("announcements").select("id, title, body, title_en, body_en, is_active, published_at").order("published_at", { ascending: false }),
      supabase.from("resources").select("id, title, description, title_en, description_en, category, file_url, sort_order, is_active").order("sort_order"),
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
        : type === "resource" ? `${item.category} · 순서 ${item.sort_order}` : `순서 ${item.sort_order}`;
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
    const payload = {
      title: $("resourceTitle").value.trim(),
      description: $("resourceDescription").value.trim(),
      title_en: $("resourceTitleEn").value.trim() || null,
      description_en: $("resourceDescriptionEn").value.trim() || null,
      category: $("resourceCategory").value,
      file_url: $("resourceUrl").value.trim(),
      sort_order: Number($("resourceOrder").value) || 0,
      is_active: true
    };
    const result = editingContentId.resource
      ? await supabase.from("resources").update(payload).eq("id", editingContentId.resource)
      : await supabase.from("resources").insert(payload);
    button.disabled = false;
    if (result.error) return toast("자료 등록 실패: " + result.error.message, true);
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
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast("삭제 실패: " + error.message, true);
    toast("삭제했습니다.");
    await loadContent();
  }

  function exportCsv() {
    const rows = [["선생님", "이메일", "학교", "전공", "요일", "시작", "종료", "장소", "메모", "업데이트"]];
    teachers.forEach((teacher) => {
      if (!(teacher.availability || []).length) rows.push([teacher.full_name, teacher.email, teacher.school, teacher.major, "미제출", "", "", "", "", ""]);
      (teacher.availability || []).forEach((slot) => rows.push([teacher.full_name, teacher.email, teacher.school, teacher.major, days[slot.day_of_week], slot.start_time.slice(0,5), slot.end_time.slice(0,5), slot.location, slot.memo, slot.updated_at]));
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
  initialize();
})();
