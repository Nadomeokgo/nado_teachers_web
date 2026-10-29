(() => {
  "use strict";
  const mountId = "curriculumAdminRoot";
  const columns = "id,title,summary,plan,level,topic,duration_minutes,sections,status,sort_order,created_at,updated_at";
  const settingsColumns = "id,legacy_links_enabled,updated_at";
  const editableKeys = ["title", "summary", "plan", "level", "topic", "duration_minutes", "sections", "status", "sort_order"];
  const sectionTypes = ["warmup", "goal", "vocabulary", "reading", "discussion", "practice", "wrapup", "custom"];
  const state = { client: null, user: null, root: null, items: [], settings: null, draft: null, baseUpdatedAt: null, snapshot: "", dirty: false, saving: false, settingsSaving: false, query: "", statusFilter: "all", initialized: false, active: false, generation: 0, error: "", conflict: false };
  const shared = () => window.NADO_CURRICULUM_SHARED;
  const english = () => window.NADO_I18N?.getLanguage?.() === "en";
  const text = (ko, en) => english() ? en : ko;
  const esc = (value) => shared().escapeHtml(String(value ?? ""));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const node = (id) => state.root?.querySelector(`#${id}`);
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().trim();
  const uid = () => window.crypto?.randomUUID?.() || `section-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const payloadFor = (draft) => Object.fromEntries(editableKeys.map((key) => [key, clone(draft[key])]));
  const fingerprint = (draft) => JSON.stringify(payloadFor(draft));
  const labelSet = () => shared().labels();
  const currentRequest = (generation) => state.active && generation === state.generation;

  function message(value, error = false) {
    const target = node("ncAdminMessage");
    if (!target) return;
    target.textContent = value;
    target.className = `nc-admin-message${error ? " is-error" : ""}`;
  }

  function shell() {
    state.root.innerHTML = `
      <div class="page-intro nc-admin-heading"><div><p class="section-kicker">CURRICULUM STUDIO</p><h2>${text("커리큘럼 관리", "Curriculum studio")}</h2><p>${text("수업 자료를 작성하고 미리 본 뒤 선생님들에게 공개하세요.", "Create a lesson, preview it, then publish it for teachers.")}</p></div></div>
      <div id="ncAdminMessage" class="nc-admin-message" role="status" aria-live="polite"></div>
      <div class="nc-admin-layout">
        <aside class="panel nc-admin-sidebar">
          <button type="button" class="button primary" data-nc-action="new">${text("새 수업 만들기", "New lesson")}</button>
          <label>${text("수업 검색", "Find a lesson")}<input id="ncAdminSearch" type="search" maxlength="200" placeholder="${text("제목, 주제, 내용 검색", "Search title, topic, or content")}" value="${esc(state.query)}" /></label>
          <label>${text("공개 상태", "Visibility")}<select id="ncAdminStatusFilter"><option value="all">${text("전체", "All")}</option><option value="draft">${text("초안", "Draft")}</option><option value="published">${text("공개", "Published")}</option></select></label>
          <p id="ncAdminListCount" class="nc-admin-list-count" aria-live="polite"></p>
          <div id="ncAdminLessonList" class="nc-admin-lesson-list"></div>
        </aside>
        <div id="ncAdminEditor" class="panel nc-admin-editor"></div>
      </div>
      <div id="ncAdminSettings" class="panel nc-admin-settings"></div>
      <dialog id="ncAdminPreview" class="nc-preview-dialog" aria-labelledby="ncPreviewTitle">
        <div class="nc-preview-toolbar"><h3 id="ncPreviewTitle">${text("저장 전 미리보기", "Preview current changes")}</h3><button class="button ghost small" type="button" data-nc-action="close-preview">${text("닫기", "Close")}</button></div>
        <p class="nc-preview-note">${text("현재 입력한 내용의 미리보기입니다. 저장하거나 공개되지는 않습니다.", "This preview includes your current edits. It does not save or publish them.")}</p>
        <div id="ncAdminPreviewBody"></div>
      </dialog>`;
    node("ncAdminStatusFilter").value = state.statusFilter;
    renderList();
    renderEditor();
    renderSettings();
  }

  function renderList() {
    const query = normalize(state.query);
    const labels = labelSet();
    const items = state.items.filter((lesson) => {
      const search = [lesson.title, lesson.summary, lesson.topic, labels.plans[lesson.plan], labels.levels[lesson.level], ...(lesson.sections || []).map((section) => `${section.title || ""} ${section.body || ""}`)].join(" ");
      return (state.statusFilter === "all" || lesson.status === state.statusFilter) && (!query || normalize(search).includes(query));
    }).sort((a, b) => a.sort_order - b.sort_order || (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0) || String(a.id).localeCompare(String(b.id)));
    node("ncAdminListCount").textContent = text(`${items.length}개 수업`, `${items.length} lessons`);
    node("ncAdminLessonList").innerHTML = items.length ? items.map((lesson) => `
      <button type="button" class="nc-admin-list-item${state.draft?.id === lesson.id ? " is-selected" : ""}" data-nc-open="${esc(lesson.id)}" aria-pressed="${state.draft?.id === lesson.id}">
        <span class="nc-status-badge nc-status-${esc(lesson.status)}">${esc(labels.status[lesson.status])}</span>
        <strong data-curriculum-authored>${esc(lesson.title || text("제목 없는 초안", "Untitled draft"))}</strong>
        <span class="nc-admin-list-meta" data-curriculum-authored>${shared().metadata(lesson).map(esc).join(" · ")}</span>
      </button>`).join("") : `<p class="empty-state">${text("조건에 맞는 수업이 없습니다. 새 수업을 만들어보세요.", "No matching lessons. Create a new lesson to get started.")}</p>`;
  }

  function options(values, selected) {
    return Object.entries(values).map(([value, label]) => `<option value="${esc(value)}"${selected === value ? " selected" : ""}>${esc(label)}</option>`).join("");
  }

  function sectionTypeLabels() {
    return english()
      ? { warmup: "Warm-up", goal: "Goal", vocabulary: "Vocabulary", reading: "Reading", discussion: "Discussion", practice: "Practice", wrapup: "Wrap-up", custom: "Custom" }
      : { warmup: "워밍업", goal: "수업 목표", vocabulary: "어휘·표현", reading: "읽기", discussion: "토론", practice: "말하기 연습", wrapup: "마무리", custom: "직접 구성" };
  }

  function renderSections() {
    const target = node("ncAdminSections");
    if (!target || !state.draft) return;
    const types = sectionTypeLabels();
    target.innerHTML = state.draft.sections.map((section, index) => {
      const availableTypes = sectionTypes.includes(section.type) ? types : { ...types, [section.type]: section.type };
      return `<fieldset class="nc-section-editor" data-nc-section="${index}">
        <legend>${text("수업 단계", "Section")} ${index + 1}</legend>
        <div class="nc-section-editor-tools"><span>${text("순서 변경", "Reorder")}</span>
          <button class="button ghost small" type="button" data-nc-action="section-up" data-nc-index="${index}" aria-label="${text(`${index + 1}번 단계 위로 이동`, `Move section ${index + 1} up`)}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="button ghost small" type="button" data-nc-action="section-down" data-nc-index="${index}" aria-label="${text(`${index + 1}번 단계 아래로 이동`, `Move section ${index + 1} down`)}" ${index === state.draft.sections.length - 1 ? "disabled" : ""}>↓</button>
          <button class="button ghost small" type="button" data-nc-action="section-remove" data-nc-index="${index}">${text("삭제", "Remove")}</button>
        </div>
        <div class="nc-form-row">
          <label>${text("단계 종류", "Section type")}<select data-nc-section-field="type">${options(availableTypes, section.type)}</select></label>
          <label>${text("예상 시간 (분)", "Suggested minutes")}<input type="number" data-nc-section-field="minutes" min="0" max="240" step="1" value="${esc(section.minutes ?? 0)}" /></label>
        </div>
        <label>${text("단계 제목", "Section title")}<input data-curriculum-authored type="text" data-nc-section-field="title" maxlength="160" value="${esc(section.title || "")}" placeholder="${text("예: 이야기 나누기", "e.g. Let's discuss")}" /></label>
        <label>${text("수업 내용 · 질문 · 활동", "Lesson content, questions, and activities")}<textarea data-curriculum-authored data-nc-section-field="body" maxlength="16000" rows="7" placeholder="${text("질문과 활동을 입력하세요. 줄바꿈이 그대로 표시됩니다.", "Enter questions and activities. Line breaks are preserved.")}">${esc(section.body || "")}</textarea></label>
        <label>${text("선생님 진행 메모 (선택)", "Teacher notes (optional)")}<textarea data-curriculum-authored data-nc-section-field="teacher_notes" maxlength="4000" rows="3" placeholder="${text("진행 방법, 예시 답변, 추가 질문 등", "Instructions, sample answers, and follow-up questions")}">${esc(section.teacher_notes || "")}</textarea></label>
      </fieldset>`;
    }).join("") || `<p class="nc-admin-help">${text("아래 버튼으로 첫 수업 단계를 추가하세요.", "Use the button below to add the first section.")}</p>`;
    const add = state.root.querySelector('[data-nc-action="section-add"]');
    if (add) add.disabled = state.saving || state.draft.sections.length >= 20;
  }

  function renderEditor() {
    if (!state.draft) {
      node("ncAdminEditor").innerHTML = `<div class="empty-state"><h3>${text("수업을 선택하거나 새로 만들어주세요", "Choose a lesson or create one")}</h3><p>${text("기본 수업 구성에서 시작해 필요한 부분만 수정할 수 있습니다.", "Start with a lesson outline and adapt it to your needs.")}</p><button class="button primary" type="button" data-nc-action="new">${text("새 수업 만들기", "New lesson")}</button></div>`;
      return;
    }
    const lesson = state.draft;
    const labels = labelSet();
    node("ncAdminEditor").innerHTML = `
      <div class="nc-editor-heading"><div><h3>${lesson.id ? text("수업 편집", "Edit lesson") : text("새 수업", "New lesson")}</h3><span class="nc-status-badge nc-status-${esc(lesson.status)}">${esc(labels.status[lesson.status])}</span></div><span id="ncAdminDirty" class="nc-dirty-label" aria-live="polite"></span></div>
      <p class="nc-admin-help">${text("한국어 또는 영어로 작성할 수 있습니다. 수업 내용은 자동 번역되지 않으며, 선생님 화면에 입력한 그대로 표시됩니다.", "Write in Korean or English. Lesson content is shown exactly as entered and is not translated automatically.")}</p>
      <div id="ncAdminConflict" class="nc-conflict-message" role="alert" ${state.conflict ? "" : "hidden"}><p>${text("다른 관리자가 먼저 수정했습니다. 입력한 내용은 유지됩니다. 필요한 내용을 복사한 뒤 최신 내용을 불러와주세요.", "Another admin saved changes first. Your edits are kept here. Copy anything you need before loading the latest version.")}</p><button type="button" class="button secondary small" data-nc-action="reload-latest">${text("최신 내용 불러오기", "Load latest version")}</button></div>
      <form id="ncAdminLessonForm" class="nc-lesson-form" novalidate>
        <fieldset id="ncAdminFields" ${state.saving ? "disabled" : ""}>
          <label>${text("수업 제목", "Lesson title")}<input data-curriculum-authored id="ncLessonTitle" type="text" maxlength="160" value="${esc(lesson.title)}" required /></label>
          <div class="nc-form-row"><label>${text("요금제", "Plan")}<select id="ncLessonPlan">${options(labels.plans, lesson.plan)}</select></label><label>${text("수준", "Level")}<select id="ncLessonLevel">${options(labels.levels, lesson.level)}</select></label></div>
          <div class="nc-form-row"><label>${text("주제 · 카테고리", "Topic or category")}<input data-curriculum-authored id="ncLessonTopic" type="text" maxlength="80" value="${esc(lesson.topic)}" placeholder="${text("예: 일상 대화, 비즈니스", "e.g. Daily life, Business")}" /></label><label>${text("수업 시간 (분)", "Lesson duration (minutes)")}<input id="ncLessonDuration" type="number" min="5" max="240" step="1" value="${esc(lesson.duration_minutes)}" /></label></div>
          <div class="nc-form-row"><label>${text("목록 표시 순서", "Display order")}<input id="ncLessonOrder" type="number" min="0" max="9999" step="1" value="${esc(lesson.sort_order)}" /><small>${text("작은 숫자가 먼저 표시됩니다.", "Lower numbers appear first.")}</small></label></div>
          <label>${text("수업 소개", "Lesson summary")}<textarea data-curriculum-authored id="ncLessonSummary" maxlength="600" rows="3">${esc(lesson.summary)}</textarea></label>
          <div class="nc-sections-heading"><h4>${text("수업 구성", "Lesson sections")}</h4><span>${text("최대 20단계", "Up to 20 sections")}</span></div>
          <div id="ncAdminSections" class="nc-section-editors"></div>
          <button class="button secondary" type="button" data-nc-action="section-add">+ ${text("수업 단계 추가", "Add section")}</button>
          <div class="nc-editor-actions">
            <button class="button ghost" type="button" data-nc-action="preview">${text("미리보기", "Preview")}</button>
            <button class="button ghost" type="button" data-nc-action="duplicate">${text("초안으로 복제", "Duplicate as draft")}</button>
            <button id="ncAdminSave" class="button secondary" type="submit">${lesson.status === "published" ? text("수정 저장", "Save changes") : text("초안 저장", "Save draft")}</button>
            <button id="ncAdminPublish" class="button primary" type="button" data-nc-action="${lesson.status === "published" ? "unpublish" : "publish"}">${lesson.status === "published" ? text("비공개 초안으로 전환", "Unpublish to draft") : text("선생님에게 공개", "Publish to teachers")}</button>
          </div>
          <p class="nc-admin-help">${lesson.status === "published" ? text("수정 저장을 누르면 공개 중인 수업에 바로 반영됩니다. 비공개 초안으로 전환하면 선생님 목록에서 숨겨집니다.", "Saving updates the published lesson immediately. Unpublishing hides it from teachers.") : text("초안은 관리자만 볼 수 있습니다. 제목과 수업 내용을 채운 뒤 공개해주세요.", "Only admins can view drafts. Add a title and lesson content before publishing.")}</p>
        </fieldset>
      </form>`;
    renderSections();
    renderDirty();
  }

  function renderDirty() {
    if (node("ncAdminDirty")) node("ncAdminDirty").textContent = state.saving ? text("저장 중…", "Saving…") : state.dirty ? text("저장하지 않은 변경사항", "Unsaved changes") : state.draft?.id ? text("저장됨", "Saved") : text("새 초안", "New draft");
  }

  function numberValue(id) {
    const value = node(id)?.value;
    return value === "" || value === undefined ? null : Number(value);
  }

  function collect() {
    if (!state.draft || !node("ncAdminLessonForm")) return;
    Object.assign(state.draft, {
      title: node("ncLessonTitle").value,
      summary: node("ncLessonSummary").value,
      plan: node("ncLessonPlan").value,
      level: node("ncLessonLevel").value,
      topic: node("ncLessonTopic").value,
      duration_minutes: numberValue("ncLessonDuration"),
      sort_order: numberValue("ncLessonOrder")
    });
    state.root.querySelectorAll("[data-nc-section]").forEach((element) => {
      const section = state.draft.sections[Number(element.dataset.ncSection)];
      element.querySelectorAll("[data-nc-section-field]").forEach((input) => {
        const key = input.dataset.ncSectionField;
        section[key] = key === "minutes" ? (input.value === "" ? null : Number(input.value)) : input.value;
      });
    });
    state.dirty = fingerprint(state.draft) !== state.snapshot;
    renderDirty();
  }

  function canLeave() {
    if (state.saving) return false;
    collect();
    return !state.dirty || window.confirm(text("저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?", "You have unsaved changes. Discard them and continue?"));
  }

  function edit(lesson, forceDirty = false) {
    state.draft = clone(lesson);
    state.draft.sections ||= [];
    state.baseUpdatedAt = lesson.id ? lesson.updated_at : null;
    state.snapshot = fingerprint(state.draft);
    state.dirty = forceDirty;
    if (forceDirty) state.snapshot = "";
    state.conflict = false;
    message("");
    renderList();
    renderEditor();
  }

  async function load() {
    const generation = state.generation;
    message(text("커리큘럼을 불러오는 중입니다…", "Loading lessons…"));
    const [lessonResult, settingsResult] = await Promise.allSettled([
      state.client.from("curriculum_lessons").select(columns).order("sort_order").order("updated_at", { ascending: false }),
      state.client.from("curriculum_settings").select(settingsColumns).eq("id", true).maybeSingle()
    ]);
    if (!currentRequest(generation)) return;
    if (lessonResult.status === "rejected" || lessonResult.value.error) {
      message(text("커리큘럼을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.", "Could not load lessons. Refresh and try again."), true);
    } else {
      state.items = lessonResult.value.data || [];
      renderList();
      message("");
    }
    if (settingsResult.status === "fulfilled" && !settingsResult.value.error && settingsResult.value.data) state.settings = settingsResult.value.data;
    renderSettings();
  }

  async function save(nextStatus) {
    if (!state.active || !state.draft || state.saving) return;
    const generation = state.generation;
    collect();
    const payload = payloadFor(state.draft);
    payload.title = payload.title.trim();
    payload.topic = payload.topic.trim();
    if (nextStatus) payload.status = nextStatus;
    const errors = shared().validateLesson(payload, { publishing: payload.status === "published" });
    if (errors.length) { message(errors.join(" "), true); node("ncAdminMessage").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
    if (nextStatus === "draft" && state.draft.status === "published" && !window.confirm(text("이 수업을 비공개 초안으로 전환할까요? 저장된 수업은 유지되며 선생님 목록에서 숨겨집니다.", "Unpublish this lesson? It will remain saved as a draft and be hidden from teachers."))) return;
    state.saving = true;
    node("ncAdminFields").disabled = true;
    renderDirty();
    message("");
    try {
      let request;
      if (state.draft.id) {
        if (!state.baseUpdatedAt) throw new Error("Missing revision timestamp");
        request = state.client.from("curriculum_lessons").update(payload).eq("id", state.draft.id).eq("updated_at", state.baseUpdatedAt).select(columns).maybeSingle();
      } else request = state.client.from("curriculum_lessons").insert(payload).select(columns).single();
      const { data, error } = await request;
      if (!currentRequest(generation)) return;
      if (error) throw error;
      if (!data) {
        state.conflict = true;
        node("ncAdminConflict").hidden = false;
        message(text("다른 관리자의 변경사항을 덮어쓰지 않도록 저장을 중단했습니다. 입력한 내용은 유지됩니다.", "Save stopped to protect another admin's changes. Your edits are kept."), true);
        return;
      }
      if (!data.id || !data.updated_at) throw new Error("Saved lesson could not be confirmed");
      state.items = state.items.filter((item) => item.id !== data.id).concat(data);
      edit(data);
      message(payload.status === "published" ? text("수업을 저장했습니다. 선생님 화면에 공개됩니다.", "Lesson saved and published to teachers.") : text("초안을 저장했습니다. 관리자만 볼 수 있습니다.", "Draft saved. Only admins can view it."));
    } catch (error) {
      if (!currentRequest(generation)) return;
      console.warn("Curriculum save failed:", error);
      message(text("저장하지 못했습니다. 입력한 내용은 유지됩니다. 잠시 후 다시 시도해주세요.", "Could not save. Your edits are kept; please try again."), true);
    } finally {
      if (!currentRequest(generation)) return;
      state.saving = false;
      if (node("ncAdminFields")) node("ncAdminFields").disabled = false;
      const add = state.root.querySelector('[data-nc-action="section-add"]');
      if (add) add.disabled = state.draft.sections.length >= 20;
      renderDirty();
    }
  }

  function renderSettings() {
    const available = Boolean(state.settings);
    node("ncAdminSettings").innerHTML = `<div><h3>${text("기존 외부 자료 링크", "Existing external resource links")}</h3><p>${text("자료 이전이 끝난 뒤 Google Drive 등 외부 링크를 숨길 수 있습니다. 업로드한 회원 전용 파일은 계속 표시됩니다.", "After migration, you can hide external links such as Google Drive. Uploaded member-only files remain visible.")}</p></div><label class="nc-setting-toggle"><input id="ncLegacyLinksEnabled" type="checkbox" ${state.settings?.legacy_links_enabled !== false ? "checked" : ""} ${!available || state.settingsSaving ? "disabled" : ""} /><span>${text("선생님 화면에 기존 외부 링크 표시", "Show existing external links to teachers")}</span></label>${!available ? `<p class="nc-admin-help">${text("표시 설정을 불러오지 못했습니다. 기존 링크는 그대로 유지됩니다.", "Could not load visibility settings. Existing links are unchanged.")}</p>` : ""}`;
  }

  async function changeLegacyVisibility(enabled) {
    if (!state.active || !state.settings || state.settingsSaving) return;
    const generation = state.generation;
    if (!enabled && !window.confirm(text("선생님 화면에서 기존 외부 링크를 숨길까요? 링크와 업로드한 회원 전용 파일은 삭제되지 않습니다.", "Hide existing external links from teachers? Links and uploaded member-only files will not be deleted."))) { renderSettings(); return; }
    state.settingsSaving = true;
    renderSettings();
    try {
      const { data, error } = await state.client.from("curriculum_settings").update({ legacy_links_enabled: enabled }).eq("id", true).eq("updated_at", state.settings.updated_at).select(settingsColumns).maybeSingle();
      if (!currentRequest(generation)) return;
      if (error) throw error;
      if (!data) {
        const latest = await state.client.from("curriculum_settings").select(settingsColumns).eq("id", true).maybeSingle();
        if (!currentRequest(generation)) return;
        if (!latest.error && latest.data) state.settings = latest.data;
        message(text("다른 관리자가 표시 설정을 변경했습니다. 최신 설정을 확인한 뒤 다시 선택해주세요.", "Another admin changed visibility settings. Review the latest setting and try again."), true);
        return;
      }
      state.settings = data;
      message(enabled ? text("기존 외부 링크가 표시됩니다.", "Existing external links are visible.") : text("기존 외부 링크를 숨겼습니다. 회원 전용 파일은 계속 표시됩니다.", "Existing external links are hidden. Member-only files remain visible."));
    } catch (error) {
      if (!currentRequest(generation)) return;
      console.warn("Curriculum visibility update failed:", error);
      message(text("표시 설정을 저장하지 못했습니다. 기존 설정이 유지됩니다.", "Could not save visibility settings. The previous setting is unchanged."), true);
    } finally { if (currentRequest(generation)) { state.settingsSaving = false; renderSettings(); } }
  }

  async function reloadLatest() {
    if (!state.active || !state.draft?.id || !canLeave()) return;
    const generation = state.generation;
    const id = state.draft.id;
    try {
      const { data, error } = await state.client.from("curriculum_lessons").select(columns).eq("id", id).single();
      if (!currentRequest(generation)) return;
      if (error || !data) throw error || new Error("Missing lesson");
      state.items = state.items.filter((item) => item.id !== data.id).concat(data);
      edit(data);
      message(text("최신 내용을 불러왔습니다.", "Latest version loaded."));
    } catch (error) {
      if (!currentRequest(generation)) return;
      message(text("최신 내용을 불러오지 못했습니다. 현재 입력은 유지됩니다.", "Could not load the latest version. Your current edits are kept."), true);
    }
  }

  function preview() {
    collect();
    if (!state.draft) return;
    node("ncAdminPreviewBody").innerHTML = shared().renderLesson(state.draft, { preview: true, viewerName: state.user?.email || "" });
    node("ncAdminPreview").showModal();
  }

  function updateSections(action, index) {
    collect();
    const sections = state.draft.sections;
    if (action === "section-add") {
      if (sections.length >= 20) return;
      sections.push({ id: uid(), type: "custom", title: "", body: "", minutes: 0, teacher_notes: "" });
    } else if (!Number.isInteger(index) || index < 0 || index >= sections.length) return;
    else if (action === "section-remove") {
      const current = sections[index];
      if ((current.title || current.body || current.teacher_notes) && !window.confirm(text("이 수업 단계를 삭제할까요? 저장 전까지 원본 수업에는 반영되지 않습니다.", "Remove this section? The saved lesson will not change until you save."))) return;
      sections.splice(index, 1);
    } else {
      const next = index + (action === "section-up" ? -1 : 1);
      if (next < 0 || next >= sections.length) return;
      [sections[index], sections[next]] = [sections[next], sections[index]];
    }
    state.dirty = fingerprint(state.draft) !== state.snapshot;
    renderSections();
    renderDirty();
  }

  function handleClick(event) {
    if (!state.active) return;
    const open = event.target.closest("[data-nc-open]");
    if (open) {
      if (state.draft?.id === open.dataset.ncOpen || !canLeave()) return;
      const lesson = state.items.find((item) => item.id === open.dataset.ncOpen);
      if (lesson) edit(lesson);
      return;
    }
    const button = event.target.closest("[data-nc-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.ncAction;
    if (action === "close-preview") { node("ncAdminPreview").close(); return; }
    if (state.saving) return;
    if (action === "new") { if (canLeave()) edit(shared().createTemplate()); return; }
    if (action === "reload-latest") { void reloadLatest(); return; }
    if (!state.draft) return;
    if (action === "preview") preview();
    else if (action === "publish") void save("published");
    else if (action === "unpublish") void save("draft");
    else if (action === "duplicate") {
      collect();
      const copied = payloadFor(state.draft);
      copied.title = Array.from(`${copied.title || text("새 수업", "New lesson")} ${text("(복사)", "(copy)")}`).slice(0, 160).join("");
      copied.status = "draft";
      edit(copied, true);
      message(text("초안으로 복제했습니다. 저장을 누르면 새 수업으로 등록됩니다.", "Copied as a draft. Save to create the new lesson."));
    } else if (action.startsWith("section-")) updateSections(action, Number(button.dataset.ncIndex));
  }

  function clear() {
    state.generation += 1;
    state.active = false;
    state.items = [];
    state.settings = null;
    state.draft = null;
    state.user = null;
    state.baseUpdatedAt = null;
    state.snapshot = "";
    state.dirty = false;
    state.saving = false;
    state.settingsSaving = false;
    state.conflict = false;
    state.query = "";
    const dialog = node("ncAdminPreview");
    if (dialog?.open) dialog.close();
    if (state.root) state.root.innerHTML = `<p class="panel empty-state">${text("로그인이 종료되었습니다. 다시 로그인해주세요.", "You have signed out. Please sign in again.")}</p>`;
  }

  async function init({ supabase, user }) {
    if (state.initialized || !document.getElementById(mountId) || !shared()) return;
    state.initialized = true;
    state.active = true;
    state.generation += 1;
    state.client = supabase;
    state.user = user;
    state.root = document.getElementById(mountId);
    state.client.auth?.onAuthStateChange?.((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== state.user?.id)) clear();
    });
    shell();
    state.root.addEventListener("click", handleClick);
    state.root.addEventListener("submit", (event) => {
      if (event.target.id !== "ncAdminLessonForm") return;
      event.preventDefault();
      void save();
    });
    state.root.addEventListener("input", (event) => {
      if (event.target.id === "ncAdminSearch") { state.query = event.target.value; renderList(); }
      else if (event.target.closest("#ncAdminLessonForm")) collect();
    });
    state.root.addEventListener("change", (event) => {
      if (event.target.id === "ncAdminStatusFilter") { state.statusFilter = event.target.value; renderList(); }
      else if (event.target.id === "ncLegacyLinksEnabled") void changeLegacyVisibility(event.target.checked);
      else if (event.target.closest("#ncAdminLessonForm")) collect();
    });
    state.root.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && state.draft) { event.preventDefault(); void save(); }
    });
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty && !state.saving && !state.settingsSaving) return;
      event.preventDefault();
      event.returnValue = "";
    });
    document.addEventListener("nado:languagechange", () => { if (state.active) { collect(); shell(); } });
    try { await load(); }
    catch (error) {
      if (state.active) message(text("커리큘럼을 불러오지 못했습니다. 다른 관리자 기능은 계속 이용할 수 있습니다.", "Could not load the curriculum. Other admin features remain available."), true);
    }
  }

  window.NADO_CURRICULUM_ADMIN = { init, clear };
})();
