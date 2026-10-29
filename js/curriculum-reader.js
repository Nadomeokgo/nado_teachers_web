(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const shared = () => window.NADO_CURRICULUM_SHARED;
  const en = () => window.NADO_I18N?.getLanguage?.() === "en";
  const tr = (ko, english) => en() ? english : ko;
  const esc = (value) => shared().escapeHtml(String(value ?? ""));
  const META_COLUMNS = "id,title,summary,plan,level,topic,duration_minutes,status,sort_order,updated_at";
  const state = {
    client: null, user: null, profile: null, generation: 0, detailRequest: 0,
    lessons: [], resources: [], activeId: null, activeLesson: null,
    legacyLinks: false, errors: {}, filters: { search: "", plan: "", level: "", topic: "" }
  };
  let bound = false;

  function stillCurrent(generation, userId) {
    return state.generation === generation && state.user?.id === userId;
  }

  function clear() {
    state.generation++;
    state.detailRequest++;
    state.client = state.user = state.profile = state.activeLesson = state.activeId = null;
    state.lessons = []; state.resources = []; state.errors = {}; state.legacyLinks = false;
    state.filters = { search: "", plan: "", level: "", topic: "" };
    ["curriculumCatalog", "curriculumReader", "resourceGrid"].forEach((id) => { if ($(id)) $(id).replaceChildren(); });
    $("curriculumCatalog")?.classList.remove("hidden");
    $("curriculumReader")?.classList.add("hidden");
    if ($("curriculumLegacySection")) $("curriculumLegacySection").hidden = true;
  }

  function showCatalog() {
    state.detailRequest++;
    state.activeId = null;
    state.activeLesson = null;
    $("curriculumReader")?.replaceChildren();
    $("curriculumReader")?.classList.add("hidden");
    $("curriculumCatalog")?.classList.remove("hidden");
    renderLegacy();
  }

  function setReader(html) {
    const reader = $("curriculumReader");
    if (!reader) return;
    reader.innerHTML = `<div class="nc-reader-toolbar"><button class="nc-reader-back button ghost" type="button" data-nc-action="back">${tr("← 자료 목록", "← All lessons")}</button><span class="nc-private-label">${tr("로그인한 선생님 전용", "For signed-in teachers")}</span></div>${html}`;
    reader.classList.remove("hidden");
    $("curriculumCatalog")?.classList.add("hidden");
    if ($("curriculumLegacySection")) $("curriculumLegacySection").hidden = true;
  }

  function renderReader() {
    if (!state.activeLesson) return;
    const viewerName = state.profile?.full_name || state.user?.email || tr("선생님", "Teacher");
    setReader(shared().renderLesson(state.activeLesson, { viewerName, preview: false }));
  }

  async function openLesson(id) {
    if (!state.user || !state.client || !state.lessons.some((lesson) => String(lesson.id) === String(id))) return;
    const generation = state.generation, userId = state.user.id, request = ++state.detailRequest;
    state.activeId = id;
    state.activeLesson = null;
    setReader(`<div class="nc-message" role="status">${tr("수업 자료를 불러오는 중입니다…", "Loading lesson…")}</div>`);
    try {
      const { data, error } = await state.client.from("curriculum_lessons")
        .select(`${META_COLUMNS},sections`).eq("id", id).eq("status", "published").maybeSingle();
      if (!stillCurrent(generation, userId) || request !== state.detailRequest) return;
      if (error || !data || data.status !== "published") {
        setReader(`<div class="nc-empty nc-error" role="status"><h3>${tr("자료를 열 수 없습니다", "This lesson is unavailable")}</h3><p>${tr("게시 상태가 바뀌었거나 연결에 문제가 있을 수 있습니다. 목록으로 돌아가 다시 확인해주세요.", "Its publication status may have changed, or the connection may be unavailable. Return to the list and try again.")}</p></div>`);
        return;
      }
      state.activeLesson = data;
      renderReader();
      $("curriculumReader")?.scrollIntoView({ block: "start", behavior: "smooth" });
      $("curriculumReader")?.querySelector("[data-nc-action='back']")?.focus({ preventScroll: true });
    } catch (error) {
      if (!stillCurrent(generation, userId) || request !== state.detailRequest) return;
      setReader(`<div class="nc-empty nc-error" role="status"><p>${tr("자료를 불러오지 못했습니다. 목록으로 돌아가 다시 시도해주세요.", "Could not load this lesson. Return to the list and try again.")}</p></div>`);
    }
  }

  function options(values, selected, allLabel) {
    return `<option value="">${esc(allLabel)}</option>` + Object.entries(values)
      .map(([value, label]) => `<option value="${esc(value)}"${selected === value ? " selected" : ""}>${esc(label)}</option>`).join("");
  }

  function renderCatalog() {
    const catalog = $("curriculumCatalog");
    if (!catalog) return;
    const labels = shared().labels();
    const plans = { ...labels.plans, all: tr("모든 플랜 공통", "Shared across plans") };
    const levels = { ...labels.levels, all: tr("수준 공통", "Any-level lessons") };
    const topics = [...new Set(state.lessons.map((lesson) => String(lesson.topic || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (state.filters.topic && !topics.includes(state.filters.topic)) state.filters.topic = "";
    catalog.innerHTML = `<div class="nc-catalog-heading"><div><h3>${tr("수업별 커리큘럼", "Lesson library")}</h3><p>${tr("수준과 수업 목표에 맞는 자료를 찾아 이 화면에서 바로 확인하세요.", "Find lessons for your student's level and goals, then read them here.")}</p></div></div>
      <div class="nc-filters" role="search" aria-label="${tr("커리큘럼 검색", "Search lessons")}">
        <label class="nc-search-field"><span>${tr("검색", "Search")}</span><input id="curriculumSearch" type="search" maxlength="200" autocomplete="off" placeholder="${tr("제목, 주제, 설명 검색", "Search titles, topics, descriptions")}" value="${esc(state.filters.search)}" /></label>
        <label class="nc-filter-field"><span>${tr("플랜", "Plan")}</span><select id="curriculumPlanFilter">${options(plans, state.filters.plan, tr("전체 플랜", "All plans"))}</select></label>
        <label class="nc-filter-field"><span>${tr("수준", "Level")}</span><select id="curriculumLevelFilter">${options(levels, state.filters.level, tr("전체 수준", "All levels"))}</select></label>
        <label class="nc-filter-field"><span>${tr("주제", "Topic")}</span><select id="curriculumTopicFilter" data-curriculum-authored>${options(Object.fromEntries(topics.map((topic) => [topic, topic])), state.filters.topic, tr("전체 주제", "All topics"))}</select></label>
      </div>
      <div id="curriculumCatalogNotice"></div><p id="curriculumResultCount" class="nc-result-count" role="status" aria-live="polite"></p><div id="curriculumLessonGrid" class="nc-catalog-grid"></div>`;
    renderResults();
  }

  function renderResults() {
    const grid = $("curriculumLessonGrid"), counter = $("curriculumResultCount"), notice = $("curriculumCatalogNotice");
    if (!grid || !counter || !notice) return;
    notice.innerHTML = state.errors.settings
      ? `<p class="nc-message nc-warning" role="status">${tr("기존 공유 자료의 표시 설정을 확인하지 못해 외부 링크는 잠시 표시하지 않습니다.", "External links are temporarily hidden because their visibility setting could not be loaded.")}</p>` : "";
    if (state.errors.catalog) {
      counter.textContent = "";
      grid.innerHTML = `<div class="nc-empty nc-error" role="status"><h3>${tr("커리큘럼을 불러오지 못했습니다", "Could not load the lesson library")}</h3><p>${tr("잠시 후 다시 시도해주세요. 기존 자료가 있으면 아래에서 이용할 수 있습니다.", "Please try again. Existing resources remain available below when permitted.")}</p><button class="button ghost" data-nc-action="reload" type="button">${tr("다시 불러오기", "Try again")}</button></div>`;
      return;
    }
    const search = state.filters.search.trim().normalize("NFKC").toLocaleLowerCase();
    const lessons = state.lessons.filter((lesson) => {
      if (state.filters.plan && lesson.plan !== "all" && lesson.plan !== state.filters.plan) return false;
      if (state.filters.level && lesson.level !== "all" && lesson.level !== state.filters.level) return false;
      if (state.filters.topic && lesson.topic !== state.filters.topic) return false;
      return !search || [lesson.title, lesson.summary, lesson.topic].some((value) => String(value || "").normalize("NFKC").toLocaleLowerCase().includes(search));
    });
    counter.textContent = tr(`${lessons.length}개 수업 자료`, `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`);
    if (!lessons.length) {
      grid.innerHTML = `<div class="nc-empty"><h3>${state.lessons.length ? tr("조건에 맞는 자료가 없습니다", "No lessons match these filters") : tr("아직 게시된 커리큘럼이 없습니다", "No lessons have been published yet")}</h3><p>${state.lessons.length ? tr("검색어나 필터를 바꿔보세요.", "Try a different search or filter.") : tr("운영팀에서 게시한 수업 자료가 이곳에 표시됩니다.", "Lessons will appear here when the team publishes them.")}</p>${state.lessons.length ? `<button class="button ghost" data-nc-action="reset" type="button">${tr("필터 초기화", "Reset filters")}</button>` : ""}</div>`;
      return;
    }
    grid.innerHTML = lessons.map((lesson) => `<article class="nc-catalog-card">
      <div class="nc-card-meta" data-curriculum-authored>${shared().metadata(lesson).map((label) => `<span class="nc-meta-tag">${esc(label)}</span>`).join("")}</div>
      <h4 data-curriculum-authored>${esc(lesson.title)}</h4><p class="nc-card-summary" data-curriculum-authored>${esc(lesson.summary || "")}</p>
      <button class="nc-open-lesson button primary" data-nc-lesson="${esc(lesson.id)}" type="button">${tr("수업 자료 열기", "Open lesson")} <span aria-hidden="true">→</span></button>
    </article>`).join("");
  }

  function safeExternalUrl(value) {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
  }

  function localizedResource(item, field) {
    return en() && String(item[`${field}_en`] || "").trim() ? item[`${field}_en`] : item[field] || "";
  }

  function renderLegacy() {
    const wrapper = $("curriculumLegacySection"), grid = $("resourceGrid");
    if (!wrapper || !grid) return;
    const visible = state.resources.filter((item) => item.storage_path || (state.legacyLinks && safeExternalUrl(item.file_url)));
    wrapper.hidden = Boolean(state.activeId) || !visible.length;
    grid.innerHTML = visible.map((item) => `<article class="resource-card">
      <div class="resource-icon">${item.category === "PDF" ? "PDF" : "DOC"}</div><span class="resource-type">${esc(item.category || "RESOURCE")}</span>
      <h3>${esc(localizedResource(item, "title"))}</h3><p>${esc(localizedResource(item, "description"))}</p>
      ${item.storage_path
        ? `<button class="resource-open-button" data-nc-storage="${esc(item.storage_path)}" type="button">${tr("회원 자료 열기 →", "Open member resource →")}</button>`
        : `<a href="${esc(safeExternalUrl(item.file_url))}" target="_blank" rel="noopener noreferrer">${tr("기존 공유 자료 열기 →", "Open shared resource →")}</a>`}
    </article>`).join("");
  }

  async function openStorage(button) {
    if (!state.user || !state.client) return;
    const generation = state.generation, userId = state.user.id;
    button.disabled = true;
    try {
      const { data, error } = await state.client.storage.from("member-resources").createSignedUrl(button.dataset.ncStorage, 60);
      if (!stillCurrent(generation, userId)) return;
      if (error || !safeExternalUrl(data?.signedUrl)) throw error || new Error("Missing signed URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (!stillCurrent(generation, userId)) return;
      button.textContent = tr("열지 못했습니다. 다시 시도 →", "Could not open. Try again →");
    } finally {
      if (stillCurrent(generation, userId)) button.disabled = false;
    }
  }

  function bindEvents() {
    if (bound) return;
    const page = $("page-curriculum");
    if (!page) return;
    bound = true;
    page.addEventListener("click", (event) => {
      const lesson = event.target.closest("[data-nc-lesson]");
      if (lesson) { openLesson(lesson.dataset.ncLesson); return; }
      const storage = event.target.closest("[data-nc-storage]");
      if (storage) { openStorage(storage); return; }
      const action = event.target.closest("[data-nc-action]")?.dataset.ncAction;
      if (action === "back") { showCatalog(); $("curriculumSearch")?.focus({ preventScroll: true }); }
      if (action === "reset") { state.filters = { search: "", plan: "", level: "", topic: "" }; renderCatalog(); }
      if (action === "reload") load({ client: state.client, user: state.user, profile: state.profile });
    });
    page.addEventListener("input", (event) => {
      if (event.target.id === "curriculumSearch") { state.filters.search = event.target.value; renderResults(); }
    });
    page.addEventListener("change", (event) => {
      const key = { curriculumPlanFilter: "plan", curriculumLevelFilter: "level", curriculumTopicFilter: "topic" }[event.target.id];
      if (key) { state.filters[key] = event.target.value; renderResults(); }
    });
  }

  async function load({ client, user, profile }) {
    if (!client || !user?.id) { clear(); return; }
    if (state.user?.id !== user.id) clear();
    state.client = client; state.user = user; state.profile = profile;
    const generation = ++state.generation, userId = user.id;
    state.detailRequest++;
    bindEvents();
    if (!shared()) {
      clear();
      if ($("curriculumCatalog")) $("curriculumCatalog").textContent = tr("자료 화면을 불러오지 못했습니다. 새로고침해주세요.", "Could not initialize the lesson library. Please refresh.");
      return;
    }
    if (!state.lessons.length && !state.activeId && $("curriculumCatalog")) $("curriculumCatalog").innerHTML = `<div class="nc-message" role="status">${tr("커리큘럼을 불러오는 중입니다…", "Loading lesson library…")}</div>`;
    const results = await Promise.allSettled([
      client.from("curriculum_lessons").select(META_COLUMNS).eq("status", "published").order("sort_order").order("title"),
      client.from("curriculum_settings").select("legacy_links_enabled").eq("id", true).maybeSingle(),
      client.from("resources").select("title,description,title_en,description_en,category,file_url,storage_path,sort_order").eq("is_active", true).order("sort_order")
    ]);
    if (!stillCurrent(generation, userId)) return;
    const result = (index) => results[index].status === "fulfilled" ? results[index].value : { data: null, error: results[index].reason };
    const lessons = result(0), settings = result(1), resources = result(2);
    state.errors = { catalog: Boolean(lessons.error), settings: Boolean(settings.error || !settings.data), resources: Boolean(resources.error) };
    state.lessons = lessons.error ? [] : (lessons.data || []).filter((lesson) => lesson.status === "published");
    state.legacyLinks = !state.errors.settings && settings.data.legacy_links_enabled === true;
    state.resources = resources.error ? [] : resources.data || [];
    if (state.activeId && !state.lessons.some((lesson) => String(lesson.id) === String(state.activeId))) showCatalog();
    renderCatalog();
    renderLegacy();
    // Reload an open lesson as well as its catalog entry: publication checks and
    // teacher-visible edits must take effect on refresh or language changes.
    if (state.activeId) await openLesson(state.activeId);
  }

  window.NADO_CURRICULUM = { load, clear };
})();
