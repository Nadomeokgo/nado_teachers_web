(() => {
  const config = window.NADO_CONFIG || {};
  const supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const assignmentId = new URLSearchParams(window.location.search).get("assignment");
  const state = { user: null, profile: null, assignment: null, files: [] };
  const maxBytes = 50 * 1024 * 1024;
  const allowed = ["pdf","doc","docx","ppt","pptx","xls","xlsx","jpg","jpeg","png","webp","mp3","m4a","wav"];
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const formatDate = (value) => value ? new Date(value).toLocaleString("ko-KR") : "-";
  const formatBytes = (bytes) => Number(bytes || 0) < 1024 ** 2 ? `${(Number(bytes || 0) / 1024).toFixed(1)} KB` : `${(Number(bytes || 0) / 1024 ** 2).toFixed(1)} MB`;
  const planLabel = (plan) => ({ economy: "이코노미", standard: "스탠다드", premium: "프리미엄" }[plan] || "미지정");

  function toast(message, error = false) {
    const node = $("toast");
    node.textContent = message;
    node.className = `toast show${error ? " error" : ""}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.className = "toast"; }, 3200);
  }

  function render() {
    const assignment = state.assignment;
    $("classroomTitle").textContent = `${assignment.student_name} 학생 공유 공간`;
    $("classroomSubtitle").textContent = assignment.student_email || "배정된 학생과 수업 자료를 공유합니다.";
    $("classroomStatus").textContent = assignment.status === "active" ? "공유 가능" : "배정 종료";
    $("classroomSummary").innerHTML = `<div><span>학생</span><strong>${escapeHtml(assignment.student_name)}</strong></div><div><span>플랜</span><strong>${escapeHtml(planLabel(assignment.plan))}</strong></div><div><span>수업 시작일</span><strong>${escapeHtml(assignment.first_lesson_date || "-")}</strong></div>`;
    $("teacherFileForm").classList.toggle("hidden", assignment.status !== "active");
    $("teacherFileList").innerHTML = state.files.length ? state.files.map((file) => `
      <div class="classroom-file"><div><strong>${escapeHtml(file.original_name)}</strong><span>${file.uploader_id === state.user.id ? "선생님 업로드" : "학생 업로드"} · ${formatBytes(file.size_bytes)} · ${escapeHtml(formatDate(file.created_at))}</span></div><div class="classroom-file-actions"><button class="button secondary small" data-download="${escapeHtml(file.id)}" type="button">다운로드</button>${file.uploader_id === state.user.id || state.profile.role === "admin" ? `<button class="button ghost small" data-delete="${escapeHtml(file.id)}" type="button">삭제</button>` : ""}</div></div>`).join("") : '<div class="classroom-empty">아직 공유된 파일이 없습니다.</div>';
  }

  async function initialize() {
    if (!assignmentId) throw new Error("공유 공간 주소가 올바르지 않습니다.");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return window.location.replace(`index.html?return=classroom&assignment=${encodeURIComponent(assignmentId)}`);
    state.user = sessionData.session.user;
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id,full_name,role,account_status").eq("id", state.user.id).maybeSingle();
    if (profileError || !profile || !["teacher","admin"].includes(profile.role)) throw new Error("선생님 또는 관리자 계정으로 로그인해주세요.");
    state.profile = profile;
    const [assignmentResult, filesResult] = await Promise.all([
      supabase.from("student_assignments").select("id,teacher_id,student_id,student_name,student_email,plan,first_lesson_date,status").eq("id", assignmentId).maybeSingle(),
      supabase.from("assignment_files").select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false })
    ]);
    if (assignmentResult.error || !assignmentResult.data) throw new Error("이 공유 공간에 접근할 권한이 없습니다.");
    if (filesResult.error) throw filesResult.error;
    state.assignment = assignmentResult.data;
    state.files = filesResult.data || [];
    render();
  }

  async function download(id) {
    const file = state.files.find((item) => item.id === id);
    if (!file) return;
    const { data, error } = await supabase.storage.from("assignment-files").createSignedUrl(file.storage_path, 60);
    if (error) return toast("파일을 열지 못했습니다.", true);
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function removeFile(id) {
    const file = state.files.find((item) => item.id === id);
    if (!file || !confirm(`${file.original_name} 파일을 삭제할까요?`)) return;
    const { error: storageError } = await supabase.storage.from("assignment-files").remove([file.storage_path]);
    if (storageError) return toast("파일을 삭제하지 못했습니다.", true);
    const { error } = await supabase.from("assignment_files").delete().eq("id", id);
    if (error) return toast("파일 기록을 삭제하지 못했습니다.", true);
    state.files = state.files.filter((item) => item.id !== id);
    render(); toast("파일을 삭제했습니다.");
  }

  $("teacherFileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = $("teacherFileInput").files[0];
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!allowed.includes(ext)) return toast("허용되지 않는 파일 형식입니다.", true);
    if (file.size > maxBytes) return toast("파일은 50MB 이하만 업로드할 수 있습니다.", true);
    const button = $("teacherUploadButton"); button.disabled = true; button.textContent = "업로드 중...";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const path = `${assignmentId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("assignment-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (uploadError) { button.disabled = false; button.textContent = "파일 업로드"; return toast("파일 업로드에 실패했습니다.", true); }
    const { data: row, error } = await supabase.from("assignment_files").insert({ assignment_id: assignmentId, uploader_id: state.user.id, original_name: file.name, storage_path: path, content_type: file.type || null, size_bytes: file.size }).select("*").single();
    button.disabled = false; button.textContent = "파일 업로드";
    if (error) { await supabase.storage.from("assignment-files").remove([path]); return toast("파일 정보를 저장하지 못했습니다.", true); }
    $("teacherFileInput").value = ""; state.files.unshift(row); render(); toast("학생 공유 공간에 파일을 올렸습니다.");
  });

  $("teacherFileList").addEventListener("click", (event) => {
    const downloadButton = event.target.closest("[data-download]");
    if (downloadButton) download(downloadButton.dataset.download);
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) removeFile(deleteButton.dataset.delete);
  });
  initialize().catch((error) => { $("classroomStatus").textContent = "접근 불가"; $("teacherFileForm").classList.add("hidden"); $("teacherFileList").innerHTML = `<div class="classroom-empty">${escapeHtml(error.message || "공유 공간을 불러오지 못했습니다.")}</div>`; });
})();
