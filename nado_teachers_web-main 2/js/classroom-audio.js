(() => {
  const config = window.NADO_CONFIG || {};
  if (!window.supabase || !config.SUPABASE_URL) return;
  const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const assignmentId = new URLSearchParams(window.location.search).get("assignment");
  const state = { user: null, profile: null, submissions: [] };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const dateTime = (value) => value ? new Date(value).toLocaleString("ko-KR") : "-";
  const time = (seconds) => `${String(Math.floor(Number(seconds || 0) / 60)).padStart(2,"0")}:${String(Number(seconds || 0) % 60).padStart(2,"0")}`;
  const label = (status) => ({ uploaded:"업로드 완료",processing:"AI 분석 중",ready:"피드백 대기",reviewed:"피드백 완료",completed:"학습 완료",rerecord_requested:"재녹음 요청",failed:"처리 오류",deleted:"원본 삭제" }[status] || status);

  function toast(message, error = false) {
    const node = $("toast"); node.textContent = message; node.className = `toast show${error ? " error" : ""}`;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.className = "toast"; }, 3500);
  }

  function expressions(items) {
    return Array.isArray(items) && items.length ? `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.expression)}</strong><span>${escapeHtml(item.meaning_ko)}</span><em>${escapeHtml(item.example)}</em></li>`).join("")}</ul>` : "<p>추천 표현 없음</p>";
  }

  function corrections(items) {
    return Array.isArray(items) && items.length ? `<div class="teacher-corrections">${items.map((item) => `<div><del>${escapeHtml(item.original)}</del><strong>${escapeHtml(item.suggested)}</strong><span>${escapeHtml(item.explanation_ko)}</span></div>`).join("")}</div>` : "<p>수정이 꼭 필요한 표현 없음</p>";
  }

  function card(item) {
    const ready = ["ready","reviewed","completed","rerecord_requested"].includes(item.status);
    return `<article class="teacher-audio-card" data-audio-card="${escapeHtml(item.id)}">
      <div class="teacher-audio-head"><div><span class="teacher-audio-status ${escapeHtml(item.status)}">${escapeHtml(label(item.status))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(dateTime(item.created_at))} · ${time(item.duration_seconds)}</p></div>${item.raw_audio_deleted_at ? "" : `<button class="button secondary small" data-teacher-play="${escapeHtml(item.id)}" type="button">▶ 녹음 듣기</button>`}</div>
      <div class="teacher-player" data-teacher-player="${escapeHtml(item.id)}"></div>
      ${item.topic ? `<div class="teacher-audio-topic"><strong>연습 주제</strong><p>${escapeHtml(item.topic)}</p></div>` : ""}
      ${ready ? `<div class="teacher-ai-grid"><section><h4>AI 한국어 요약</h4><p>${escapeHtml(item.summary_ko || "-")}</p></section><section><h4>영어 전사</h4><p class="teacher-transcript">${escapeHtml(item.transcript_en || "-")}</p></section><section><h4>유용한 표현</h4>${expressions(item.key_expressions)}</section><section><h4>더 자연스럽게</h4>${corrections(item.corrections)}</section></div>` : ""}
      ${item.status === "processing" ? '<div class="classroom-empty compact">AI 분석 중입니다. 잠시 후 새로고침해주세요.</div>' : ""}
      ${["failed","uploaded"].includes(item.status) ? `<div class="teacher-audio-error"><span>${escapeHtml(item.status === "failed" ? (item.ai_error || "AI 처리 오류") : "아직 AI 분석이 시작되지 않았습니다.")}</span><button class="button secondary small" data-teacher-retry="${escapeHtml(item.id)}" type="button">AI 분석 시작</button></div>` : ""}
      <form class="teacher-feedback-form" data-feedback-form="${escapeHtml(item.id)}">
        <label>선생님 피드백<textarea rows="4" maxlength="5000" placeholder="잘한 점과 다음 연습 방향을 구체적으로 적어주세요.">${escapeHtml(item.teacher_feedback || "")}</textarea></label>
        <div><select aria-label="피드백 상태"><option value="reviewed" ${item.status === "reviewed" ? "selected" : ""}>피드백 완료</option><option value="completed" ${item.status === "completed" ? "selected" : ""}>학습 완료</option><option value="rerecord_requested" ${item.status === "rerecord_requested" ? "selected" : ""}>재녹음 요청</option></select><button class="button primary" type="submit">피드백 저장</button></div>
      </form>
    </article>`;
  }

  function render() {
    $("teacherAudioList").innerHTML = state.submissions.length ? state.submissions.map(card).join("") : '<div class="classroom-empty">아직 제출된 음성 연습이 없습니다.</div>';
  }

  async function load() {
    if (!assignmentId) throw new Error("배정 ID가 없습니다.");
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return;
    state.user = sessionData.session.user;
    const { data: profile } = await client.from("profiles").select("role,account_status").eq("id", state.user.id).maybeSingle();
    if (!profile || !["teacher","admin"].includes(profile.role)) throw new Error("선생님 또는 관리자 권한이 필요합니다.");
    state.profile = profile;
    const { data, error } = await client.from("audio_submissions").select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
    if (error) throw error;
    state.submissions = data || []; render();
  }

  async function play(id) {
    const item = state.submissions.find((row) => row.id === id); if (!item) return;
    const target = document.querySelector(`[data-teacher-player="${CSS.escape(id)}"]`);
    if (target.querySelector("audio")) return target.querySelector("audio").play();
    const { data, error } = await client.storage.from("audio-submissions").createSignedUrl(item.storage_path, 300);
    if (error) return toast("녹음을 열지 못했습니다.", true);
    target.innerHTML = `<audio controls autoplay src="${escapeHtml(data.signedUrl)}"></audio>`;
  }

  async function saveFeedback(form) {
    const id = form.dataset.feedbackForm;
    const feedback = form.querySelector("textarea").value.trim();
    const status = form.querySelector("select").value;
    const button = form.querySelector("button[type='submit']"); button.disabled = true;
    const { error } = await client.rpc("save_audio_feedback", { target_submission_id: id, feedback_text: feedback, next_status: status });
    button.disabled = false;
    if (error) return toast("피드백을 저장하지 못했습니다.", true);
    toast("학생에게 피드백을 전달했습니다."); await load();
  }

  async function retry(id) {
    toast("AI 분석을 다시 시작합니다.");
    const { data, error } = await client.functions.invoke("process-audio", { body: { submission_id: id } });
    if (error || data?.error) toast(data?.error || "AI 분석을 다시 시작하지 못했습니다.", true);
    await load();
  }

  $("refreshTeacherAudio").addEventListener("click", () => load().catch((error) => toast(error.message, true)));
  $("teacherAudioList").addEventListener("click", (event) => {
    const playButton = event.target.closest("[data-teacher-play]"); if (playButton) play(playButton.dataset.teacherPlay);
    const retryButton = event.target.closest("[data-teacher-retry]"); if (retryButton) retry(retryButton.dataset.teacherRetry);
  });
  $("teacherAudioList").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-feedback-form]"); if (!form) return;
    event.preventDefault(); saveFeedback(form);
  });
  load().catch((error) => { $("teacherAudioList").innerHTML = `<div class="classroom-empty">${escapeHtml(error.message || "음성 연습을 불러오지 못했습니다.")}<br>Phase 2 SQL 적용 여부를 확인해주세요.</div>`; });
})();
