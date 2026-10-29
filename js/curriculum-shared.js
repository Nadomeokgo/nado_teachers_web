(() => {
  "use strict";

  const english = () => window.NADO_I18N?.getLanguage?.() === "en";
  const tr = (ko, en) => english() ? en : ko;
  const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const uid = () => window.crypto?.randomUUID?.() || `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function labels() {
    return {
      plans: { all: tr("모든 플랜", "All plans"), economy: "Economy", standard: "Standard", premium: "Premium" },
      levels: { all: tr("모든 수준", "All levels"), beginner: tr("초급", "Beginner"), intermediate: tr("중급", "Intermediate"), advanced: tr("고급", "Advanced") },
      status: { draft: tr("초안", "Draft"), published: tr("게시 중", "Published") }
    };
  }

  function metadata(lesson) {
    const text = labels();
    return [text.plans[lesson.plan] || lesson.plan, text.levels[lesson.level] || lesson.level, lesson.topic,
      lesson.duration_minutes ? tr(`${lesson.duration_minutes}분`, `${lesson.duration_minutes} min`) : ""].filter(Boolean);
  }

  function createTemplate() {
    return {
      title: "", summary: "", plan: "all", level: "all", topic: "", duration_minutes: 60,
      status: "draft", sort_order: 0,
      sections: [
        ["warmup", "Warm-up", 5], ["goal", "Today's goal & useful expressions", 10],
        ["practice", "Guided practice", 20], ["discussion", "Conversation & follow-up questions", 15],
        ["wrapup", "Feedback & next steps", 10]
      ].map(([type, title, minutes]) => ({ id: uid(), type, title, minutes, body: "", teacher_notes: "" }))
    };
  }

  function validateLesson(lesson, { publishing = lesson?.status === "published" } = {}) {
    const errors = [];
    const stringWithin = (value, max) => typeof value === "string" && [...value].length <= max;
    if (!stringWithin(lesson.title, 160) || !lesson.title.trim()) errors.push(tr("제목을 160자 이내로 입력해주세요.", "Enter a title of up to 160 characters."));
    if (!stringWithin(lesson.summary ?? "", 600)) errors.push(tr("소개는 600자 이내로 입력해주세요.", "Keep the summary within 600 characters."));
    if (!stringWithin(lesson.topic ?? "", 80)) errors.push(tr("주제는 80자 이내로 입력해주세요.", "Keep the topic within 80 characters."));
    const text = labels();
    if (!Object.hasOwn(text.plans, lesson.plan) || !Object.hasOwn(text.levels, lesson.level)) errors.push(tr("플랜과 수준을 선택해주세요.", "Choose a plan and level."));
    if (!Number.isInteger(lesson.duration_minutes) || lesson.duration_minutes < 5 || lesson.duration_minutes > 240) errors.push(tr("수업 시간은 5~240분으로 입력해주세요.", "Enter a lesson duration between 5 and 240 minutes."));
    if (!Number.isInteger(lesson.sort_order) || lesson.sort_order < 0 || lesson.sort_order > 9999) errors.push(tr("표시 순서는 0~9999로 입력해주세요.", "Enter a display order between 0 and 9999."));
    if (!Object.hasOwn(text.status, lesson.status)) errors.push(tr("게시 상태를 확인해주세요.", "Check the publication status."));
    if (!Array.isArray(lesson.sections) || lesson.sections.length > 20) {
      errors.push(tr("수업 단계는 최대 20개까지 추가할 수 있습니다.", "A lesson can contain up to 20 sections."));
      return errors;
    }
    const ids = new Set();
    lesson.sections.forEach((section, index) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        errors.push(tr(`${index + 1}번째 단계의 내용을 확인해주세요.`, `Check section ${index + 1}.`)); return;
      }
      if (!stringWithin(section.id, 100) || !section.id.trim() || ids.has(section.id)
        || !stringWithin(section.type, 40) || !section.type.trim()
        || !stringWithin(section.title ?? "", 160) || !stringWithin(section.body ?? "", 16000)
        || !stringWithin(section.teacher_notes ?? "", 4000)
        || !Number.isInteger(section.minutes ?? 0) || (section.minutes ?? 0) < 0 || (section.minutes ?? 0) > 240) {
        errors.push(tr(`${index + 1}번째 단계의 제목·내용·시간을 확인해주세요.`, `Check the title, content, and timing of section ${index + 1}.`));
      }
      ids.add(section.id);
    });
    if (publishing && !lesson.sections.some((section) => typeof section?.body === "string" && section.body.trim())) {
      errors.push(tr("게시하려면 적어도 한 단계의 수업 내용을 입력해주세요.", "Add content to at least one section before publishing."));
    }
    if (publishing && lesson.sections.some((section) => !String(section?.title || "").trim())) {
      errors.push(tr("게시할 수업 단계에는 제목이 필요합니다.", "Every published section needs a title."));
    }
    return errors;
  }

  function renderLesson(lesson, { viewerName = "", preview = false } = {}) {
    const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
    const timing = sections.reduce((total, section) => total + (Number(section.minutes) || 0), 0);
    const badges = metadata(lesson).map((value) => `<span class="nc-badge">${escapeHtml(value)}</span>`).join("");
    const sectionHtml = sections.map((section, index) => `
      <section class="nc-lesson-section" aria-labelledby="nc-section-${index}">
        <div class="nc-section-heading"><span class="nc-section-number">${String(index + 1).padStart(2, "0")}</span><h3 id="nc-section-${index}" data-curriculum-authored>${escapeHtml(section.title || tr("제목 없는 단계", "Untitled section"))}</h3>${section.minutes ? `<span class="nc-section-time">${escapeHtml(tr(`${section.minutes}분`, `${section.minutes} min`))}</span>` : ""}</div>
        ${section.body ? `<div class="nc-lesson-body" data-curriculum-authored>${escapeHtml(section.body)}</div>` : `<p class="nc-muted">${tr("이 단계의 내용을 입력해주세요.", "Add content to this section.")}</p>`}
        ${section.teacher_notes ? `<aside class="nc-teacher-note"><strong>${tr("선생님 진행 메모", "Teaching notes")}</strong><div class="nc-lesson-body" data-curriculum-authored>${escapeHtml(section.teacher_notes)}</div></aside>` : ""}
      </section>`).join("");
    return `<article class="nc-lesson">
      <header class="nc-lesson-header">
        <div class="nc-lesson-eyebrow">NADO CURRICULUM${preview ? ` · ${tr("미리보기", "PREVIEW")}` : ""}</div>
        <h2 data-curriculum-authored>${escapeHtml(lesson.title || tr("새 커리큘럼", "New curriculum"))}</h2>
        ${lesson.summary ? `<p class="nc-lesson-summary" data-curriculum-authored>${escapeHtml(lesson.summary)}</p>` : ""}
        <div class="nc-meta" data-curriculum-authored>${badges}</div>
        ${timing ? `<p class="nc-timing">${tr(`단계별 예상 시간 합계 ${timing}분 · 학생의 속도에 맞춰 조정하세요.`, `Section timings total ${timing} min. Adjust to the student's pace.`)}</p>` : ""}
      </header>
      <div class="nc-watermark">${escapeHtml(tr("NADO Teachers 내부 수업용", "For NADO Teachers lessons only"))}${viewerName ? ` · <span data-curriculum-authored>${escapeHtml(viewerName)}</span>` : ""}</div>
      ${sectionHtml || `<div class="nc-empty">${tr("수업 단계를 추가하면 이곳에 표시됩니다.", "Add sections to see your lesson here.")}</div>`}
      <footer class="nc-lesson-footer">${tr("수업 준비와 진행을 위한 자료입니다. 외부에 공유하지 말아주세요.", "These materials are for lesson preparation and teaching. Please do not share them externally.")}</footer>
    </article>`;
  }

  window.NADO_CURRICULUM_SHARED = { escapeHtml, labels, metadata, createTemplate, validateLesson, renderLesson };
})();
