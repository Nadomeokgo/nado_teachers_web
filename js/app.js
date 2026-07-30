(() => {
  "use strict";

  const config = window.NADO_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const supabase = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const pageMeta = {
    dashboard: ["TEACHER HOME", "홈"], schedule: ["WEEKLY AVAILABILITY", "스케줄 제출"],
    guide: ["FIRST LESSON GUIDE", "첫 수업 가이드"], curriculum: ["CURRICULUM", "커리큘럼"],
    training: ["TRAINING VIDEOS", "교육 영상"], profile: ["MY PROFILE", "내 정보"]
  };

  let currentUser = null;
  let profile = null;
  let slots = [];
  let scheduleMemo = "";

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

  function openSidebar() {
    $("sidebar").classList.add("open");
    $("sidebarBackdrop").classList.remove("hidden");
  }
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    $("sidebarBackdrop").classList.add("hidden");
  }

  async function login(event) {
    event.preventDefault();
    if (!checkConfiguration()) return;
    const button = event.submitter;
    setLoading(button, true, "로그인");
    const { error } = await supabase.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });
    setLoading(button, false, "로그인");
    if (error) return showToast("이메일 또는 비밀번호를 확인해주세요.", "error");
    await initializeSession();
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

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    currentUser = null; profile = null; slots = [];
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    location.hash = "";
  }

  async function initializeSession() {
    if (!checkConfiguration()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      $("loginView").classList.remove("hidden");
      $("appView").classList.add("hidden");
      return;
    }
    currentUser = session.user;
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    await Promise.all([loadProfile(), loadAvailability(), loadAnnouncements(), loadResources(), loadVideos()]);
    renderGuideProgress();
    switchPage(location.hash.replace("#", "") || "dashboard");
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
    $("profileBio").value = profile.bio || "";
    $("adminLink").classList.toggle("hidden", profile.role !== "admin");
  }

  async function saveProfile(event) {
    event.preventDefault();
    const button = event.submitter;
    setLoading(button, true, "내 정보 저장");
    const payload = {
      id: currentUser.id,
      email: currentUser.email,
      full_name: $("profileName").value.trim(),
      school: $("profileSchool").value.trim(),
      major: $("profileMajor").value.trim(),
      phone: $("profilePhone").value.trim(),
      bio: $("profileBio").value.trim(),
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("profiles").upsert(payload);
    setLoading(button, false, "내 정보 저장");
    if (error) return showToast("저장에 실패했습니다: " + error.message, "error");
    profile = { ...profile, ...payload };
    $("userName").textContent = payload.full_name;
    $("welcomeName").textContent = payload.full_name;
    showToast("내 정보가 저장되었습니다.");
  }

  async function loadAvailability() {
    const { data, error } = await supabase
      .from("availability")
      .select("id, day_of_week, start_time, end_time, location, memo, updated_at")
      .eq("teacher_id", currentUser.id)
      .order("day_of_week")
      .order("start_time");
    if (error) return showToast("스케줄을 불러오지 못했습니다.", "error");
    slots = (data || []).map((row) => ({ ...row, localId: row.id || crypto.randomUUID() }));
    scheduleMemo = data?.[0]?.memo || "";
    $("scheduleMemo").value = scheduleMemo;
    renderSlots();
    renderScheduleSummary();
    if (data?.length) {
      $("scheduleSaveState").textContent = "저장됨";
      $("scheduleSaveState").classList.add("saved");
    }
  }

  function addSlot(event) {
    event.preventDefault();
    const day = Number($("slotDay").value);
    const start = $("slotStart").value;
    const end = $("slotEnd").value;
    const locationValue = $("slotLocation").value;
    if (!Number.isInteger(day) || !start || !end) return showToast("요일과 시간을 모두 입력해주세요.", "error");
    if (start >= end) return showToast("종료 시간은 시작 시간보다 늦어야 합니다.", "error");
    const overlap = slots.some((slot) => Number(slot.day_of_week) === day && start < slot.end_time.slice(0,5) && end > slot.start_time.slice(0,5));
    if (overlap) return showToast("같은 요일에 겹치는 시간대가 있습니다.", "error");
    slots.push({ localId: crypto.randomUUID(), day_of_week: day, start_time: start, end_time: end, location: locationValue });
    slots.sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week) || a.start_time.localeCompare(b.start_time));
    event.target.reset();
    $("slotLocation").value = "IGC";
    markScheduleDirty();
    renderSlots();
  }

  function removeSlot(localId) {
    slots = slots.filter((slot) => slot.localId !== localId);
    markScheduleDirty();
    renderSlots();
  }

  function clearSchedule() {
    if (!slots.length && !$("scheduleMemo").value) return;
    if (!confirm("현재 선택한 시간대를 모두 삭제할까요? 저장 버튼을 누르기 전까지 서버 데이터는 유지됩니다.")) return;
    slots = [];
    $("scheduleMemo").value = "";
    markScheduleDirty();
    renderSlots();
  }

  function markScheduleDirty() {
    $("scheduleSaveState").textContent = "저장 필요";
    $("scheduleSaveState").classList.remove("saved");
  }

  function renderSlots() {
    $("slotCount").textContent = `${slots.length}개`;
    if (!slots.length) {
      $("slotList").innerHTML = '<div class="empty-state compact">추가된 시간대가 없습니다.</div>';
      return;
    }
    $("slotList").innerHTML = slots.map((slot) => `
      <div class="slot-item">
        <span class="slot-day">${days[Number(slot.day_of_week)]}</span>
        <div class="slot-main">
          <strong>${escapeHtml(slot.start_time.slice(0,5))} – ${escapeHtml(slot.end_time.slice(0,5))}</strong>
          <small>${escapeHtml(slot.location || "송도 내 협의")}</small>
        </div>
        <button class="remove-slot" data-remove-slot="${escapeHtml(slot.localId)}" type="button" aria-label="시간대 삭제">×</button>
      </div>`).join("");
  }

  async function saveSchedule() {
    if (!slots.length) {
      if (!confirm("스케줄을 비워서 저장할까요? 기존 제출 내용이 모두 삭제됩니다.")) return;
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
        location: slot.location,
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
    showToast("스케줄이 운영팀에 제출되었습니다.");
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
    $("slotForm").addEventListener("submit", addSlot);
    $("saveScheduleButton").addEventListener("click", saveSchedule);
    $("clearScheduleButton").addEventListener("click", clearSchedule);
    $("scheduleMemo").addEventListener("input", markScheduleDirty);
    $("slotList").addEventListener("click", (e) => { const button = e.target.closest("[data-remove-slot]"); if (button) removeSlot(button.dataset.removeSlot); });
    $("guideChecklist").addEventListener("change", saveGuideCheck);
    document.querySelectorAll("[data-page]").forEach((el) => el.addEventListener("click", () => switchPage(el.dataset.page)));
    document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => switchPage(el.dataset.go)));
    $("sidebarOpen").addEventListener("click", openSidebar);
    $("sidebarClose").addEventListener("click", closeSidebar);
    $("sidebarBackdrop").addEventListener("click", closeSidebar);
    window.addEventListener("hashchange", () => { if (currentUser) switchPage(location.hash.replace("#", "") || "dashboard"); });
    if (config.SUPPORT_URL) $("supportLink").href = config.SUPPORT_URL;
  }

  bindEvents();
  if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") logout();
    });
    initializeSession();
  }
})();
