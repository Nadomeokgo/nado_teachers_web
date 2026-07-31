(() => {
  "use strict";

  const config = window.NADO_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const supabase = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const scheduleDayOrder = [1, 2, 3, 4, 5, 6, 0];
  const scheduleStartMinutes = 8 * 60;
  const scheduleEndMinutes = 24 * 60;
  const scheduleStepMinutes = 30;
  const pageMeta = {
    dashboard: ["TEACHER HOME", "홈"], schedule: ["WEEKLY AVAILABILITY", "스케줄 제출"],
    guide: ["FIRST LESSON GUIDE", "첫 수업 가이드"], curriculum: ["CURRICULUM", "커리큘럼"],
    training: ["TRAINING VIDEOS", "교육 영상"], profile: ["MY PROFILE", "내 정보"]
  };

  let currentUser = null;
  let profile = null;
  let slots = [];
  let selectedAvailability = new Set();
  let scheduleMemo = "";
  let gridDragState = null;
  let suppressGridClick = false;
  let logoutInProgress = false;
  let loginInProgress = false;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function showToast(message, type = "success") {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show${type === "error" ? " error" : ""}`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.className = "toast"; }, 2700);
  }

  function checkConfiguration() {
    if (configured) return true;
    showToast("먼저 js/config.js에 Supabase 주소와 키를 입력해주세요.", "error");
    return false;
  }

  function setLoading(button, loading, originalText) {
    button.disabled = loading;
    button.textContent = loading ? "처리 중..." : originalText;
  }

  function switchPage(page) {
    if (!pageMeta[page]) page = "dashboard";
    document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-page]").forEach((el) => el.classList.toggle("active", el.dataset.page === page));
    $(`page-${page}`).classList.add("active");
    $("pageEyebrow").textContent = pageMeta[page][0];
    $("pageTitle").textContent = pageMeta[page][1];
    location.hash = page;
    closeSidebar();
  }

  const mobileSidebarQuery = window.matchMedia("(max-width: 820px)");

  function setSidebarAccessibility(isOpen) {
    const sidebar = $("sidebar");
    const openButton = $("sidebarOpen");
    openButton.setAttribute("aria-expanded", String(isOpen));

    if (mobileSidebarQuery.matches) {
      sidebar.setAttribute("aria-hidden", String(!isOpen));
      if ("inert" in sidebar) sidebar.inert = !isOpen;
    } else {
      sidebar.removeAttribute("aria-hidden");
      if ("inert" in sidebar) sidebar.inert = false;
    }
  }

  function openSidebar() {
    if (!mobileSidebarQuery.matches) return;
    $("sidebar").classList.add("open");
    $("sidebarBackdrop").classList.remove("hidden");
    document.body.classList.add("menu-open");
    setSidebarAccessibility(true);
    requestAnimationFrame(() => $("sidebarClose").focus());
  }

  function closeSidebar({ restoreFocus = false } = {}) {
    const wasOpen = $("sidebar").classList.contains("open");
    $("sidebar").classList.remove("open");
    $("sidebarBackdrop").classList.add("hidden");
    document.body.classList.remove("menu-open");
    setSidebarAccessibility(false);
    if (restoreFocus && wasOpen && mobileSidebarQuery.matches) $("sidebarOpen").focus();
  }

  function syncSidebarForViewport() {
    if (!mobileSidebarQuery.matches) {
      $("sidebar").classList.remove("open");
      $("sidebarBackdrop").classList.add("hidden");
      document.body.classList.remove("menu-open");
      setSidebarAccessibility(false);
      return;
    }
    setSidebarAccessibility($("sidebar").classList.contains("open"));
  }

  async function login(event) {
    event.preventDefault();
    if (!checkConfiguration() || loginInProgress) return;

    const form = $("loginForm");
    const button = event.submitter || form.querySelector('button[type="submit"]');
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    loginInProgress = true;
    if (button) setLoading(button, true, "로그인");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session) throw new Error("로그인 세션을 만들지 못했습니다.");

      await initializeSession(data.session);
    } catch (error) {
      console.error("Login failed:", error);
      const message = error?.message?.toLowerCase().includes("invalid login credentials")
        ? "이메일 또는 비밀번호를 확인해주세요."
        : "로그인 중 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.";
      showToast(message, "error");
    } finally {
      loginInProgress = false;
      if (button) setLoading(button, false, "로그인");
    }
  }

  async function resetPassword() {
    if (!checkConfiguration()) return;
    const email = $("loginEmail").value.trim();
    if (!email) return showToast("먼저 이메일을 입력해주세요.", "error");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${location.pathname}`
    });
    if (error) return showToast(error.message, "error");
    showToast("비밀번호 재설정 메일을 보냈습니다.");
  }

  function renderSignedOutState() {
    closeSidebar();

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();

    currentUser = null;
    profile = null;
    slots = [];
    selectedAvailability = new Set();
    scheduleMemo = "";

    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("loginPassword").value = "";
    $("adminLink").classList.add("hidden");

    // 무거운 iframe과 이전 사용자 콘텐츠를 즉시 정리합니다.
    $("videoGrid").innerHTML = "";
    $("resourceGrid").innerHTML = "";
    $("announcementList").innerHTML = "";

    // hashchange를 다시 발생시키지 않고 로그인 주소로 정리합니다.
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }

  async function logout() {
    if (!supabase || logoutInProgress) return;

    logoutInProgress = true;
    const button = $("logoutButton");
    setLoading(button, true, "로그아웃");

    try {
      // 기본 global 로그아웃 대신 현재 브라우저 세션만 빠르게 종료합니다.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      renderSignedOutState();
    } catch (error) {
      console.error("Logout failed:", error);
      showToast("로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
      logoutInProgress = false;
      setLoading(button, false, "로그아웃");
    }
  }

  async function initializeSession(existingSession = null) {
    if (!checkConfiguration()) return;

    let session = existingSession;
    if (!session) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Session lookup failed:", error);
        renderSignedOutState();
        showToast("로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.", "error");
        return;
      }
      session = data?.session || null;
    }

    if (!session) {
      renderSignedOutState();
      return;
    }

    currentUser = session.user;
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    try {
      await Promise.all([
        loadProfile(),
        loadAvailability(),
        loadAnnouncements(),
        loadResources(),
        loadVideos()
      ]);
      renderGuideProgress();
      switchPage(location.hash.replace("#", "") || "dashboard");
    } catch (error) {
      console.error("Dashboard initialization failed:", error);
      showToast("일부 정보를 불러오지 못했습니다. 페이지를 새로고침해주세요.", "error");
    }
  }

  async function loadProfile() {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (error) showToast("프로필을 불러오지 못했습니다.", "error");
    profile = data || { id: currentUser.id, full_name: currentUser.user_metadata?.full_name || "선생님", email: currentUser.email };
    const name = profile.full_name || "선생님";
    $("userName").textContent = name;
    $("welcomeName").textContent = name;
    $("userEmail").textContent = currentUser.email || "";
    $("userAvatar").textContent = name.slice(0, 1).toUpperCase();
    $("profileName").value = profile.full_name || "";
    $("profileSchool").value = profile.school || "";
    $("profileMajor").value = profile.major || "";
    $("profilePhone").value = profile.phone || "";
    $("profileBankName").value = profile.bank_name || "";
    $("profileAccountNumber").value = profile.account_number || "";
    $("profileBio").value = profile.bio || "";
    $("adminLink").classList.toggle("hidden", profile.role !== "admin");
  }

  function collectProfilePayload() {
    return {
      full_name: $("profileName").value.trim(),
      school: $("profileSchool").value.trim(),
      major: $("profileMajor").value.trim(),
      phone: $("profilePhone").value.trim(),
      bank_name: $("profileBankName").value.trim(),
      account_number: $("profileAccountNumber").value.trim().replace(/\s+/g, ""),
      bio: $("profileBio").value.trim(),
      updated_at: new Date().toISOString()
    };
  }

  function validateProfilePayload(payload) {
    const requiredFields = [
      ["profileName", payload.full_name, "이름"],
      ["profileSchool", payload.school, "학교"],
      ["profileMajor", payload.major, "전공"],
      ["profilePhone", payload.phone, "휴대전화"],
      ["profileBankName", payload.bank_name, "은행명"],
      ["profileAccountNumber", payload.account_number, "계좌번호"],
      ["profileBio", payload.bio, "한 줄 소개"]
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) {
      $(missing[0]).focus();
      showToast(`${missing[2]} 항목을 입력해주세요.`, "error");
      return false;
    }
    if (!/^[0-9-]{8,40}$/.test(payload.account_number)) {
      $("profileAccountNumber").focus();
      showToast("계좌번호는 숫자와 하이픈(-)만 사용해 8자 이상 입력해주세요.", "error");
      return false;
    }
    return true;
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = $("profileForm");
    const button = event.submitter || form.querySelector('button[type="submit"]');
    const payload = collectProfilePayload();
    if (!validateProfilePayload(payload)) return;

    setLoading(button, true, "내 정보 저장");
    try {
      let result = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", currentUser.id)
        .select("id, email, full_name, school, major, phone, bank_name, account_number, bio, role, updated_at")
        .maybeSingle();

      if (!result.error && !result.data) {
        result = await supabase
          .from("profiles")
          .insert({ id: currentUser.id, email: currentUser.email, ...payload })
          .select("id, email, full_name, school, major, phone, bank_name, account_number, bio, role, updated_at")
          .single();
      }

      if (result.error) throw result.error;
      profile = { ...profile, ...(result.data || payload) };
      $("userName").textContent = payload.full_name;
      $("welcomeName").textContent = payload.full_name;
      $("userAvatar").textContent = payload.full_name.slice(0, 1).toUpperCase();
      showToast("내 정보가 저장되었습니다.");
    } catch (error) {
      console.error("Profile update failed:", error);
      const missingColumn = /bank_name|account_number/i.test(error?.message || "");
      showToast(
        missingColumn
          ? "계좌 정보 데이터베이스 설정이 필요합니다. 운영팀에 문의해주세요."
          : "저장에 실패했습니다: " + (error?.message || "알 수 없는 오류"),
        "error"
      );
    } finally {
      setLoading(button, false, "내 정보 저장");
    }
  }

  const minutesToTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  function timeToMinutes(value = "") {
    const [hour, minute] = String(value).slice(0, 5).split(":").map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : NaN;
  }

  const availabilityKey = (day, minutes) => `${Number(day)}:${Number(minutes)}`;

  function parseAvailabilityKey(key) {
    const [day, minutes] = String(key).split(":").map(Number);
    return { day, minutes };
  }

  function buildAvailabilityGrid() {
    const grid = $("availabilityGrid");
    if (!grid) return;

    const headers = [
      '<div class="availability-grid-corner" aria-hidden="true">시간</div>',
      ...scheduleDayOrder.map((day) => `<div class="availability-day-header" role="columnheader"><strong>${days[day]}</strong><span>요일</span></div>`)
    ];
    const rows = [];

    for (let minutes = scheduleStartMinutes; minutes < scheduleEndMinutes; minutes += scheduleStepMinutes) {
      const fullHour = minutes % 60 === 0;
      rows.push(`<div class="availability-time-label${fullHour ? " full-hour" : ""}" role="rowheader">${minutesToTime(minutes)}</div>`);
      scheduleDayOrder.forEach((day) => {
        const key = availabilityKey(day, minutes);
        rows.push(`<button class="availability-cell${fullHour ? " full-hour" : ""}" type="button" role="gridcell" data-availability-key="${key}" aria-label="${days[day]}요일 ${minutesToTime(minutes)}부터 30분" aria-pressed="false"></button>`);
      });
    }

    grid.innerHTML = headers.concat(rows).join("");
    renderAvailabilityGridSelection();
  }

  function renderAvailabilityGridSelection() {
    document.querySelectorAll("[data-availability-key]").forEach((cell) => {
      const selected = selectedAvailability.has(cell.dataset.availabilityKey);
      cell.classList.toggle("selected", selected);
      cell.setAttribute("aria-pressed", String(selected));
    });
    updateAvailabilityCellCount();
  }

  function updateAvailabilityCellCount() {
    const target = $("availabilityCellCount");
    if (!target) return;
    const minutes = selectedAvailability.size * scheduleStepMinutes;
    const hours = minutes / 60;
    const hoursText = Number.isInteger(hours) ? `${hours}시간` : `${hours.toFixed(1)}시간`;
    target.textContent = `${selectedAvailability.size}칸 · ${hoursText}`;
  }

  function setAvailabilityCell(cell, shouldSelect) {
    if (!cell?.dataset?.availabilityKey) return false;
    const key = cell.dataset.availabilityKey;
    const wasSelected = selectedAvailability.has(key);
    if (wasSelected === shouldSelect) return false;

    if (shouldSelect) selectedAvailability.add(key);
    else selectedAvailability.delete(key);
    cell.classList.toggle("selected", shouldSelect);
    cell.setAttribute("aria-pressed", String(shouldSelect));
    updateAvailabilityCellCount();
    return true;
  }

  function selectionToSlots() {
    const locationValue = $("scheduleLocation")?.value || "송도 내 협의";
    const compacted = [];

    scheduleDayOrder.forEach((day) => {
      const times = [...selectedAvailability]
        .map(parseAvailabilityKey)
        .filter((item) => item.day === day)
        .map((item) => item.minutes)
        .sort((a, b) => a - b);
      if (!times.length) return;

      let rangeStart = times[0];
      let previous = times[0];
      const pushRange = () => {
        compacted.push({
          localId: `${day}-${rangeStart}`,
          day_of_week: day,
          start_time: minutesToTime(rangeStart),
          end_time: minutesToTime(previous + scheduleStepMinutes),
          location: locationValue
        });
      };

      for (let index = 1; index < times.length; index += 1) {
        const current = times[index];
        if (current !== previous + scheduleStepMinutes) {
          pushRange();
          rangeStart = current;
        }
        previous = current;
      }
      pushRange();
    });

    return compacted;
  }

  function refreshScheduleFromSelection({ dirty = false } = {}) {
    slots = selectionToSlots();
    renderSlots();
    renderScheduleSummary();
    if (dirty) markScheduleDirty();
  }

  function finishGridSelectionChange() {
    refreshScheduleFromSelection({ dirty: true });
  }

  function handleGridPointerDown(event) {
    const cell = event.target.closest("[data-availability-key]");
    if (!cell || event.button !== 0 || event.pointerType === "touch") return;

    event.preventDefault();
    suppressGridClick = true;
    gridDragState = {
      pointerId: event.pointerId,
      shouldSelect: !selectedAvailability.has(cell.dataset.availabilityKey),
      changed: false
    };
    $("availabilityGridShell").classList.add("dragging");
    gridDragState.changed = setAvailabilityCell(cell, gridDragState.shouldSelect) || gridDragState.changed;
  }

  function handleGridPointerMove(event) {
    if (!gridDragState || event.pointerId !== gridDragState.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-availability-key]");
    if (!target || !$("availabilityGrid").contains(target)) return;
    event.preventDefault();
    gridDragState.changed = setAvailabilityCell(target, gridDragState.shouldSelect) || gridDragState.changed;
  }

  function handleGridPointerEnd(event) {
    if (!gridDragState || event.pointerId !== gridDragState.pointerId) return;
    const changed = gridDragState.changed;
    gridDragState = null;
    $("availabilityGridShell").classList.remove("dragging");
    if (changed) finishGridSelectionChange();
    window.setTimeout(() => { suppressGridClick = false; }, 80);
  }

  function handleGridClick(event) {
    const cell = event.target.closest("[data-availability-key]");
    if (!cell) return;
    if (suppressGridClick) {
      event.preventDefault();
      return;
    }
    setAvailabilityCell(cell, !selectedAvailability.has(cell.dataset.availabilityKey));
    finishGridSelectionChange();
  }

  async function loadAvailability() {
    const { data, error } = await supabase
      .from("availability")
      .select("id, day_of_week, start_time, end_time, location, memo, updated_at")
      .eq("teacher_id", currentUser.id)
      .order("day_of_week")
      .order("start_time");
    if (error) return showToast("스케줄을 불러오지 못했습니다.", "error");

    selectedAvailability = new Set();
    (data || []).forEach((row) => {
      const start = Math.max(scheduleStartMinutes, Math.ceil(timeToMinutes(row.start_time) / scheduleStepMinutes) * scheduleStepMinutes);
      const end = Math.min(scheduleEndMinutes, timeToMinutes(row.end_time));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let minutes = start; minutes < end; minutes += scheduleStepMinutes) {
        selectedAvailability.add(availabilityKey(row.day_of_week, minutes));
      }
    });

    scheduleMemo = data?.[0]?.memo || "";
    $("scheduleMemo").value = scheduleMemo;
    const savedLocation = data?.find((row) => row.location)?.location || "IGC";
    const locationSelect = $("scheduleLocation");
    locationSelect.value = [...locationSelect.options].some((option) => option.value === savedLocation) ? savedLocation : "송도 내 협의";

    renderAvailabilityGridSelection();
    refreshScheduleFromSelection();
    if (data?.length) {
      $("scheduleSaveState").textContent = "저장됨";
      $("scheduleSaveState").classList.add("saved");
    } else {
      $("scheduleSaveState").textContent = "저장 전";
      $("scheduleSaveState").classList.remove("saved");
    }
  }

  function removeSlot(localId) {
    const targetSlot = slots.find((slot) => slot.localId === localId);
    if (!targetSlot) return;
    const start = timeToMinutes(targetSlot.start_time);
    const end = timeToMinutes(targetSlot.end_time);
    for (let minutes = start; minutes < end; minutes += scheduleStepMinutes) {
      selectedAvailability.delete(availabilityKey(targetSlot.day_of_week, minutes));
    }
    renderAvailabilityGridSelection();
    refreshScheduleFromSelection({ dirty: true });
  }

  function clearSchedule() {
    if (!selectedAvailability.size && !$("scheduleMemo").value) return;
    if (!confirm("현재 선택한 가능 시간과 메모를 모두 삭제할까요? 저장 버튼을 누르기 전까지 서버 데이터는 유지됩니다.")) return;
    selectedAvailability.clear();
    $("scheduleMemo").value = "";
    renderAvailabilityGridSelection();
    refreshScheduleFromSelection({ dirty: true });
  }

  function markScheduleDirty() {
    $("scheduleSaveState").textContent = "저장 필요";
    $("scheduleSaveState").classList.remove("saved");
  }

  function renderSlots() {
    $("slotCount").textContent = `${slots.length}개 시간대`;
    if (!slots.length) {
      $("slotList").innerHTML = '<div class="empty-state compact">선택한 가능 시간이 없습니다.</div>';
      return;
    }
    $("slotList").innerHTML = slots.map((slot) => `
      <div class="slot-item">
        <span class="slot-day">${days[Number(slot.day_of_week)]}</span>
        <div class="slot-main">
          <strong>${escapeHtml(slot.start_time.slice(0,5))} – ${escapeHtml(slot.end_time.slice(0,5))}</strong>
          <small>${escapeHtml(slot.location || "송도 내 협의")}</small>
        </div>
        <button class="remove-slot" data-remove-slot="${escapeHtml(slot.localId)}" type="button" aria-label="이 시간대 선택 해제">×</button>
      </div>`).join("");
  }

  async function saveSchedule() {
    slots = selectionToSlots();
    if (!slots.length) {
      if (!confirm("가능 시간을 비워서 저장할까요? 기존 제출 내용이 모두 삭제됩니다.")) return;
    }
    const locationValue = $("scheduleLocation").value;
    if (!locationValue) {
      $("scheduleLocation").focus();
      return showToast("선호 장소를 선택해주세요.", "error");
    }

    const button = $("saveScheduleButton");
    setLoading(button, true, "스케줄 저장하기");
    const memo = $("scheduleMemo").value.trim();

    const { error: deleteError } = await supabase.from("availability").delete().eq("teacher_id", currentUser.id);
    if (deleteError) {
      setLoading(button, false, "스케줄 저장하기");
      return showToast("기존 스케줄 정리에 실패했습니다: " + deleteError.message, "error");
    }

    if (slots.length) {
      const rows = slots.map((slot) => ({
        teacher_id: currentUser.id,
        day_of_week: Number(slot.day_of_week),
        start_time: slot.start_time.slice(0,5),
        end_time: slot.end_time.slice(0,5),
        location: locationValue,
        memo
      }));
      const { error } = await supabase.from("availability").insert(rows);
      if (error) {
        setLoading(button, false, "스케줄 저장하기");
        return showToast("저장에 실패했습니다: " + error.message, "error");
      }
    }

    setLoading(button, false, "스케줄 저장하기");
    $("scheduleSaveState").textContent = "저장됨";
    $("scheduleSaveState").classList.add("saved");
    showToast("가능 시간이 운영팀에 제출되었습니다.");
    await loadAvailability();
  }

  function renderScheduleSummary() {
    if (!slots.length) {
      $("scheduleSummary").className = "schedule-summary empty-state";
      $("scheduleSummary").textContent = "아직 제출된 스케줄이 없습니다.";
      return;
    }
    const grouped = slots.reduce((acc, slot) => {
      const day = days[Number(slot.day_of_week)] + "요일";
      acc[day] ||= [];
      acc[day].push(`${slot.start_time.slice(0,5)}–${slot.end_time.slice(0,5)}`);
      return acc;
    }, {});
    $("scheduleSummary").className = "schedule-summary";
    $("scheduleSummary").innerHTML = Object.entries(grouped).slice(0, 5).map(([day, times]) => `
      <div class="summary-row"><strong>${day}</strong><span>${escapeHtml(times.join(", "))}</span></div>`).join("");
  }

  async function loadAnnouncements() {
    const { data, error } = await supabase.from("announcements").select("title, body, published_at").eq("is_active", true).order("published_at", { ascending: false }).limit(5);
    if (error || !data?.length) {
      $("announcementList").innerHTML = '<div class="empty-state">현재 공지사항이 없습니다.</div>';
      return;
    }
    $("announcementList").innerHTML = data.map((item) => {
      const date = new Date(item.published_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
      return `<div class="announcement-item"><span class="announcement-date">${date}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div></div>`;
    }).join("");
  }

  async function loadResources() {
    const { data, error } = await supabase.from("resources").select("title, description, category, file_url, sort_order").eq("is_active", true).order("sort_order");
    if (error || !data?.length) {
      $("resourceGrid").innerHTML = '<div class="panel empty-state">등록된 자료가 없습니다. 관리자에게 자료 URL 등록을 요청해주세요.</div>';
      return;
    }
    $("resourceGrid").innerHTML = data.map((item) => `
      <article class="resource-card">
        <div class="resource-icon">${item.category === "PDF" ? "PDF" : "DOC"}</div>
        <span class="resource-type">${escapeHtml(item.category || "RESOURCE")}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description || "")}</p>
        <a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener">자료 열기 →</a>
      </article>`).join("");
  }

  function youtubeEmbedUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      let id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
      if (parsed.pathname.includes("/embed/")) id = parsed.pathname.split("/embed/")[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : "";
    } catch { return ""; }
  }

  async function loadVideos() {
    const { data, error } = await supabase.from("training_videos").select("title, description, video_url, sort_order").eq("is_active", true).order("sort_order");
    if (error || !data?.length) {
      $("videoGrid").innerHTML = '<div class="panel empty-state">등록된 교육 영상이 없습니다.</div>';
      return;
    }
    $("videoGrid").innerHTML = data.map((item, index) => {
      const embedUrl = youtubeEmbedUrl(item.video_url);
      return `<article class="video-card">
        <div class="video-frame">${embedUrl ? `<iframe src="${embedUrl}" title="${escapeHtml(item.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>` : '<div class="empty-state">영상 URL을 확인해주세요.</div>'}</div>
        <div class="video-info"><span class="video-order">VIDEO ${String(index + 1).padStart(2,"0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "")}</p></div>
      </article>`;
    }).join("");
  }

  function loadGuideChecks() {
    try { return JSON.parse(localStorage.getItem(`nado-guide-${currentUser?.id || "guest"}`) || "{}"); } catch { return {}; }
  }
  function renderGuideProgress() {
    const checks = loadGuideChecks();
    document.querySelectorAll("[data-guide]").forEach((input) => { input.checked = Boolean(checks[input.dataset.guide]); });
    const total = document.querySelectorAll("[data-guide]").length;
    const completed = Object.values(checks).filter(Boolean).length;
    $("guideProgressText").textContent = `${completed} / ${total} 완료`;
    $("guideProgressBar").style.width = `${(completed / total) * 100}%`;
  }
  function saveGuideCheck(event) {
    if (!event.target.matches("[data-guide]")) return;
    const checks = loadGuideChecks();
    checks[event.target.dataset.guide] = event.target.checked;
    localStorage.setItem(`nado-guide-${currentUser?.id || "guest"}`, JSON.stringify(checks));
    renderGuideProgress();
  }

  function bindEvents() {
    $("loginForm").addEventListener("submit", login);
    $("resetPasswordButton").addEventListener("click", resetPassword);
    $("logoutButton").addEventListener("click", logout);
    $("profileForm").addEventListener("submit", saveProfile);
    buildAvailabilityGrid();
    $("availabilityGrid").addEventListener("pointerdown", handleGridPointerDown);
    $("availabilityGrid").addEventListener("click", handleGridClick);
    document.addEventListener("pointermove", handleGridPointerMove, { passive: false });
    document.addEventListener("pointerup", handleGridPointerEnd);
    document.addEventListener("pointercancel", handleGridPointerEnd);
    $("saveScheduleButton").addEventListener("click", saveSchedule);
    $("clearScheduleButton").addEventListener("click", clearSchedule);
    $("scheduleMemo").addEventListener("input", markScheduleDirty);
    $("scheduleLocation").addEventListener("change", () => refreshScheduleFromSelection({ dirty: true }));
    $("slotList").addEventListener("click", (e) => { const button = e.target.closest("[data-remove-slot]"); if (button) removeSlot(button.dataset.removeSlot); });
    $("guideChecklist").addEventListener("change", saveGuideCheck);
    document.querySelectorAll("[data-page]").forEach((el) => el.addEventListener("click", () => switchPage(el.dataset.page)));
    document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => switchPage(el.dataset.go)));
    $("sidebarOpen").setAttribute("aria-controls", "sidebar");
    $("sidebarOpen").setAttribute("aria-expanded", "false");
    $("sidebarOpen").addEventListener("click", openSidebar);
    $("sidebarClose").addEventListener("click", () => closeSidebar({ restoreFocus: true }));
    $("sidebarBackdrop").addEventListener("click", () => closeSidebar({ restoreFocus: true }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("sidebar").classList.contains("open")) {
        closeSidebar({ restoreFocus: true });
      }
    });
    if (typeof mobileSidebarQuery.addEventListener === "function") {
      mobileSidebarQuery.addEventListener("change", syncSidebarForViewport);
    } else {
      mobileSidebarQuery.addListener(syncSidebarForViewport);
    }
    syncSidebarForViewport();
    window.addEventListener("hashchange", () => { if (currentUser) switchPage(location.hash.replace("#", "") || "dashboard"); });
    if (config.SUPPORT_URL) $("supportLink").href = config.SUPPORT_URL;
  }

  bindEvents();
  if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Auth 이벤트 안에서 signOut 같은 비동기 Auth API를 다시 호출하면
        // 재귀 호출 또는 교착 상태가 생길 수 있으므로 화면만 정리합니다.
        window.setTimeout(renderSignedOutState, 0);
      }
    });
    initializeSession();
  }
})();
