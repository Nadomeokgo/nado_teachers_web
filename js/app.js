(() => {
  "use strict";
  const config = window.NADO_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const supabase = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  let teachers = [];
  let adminLogoutInProgress = false;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  function toast(message, error = false) { const el = $("toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`; setTimeout(() => el.className = "toast", 2600); }

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
      .select("id, full_name, email, school, major, availability(id, day_of_week, start_time, end_time, location, memo, updated_at)")
      .neq("role", "admin")
      .order("full_name");
    if (error) return toast("데이터를 불러오지 못했습니다: " + error.message, true);
    teachers = data || [];
    updateStats();
    render();
    await loadContent();
  }

  function updateStats() {
    const slots = teachers.flatMap((teacher) => teacher.availability || []);
    const latest = slots.map((slot) => slot.updated_at).filter(Boolean).sort().at(-1);
    $("teacherCount").textContent = `${teachers.length}명`;
    $("slotTotalCount").textContent = `${slots.length}개`;
    $("latestUpdate").textContent = latest ? new Date(latest).toLocaleDateString("ko-KR") : "없음";
  }

  function filteredTeachers() {
    const keyword = $("teacherSearch").value.trim().toLowerCase();
    const day = $("dayFilter").value;
    return teachers.map((teacher) => ({
      ...teacher,
      availability: (teacher.availability || []).filter((slot) => day === "all" || String(slot.day_of_week) === day)
    })).filter((teacher) => {
      const matchesText = !keyword || `${teacher.full_name || ""} ${teacher.email || ""}`.toLowerCase().includes(keyword);
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
            <span class="teacher-admin-avatar">${escapeHtml((teacher.full_name || "T").slice(0,1))}</span>
            <div><strong>${escapeHtml(teacher.full_name || "이름 미입력")}</strong><span>${escapeHtml(teacher.email || "")} · ${escapeHtml(teacher.school || "학교 미입력")} ${teacher.major ? `· ${escapeHtml(teacher.major)}` : ""}</span></div>
          </div>
          <span class="updated-at">${latest ? `업데이트 ${new Date(latest).toLocaleString("ko-KR")}` : "미제출"}</span>
        </div>
        <div class="admin-slots">${slots.length ? slots.map((slot) => `<div class="admin-slot"><strong>${days[Number(slot.day_of_week)]}</strong>${escapeHtml(slot.start_time.slice(0,5))}–${escapeHtml(slot.end_time.slice(0,5))}<br>${escapeHtml(slot.location || "")}</div>`).join("") : '<div class="empty-state compact">제출된 시간이 없습니다.</div>'}</div>
        ${memo ? `<div class="admin-memo"><strong>메모:</strong> ${escapeHtml(memo)}</div>` : ""}
      </article>`;
    }).join("");
  }



  async function loadContent() {
    const [announcementResult, resourceResult, videoResult] = await Promise.all([
      supabase.from("announcements").select("id, title, body, is_active, published_at").order("published_at", { ascending: false }),
      supabase.from("resources").select("id, title, category, file_url, sort_order, is_active").order("sort_order"),
      supabase.from("training_videos").select("id, title, video_url, sort_order, is_active").order("sort_order")
    ]);
    if (announcementResult.error || resourceResult.error || videoResult.error) {
      return toast("콘텐츠 목록 일부를 불러오지 못했습니다.", true);
    }
    renderManagerList("adminAnnouncementList", announcementResult.data, "announcement");
    renderManagerList("adminResourceList", resourceResult.data, "resource");
    renderManagerList("adminVideoList", videoResult.data, "video");
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
        ? new Date(item.published_at).toLocaleDateString("ko-KR")
        : type === "resource" ? `${item.category} · 순서 ${item.sort_order}` : `순서 ${item.sort_order}`;
      return `<div class="manager-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail)}</small></div><button data-delete-table="${table}" data-delete-id="${item.id}" type="button" aria-label="삭제">×</button></div>`;
    }).join("");
  }

  async function addAnnouncement(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const { error } = await supabase.from("announcements").insert({
      title: $("announcementTitle").value.trim(),
      body: $("announcementBody").value.trim(),
      published_at: new Date().toISOString(),
      is_active: true
    });
    button.disabled = false;
    if (error) return toast("공지 등록 실패: " + error.message, true);
    event.target.reset();
    toast("공지사항을 등록했습니다.");
    await loadContent();
  }

  async function addResource(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const { error } = await supabase.from("resources").insert({
      title: $("resourceTitle").value.trim(),
      description: $("resourceDescription").value.trim(),
      category: $("resourceCategory").value,
      file_url: $("resourceUrl").value.trim(),
      sort_order: Number($("resourceOrder").value) || 0,
      is_active: true
    });
    button.disabled = false;
    if (error) return toast("자료 등록 실패: " + error.message, true);
    event.target.reset();
    $("resourceOrder").value = "1";
    toast("수업 자료를 등록했습니다.");
    await loadContent();
  }

  async function addVideo(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const { error } = await supabase.from("training_videos").insert({
      title: $("videoTitle").value.trim(),
      description: $("videoDescription").value.trim(),
      video_url: $("videoUrl").value.trim(),
      sort_order: Number($("videoOrder").value) || 0,
      is_active: true
    });
    button.disabled = false;
    if (error) return toast("영상 등록 실패: " + error.message, true);
    event.target.reset();
    $("videoOrder").value = "1";
    toast("교육 영상을 등록했습니다.");
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

  $("announcementForm").addEventListener("submit", addAnnouncement);
  $("resourceForm").addEventListener("submit", addResource);
  $("videoForm").addEventListener("submit", addVideo);
  document.querySelector(".admin-content-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-table]");
    if (button) deleteContent(button.dataset.deleteTable, button.dataset.deleteId);
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
