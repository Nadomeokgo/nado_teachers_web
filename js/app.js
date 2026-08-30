(() => {
  "use strict";

  const config = window.NADO_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const supabase = configured ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const PROFILE_PHOTO_BUCKET = "profile-photos";
  const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const PROFILE_PHOTO_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const PROFILE_PHOTO_SIGNED_URL_SECONDS = 60 * 60;
  const CURRENT_AGREEMENT_VERSION = "v1.4";
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const scheduleDayOrder = [1, 2, 3, 4, 5, 6, 0];
  const scheduleStartMinutes = 8 * 60;
  const scheduleEndMinutes = 24 * 60;
  const scheduleStepMinutes = 30;
  const pageMeta = {
    dashboard: ["TEACHER HOME", "홈"], history: ["STUDENT HISTORY", "학생 기록"],
    schedule: ["WEEKLY AVAILABILITY", "스케줄 제출"], guide: ["FIRST LESSON GUIDE", "첫 수업 가이드"],
    curriculum: ["CURRICULUM", "커리큘럼"], training: ["TRAINING VIDEOS", "교육 영상"],
    payguide: ["YOUR PAY", "수수료 안내"], profile: ["MY PROFILE", "내 정보"]
  };
  const planLabels = {
    economy: "이코노미",
    standard: "스탠다드",
    premium: "프리미엄"
  };
  const pricingCatalog = window.NADO_PRICING || {};
  const PACKAGE_SESSIONS = pricingCatalog.PACKAGE_SESSIONS || 4;

  function currentLanguage() {
    return window.NADO_I18N?.getLanguage?.() || "ko";
  }

  function currentLocale() {
    return currentLanguage() === "en" ? "en-US" : "ko-KR";
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

  function formatHourlyWon(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "-";
    return currentLanguage() === "en"
      ? `₩${Math.round(amount).toLocaleString("en-US")}/hr`
      : `${Math.round(amount).toLocaleString("ko-KR")}원/시간`;
  }

  function payGuidePlanLabel(plan) {
    if (currentLanguage() === "en") {
      return ({ economy: "Economy", standard: "Standard", premium: "Premium" })[plan] || plan;
    }
    return planLabels[plan] || plan;
  }

  function payGuidePackageSessions(weeklyFrequency) {
    if (typeof pricingCatalog.packageSessionCount === "function") return pricingCatalog.packageSessionCount(weeklyFrequency);
    return PACKAGE_SESSIONS * (Number(weeklyFrequency) === 2 ? 2 : 1);
  }

  function payGuideBasePricing(plan, durationMinutes) {
    if (typeof pricingCatalog.basePricing === "function") return pricingCatalog.basePricing(plan, durationMinutes);
    const tuition = pricingCatalog.lessonPriceTable?.[plan]?.[Number(durationMinutes)];
    if (!tuition) return null;
    const nadoFee = Math.round(tuition * 0.35);
    return { tuition, nadoFee, teacherPayout: tuition - nadoFee };
  }

  function payGuidePayout(plan, durationMinutes, sessions) {
    if (typeof pricingCatalog.teacherPayoutForSessions === "function") {
      return pricingCatalog.teacherPayoutForSessions(plan, durationMinutes, sessions);
    }
    const base = payGuideBasePricing(plan, durationMinutes);
    return base ? Math.round((base.teacherPayout * Number(sessions)) / PACKAGE_SESSIONS) : null;
  }

  function payGuideHourlyRates(plan, durationMinutes) {
    if (typeof pricingCatalog.hourlyRates === "function") return pricingCatalog.hourlyRates(plan, durationMinutes);
    const base = payGuideBasePricing(plan, durationMinutes);
    const duration = Number(durationMinutes);
    if (!base || !duration) return null;
    const hours = duration / 60;
    return {
      firstMonth: Math.round((base.teacherPayout / PACKAGE_SESSIONS) / hours),
      monthTwo: Math.round((base.tuition / PACKAGE_SESSIONS) / hours)
    };
  }

  function syncPayGuideDurationOptions(preferredValue = 60) {
    const select = $("payGuideDuration");
    if (!select) return;
    const durations = pricingCatalog.durationOptions || [60, 120];
    const requested = Number(preferredValue);
    select.innerHTML = durations.map((minutes) => `<option value="${minutes}">${escapeHtml(lessonDurationLabel(minutes))}</option>`).join("");
    select.value = String(durations.includes(requested) ? requested : 60);
  }

  function syncPayGuideSessionOptions({ preferFullPackage = false } = {}) {
    const select = $("payGuideSessions");
    if (!select) return;
    const weekly = Number($("payGuideFrequency")?.value) === 2 ? 2 : 1;
    const maxSessions = payGuidePackageSessions(weekly);
    const previous = Number(select.value);
    const selected = preferFullPackage || !Number.isInteger(previous) || previous < 1 || previous > maxSessions ? maxSessions : previous;
    select.innerHTML = Array.from({ length: maxSessions }, (_, index) => {
      const count = index + 1;
      const label = currentLanguage() === "en" ? `${count} session${count === 1 ? "" : "s"}` : `${count}회`;
      return `<option value="${count}">${label}</option>`;
    }).join("");
    select.value = String(selected);
  }

  function renderPayGuide() {
    if (!$("payGuidePlan")) return;
    const plan = $("payGuidePlan").value || "standard";
    const duration = Number($("payGuideDuration").value) || 60;
    const weekly = Number($("payGuideFrequency").value) === 2 ? 2 : 1;
    const maxSessions = payGuidePackageSessions(weekly);
    let sessions = Number($("payGuideSessions").value) || maxSessions;
    if (sessions > maxSessions) { syncPayGuideSessionOptions({ preferFullPackage: true }); sessions = maxSessions; }

    const rates = payGuideHourlyRates(plan, duration);
    const payout = payGuidePayout(plan, duration, sessions);
    if (!rates || payout === null) return;

    const frequencyText = currentLanguage() === "en" ? (weekly === 2 ? "Twice a week" : "Once a week") : `주 ${weekly}회`;
    const sessionsText = currentLanguage() === "en" ? `${sessions} session${sessions === 1 ? "" : "s"} payout` : `${sessions}회 정산`;
    $("payGuideSelection").textContent = `${payGuidePlanLabel(plan)} · ${lessonDurationLabel(duration)} · ${frequencyText} · ${sessionsText}`;
    $("payGuideFirstPayout").textContent = formatWon(payout);
    $("payGuidePayoutNote").textContent = currentLanguage() === "en" ? `Based on ${sessions} payout session${sessions === 1 ? "" : "s"}` : `선택한 ${sessions}회 정산 기준`;
    $("payGuideFirstHourly").textContent = formatHourlyWon(rates.firstMonth);
    $("payGuideMonthTwoHourly").textContent = formatHourlyWon(rates.monthTwo);
    $("payGuideFlowFirst").textContent = formatHourlyWon(rates.firstMonth);
    $("payGuideFlowSecond").textContent = formatHourlyWon(rates.monthTwo);

    const planSelect = $("payGuidePlan");
    [...planSelect.options].forEach((option) => { option.textContent = payGuidePlanLabel(option.value); });
    const frequencySelect = $("payGuideFrequency");
    if (frequencySelect?.options?.length >= 2) {
      frequencySelect.options[0].textContent = currentLanguage() === "en" ? "Once a week" : "주 1회";
      frequencySelect.options[1].textContent = currentLanguage() === "en" ? "Twice a week" : "주 2회";
    }

    $("payGuideDurationTableCaption").textContent = currentLanguage() === "en"
      ? `${payGuidePlanLabel(plan)} · ${weekly === 2 ? "8-session" : "4-session"} package comparison`
      : `${payGuidePlanLabel(plan)} · ${maxSessions}회 패키지 기준 전체 수업 시간 비교`;
    $("payGuideSessionTableCaption").textContent = currentLanguage() === "en"
      ? `${payGuidePlanLabel(plan)} · ${lessonDurationLabel(duration)} · compare first-month payouts by sessions taught`
      : `${payGuidePlanLabel(plan)} · ${lessonDurationLabel(duration)} · 실제 담당 횟수별 첫 달 정산액`;

    const durations = pricingCatalog.durationOptions || [60, 120];
    $("payGuideDurationRows").innerHTML = durations.map((minutes) => {
      const rowRates = payGuideHourlyRates(plan, minutes);
      const fullPayout = payGuidePayout(plan, minutes, maxSessions);
      return `<tr class="${minutes === duration ? "selected" : ""}" data-pay-duration="${minutes}">
        <td><strong>${escapeHtml(lessonDurationLabel(minutes))}</strong></td>
        <td>${escapeHtml(formatWon(fullPayout))}</td>
        <td>${escapeHtml(formatHourlyWon(rowRates?.firstMonth))}</td>
        <td>${escapeHtml(formatHourlyWon(rowRates?.monthTwo))}</td>
      </tr>`;
    }).join("");

    $("payGuideSessionRows").innerHTML = Array.from({ length: maxSessions }, (_, index) => {
      const count = index + 1;
      const amount = payGuidePayout(plan, duration, count);
      const label = currentLanguage() === "en" ? `${count} session${count === 1 ? "" : "s"}` : `${count}회`;
      return `<tr class="${count === sessions ? "selected" : ""}" data-pay-sessions="${count}">
        <td><strong>${escapeHtml(label)}</strong></td>
        <td>${escapeHtml(formatWon(amount))}</td>
      </tr>`;
    }).join("");
  }

  function initializePayGuide() {
    if (!$("payGuidePlan")) return;
    syncPayGuideDurationOptions(60);
    syncPayGuideSessionOptions({ preferFullPackage: true });
    renderPayGuide();

    $("payGuidePlan").addEventListener("change", renderPayGuide);
    $("payGuideDuration").addEventListener("change", renderPayGuide);
    $("payGuideFrequency").addEventListener("change", () => {
      syncPayGuideSessionOptions({ preferFullPackage: true });
      renderPayGuide();
    });
    $("payGuideSessions").addEventListener("change", renderPayGuide);
    $("payGuideDurationRows").addEventListener("click", (event) => {
      const row = event.target.closest("[data-pay-duration]");
      if (!row) return;
      $("payGuideDuration").value = row.dataset.payDuration;
      renderPayGuide();
    });
    $("payGuideSessionRows").addEventListener("click", (event) => {
      const row = event.target.closest("[data-pay-sessions]");
      if (!row) return;
      $("payGuideSessions").value = row.dataset.paySessions;
      renderPayGuide();
    });
  }

  function localizedContent(item, field) {
    if (!item) return "";
    if (currentLanguage() === "en") {
      const english = item[`${field}_en`];
      if (english && String(english).trim()) return String(english).trim();
    }
    return String(item[field] || "").trim();
  }

  let currentUser = null;
  let profile = null;
  let slots = [];
  let assignments = [];
  let assignmentDateRefreshTimer = null;
  let selectedAvailability = new Set();
  let scheduleMemo = "";
  let gridDragState = null;
  let mobileScheduleDay = 1;
  let suppressGridClick = false;
  let logoutInProgress = false;
  let loginInProgress = false;
  let onboardingRequired = false;
  let agreementRequired = false;
  let agreementRecord = null;
  let agreementVersionRecord = null;
  let agreementViewMode = "required";
  let dashboardInitialized = false;
  let pendingProfilePhotoFile = null;
  let pendingOnboardingPhotoFile = null;
  let profilePhotoPreviewObjectUrl = "";
  let onboardingPhotoPreviewObjectUrl = "";
  let currentProfilePhotoSignedUrl = "";

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function profileInitial(name = "") {
    return String(name || "선생님").trim().slice(0, 1).toUpperCase() || "T";
  }

  function photoElements(scope) {
    const prefix = scope === "onboarding" ? "onboarding" : "profile";
    return {
      image: $(`${prefix}PhotoImage`),
      fallback: $(`${prefix}PhotoFallback`),
      input: $(`${prefix}PhotoInput`),
      status: $(`${prefix}PhotoStatus`),
      clear: scope === "onboarding" ? $("onboardingPhotoClearButton") : null,
      remove: scope === "profile" ? $("profilePhotoRemoveButton") : null
    };
  }

  function revokePreviewUrl(scope) {
    const key = scope === "onboarding" ? "onboardingPhotoPreviewObjectUrl" : "profilePhotoPreviewObjectUrl";
    const value = scope === "onboarding" ? onboardingPhotoPreviewObjectUrl : profilePhotoPreviewObjectUrl;
    if (value) URL.revokeObjectURL(value);
    if (key === "onboardingPhotoPreviewObjectUrl") onboardingPhotoPreviewObjectUrl = "";
    else profilePhotoPreviewObjectUrl = "";
  }

  function renderPhotoPreview(scope, url = "") {
    const elements = photoElements(scope);
    if (!elements.image || !elements.fallback) return;
    elements.fallback.textContent = profileInitial(profile?.full_name || currentUser?.user_metadata?.full_name);
    if (url) {
      elements.image.src = url;
      elements.image.hidden = false;
      elements.fallback.hidden = true;
    } else {
      elements.image.removeAttribute("src");
      elements.image.hidden = true;
      elements.fallback.hidden = false;
    }
  }

  function updateTopbarPhoto(url = "") {
    const image = $("userAvatarImage");
    const fallback = $("userAvatarFallback");
    if (!image || !fallback) return;
    fallback.textContent = profileInitial(profile?.full_name);
    if (url) {
      image.src = url;
      image.hidden = false;
      fallback.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      fallback.hidden = false;
    }
  }

  function setPhotoStatus(scope, message) {
    const status = photoElements(scope).status;
    if (status) status.textContent = message;
  }

  async function createProfilePhotoSignedUrl(photoPath) {
    if (!photoPath) return "";
    const { data, error } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrl(photoPath, PROFILE_PHOTO_SIGNED_URL_SECONDS);
    if (error) {
      console.warn("Profile photo signed URL failed:", error);
      return "";
    }
    return data?.signedUrl || "";
  }

  async function refreshProfilePhoto() {
    currentProfilePhotoSignedUrl = await createProfilePhotoSignedUrl(profile?.profile_photo_path);
    updateTopbarPhoto(currentProfilePhotoSignedUrl);
    renderPhotoPreview("profile", currentProfilePhotoSignedUrl);
    renderPhotoPreview("onboarding", currentProfilePhotoSignedUrl);
    setPhotoStatus("profile", profile?.profile_photo_path ? "현재 프로필 사진이 등록되어 있습니다." : "등록된 사진이 없습니다.");
    setPhotoStatus("onboarding", profile?.profile_photo_path ? "현재 프로필 사진이 등록되어 있습니다." : "등록된 사진이 없습니다.");
    const profileElements = photoElements("profile");
    if (profileElements.remove) profileElements.remove.disabled = !profile?.profile_photo_path;
  }

  function validateProfilePhotoFile(file) {
    if (!file) return false;
    if (!PROFILE_PHOTO_EXTENSIONS[file.type]) {
      showToast("JPG, PNG 또는 WEBP 사진만 업로드할 수 있습니다.", "error");
      return false;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      showToast("프로필 사진은 5MB 이하만 업로드할 수 있습니다.", "error");
      return false;
    }
    return true;
  }

  function selectProfilePhoto(scope, file) {
    if (!validateProfilePhotoFile(file)) {
      const input = photoElements(scope).input;
      if (input) input.value = "";
      return;
    }
    revokePreviewUrl(scope);
    const objectUrl = URL.createObjectURL(file);
    if (scope === "onboarding") {
      pendingOnboardingPhotoFile = file;
      onboardingPhotoPreviewObjectUrl = objectUrl;
    } else {
      pendingProfilePhotoFile = file;
      profilePhotoPreviewObjectUrl = objectUrl;
    }
    renderPhotoPreview(scope, objectUrl);
    setPhotoStatus(scope, scope === "profile"
      ? "선택한 사진은 아래의 내 정보 저장 버튼을 누르면 함께 저장됩니다."
      : "선택한 사진을 확인해주세요.");
    const elements = photoElements(scope);
    if (elements.clear) elements.clear.disabled = false;
  }

  function clearSelectedProfilePhoto(scope) {
    revokePreviewUrl(scope);
    if (scope === "onboarding") pendingOnboardingPhotoFile = null;
    else pendingProfilePhotoFile = null;
    const elements = photoElements(scope);
    if (elements.input) elements.input.value = "";
    if (elements.clear) elements.clear.disabled = true;
    renderPhotoPreview(scope, currentProfilePhotoSignedUrl);
    setPhotoStatus(scope, profile?.profile_photo_path ? "현재 프로필 사진이 등록되어 있습니다." : "등록된 사진이 없습니다.");
  }

  async function uploadProfilePhotoFile(file) {
    if (!validateProfilePhotoFile(file)) throw new Error("Invalid profile photo file");
    const extension = PROFILE_PHOTO_EXTENSIONS[file.type];
    const newPath = `${currentUser.id}/profile-${Date.now()}.${extension}`;
    const previousPath = profile?.profile_photo_path || "";
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .upload(newPath, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    try {
      const savedProfile = await persistProfile({ profile_photo_path: newPath, updated_at: new Date().toISOString() });
      profile = { ...profile, ...savedProfile, profile_photo_path: newPath };
    } catch (error) {
      await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([newPath]);
      throw error;
    }

    if (previousPath && previousPath !== newPath) {
      const { error: removeError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([previousPath]);
      if (removeError) console.warn("Old profile photo cleanup failed:", removeError);
    }
    await refreshProfilePhoto();
    return newPath;
  }


  async function removeProfilePhoto() {
    if (!profile?.profile_photo_path) return;
    if (!window.confirm("등록된 프로필 사진을 삭제할까요?")) return;
    const button = $("profilePhotoRemoveButton");
    setLoading(button, true, "사진 삭제");
    const previousPath = profile.profile_photo_path;
    try {
      const savedProfile = await persistProfile({ profile_photo_path: null, updated_at: new Date().toISOString() });
      profile = { ...profile, ...savedProfile, profile_photo_path: null };
      const { error: removeError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([previousPath]);
      if (removeError) console.warn("Profile photo file cleanup failed:", removeError);
      currentProfilePhotoSignedUrl = "";
      clearSelectedProfilePhoto("profile");
      updateTopbarPhoto("");
      renderPhotoPreview("onboarding", "");
      showToast("프로필 사진이 삭제되었습니다.");
    } catch (error) {
      console.error("Profile photo removal failed:", error);
      showToast("사진 삭제에 실패했습니다: " + (error?.message || "알 수 없는 오류"), "error");
    } finally {
      setLoading(button, false, "사진 삭제");
      button.disabled = !profile?.profile_photo_path;
    }
  }

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
    return {
      current: assignments.filter((item) => !item.status || item.status === "active"),
      history: assignments.filter((item) => item.status && item.status !== "active")
    };
  }

  function scheduleAssignmentDateRefresh() {
    if (assignmentDateRefreshTimer) clearTimeout(assignmentDateRefreshTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    assignmentDateRefreshTimer = window.setTimeout(() => {
      renderAssignments();
      scheduleAssignmentDateRefresh();
    }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
  }

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
    if (onboardingRequired || agreementRequired) return;
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
    assignments = [];
    if (assignmentDateRefreshTimer) clearTimeout(assignmentDateRefreshTimer);
    assignmentDateRefreshTimer = null;
    selectedAvailability = new Set();
    scheduleMemo = "";
    onboardingRequired = false;
    agreementRequired = false;
    agreementRecord = null;
    agreementVersionRecord = null;
    agreementViewMode = "required";
    dashboardInitialized = false;
    pendingProfilePhotoFile = null;
    pendingOnboardingPhotoFile = null;
    currentProfilePhotoSignedUrl = "";
    revokePreviewUrl("profile");
    revokePreviewUrl("onboarding");

    document.body.classList.remove("onboarding-open", "agreement-open");
    $("agreementView").classList.add("hidden");
    $("onboardingView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("loginPassword").value = "";
    $("adminLink").classList.add("hidden");

    // 무거운 iframe과 이전 사용자 콘텐츠를 즉시 정리합니다.
    $("videoGrid").innerHTML = "";
    $("resourceGrid").innerHTML = "";
    $("announcementList").innerHTML = "";
    $("assignmentList").innerHTML = "";
    $("historyAssignmentList").innerHTML = "";
    $("assignmentCount").textContent = "0명";
    $("historyAssignmentCount").textContent = "0명";

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

  function isProfileOnboardingRequired() {
    return profile?.role !== "admin" && (!profile?.profile_completed_at || !String(profile?.kakao_id || "").trim());
  }

  function isAgreementRequired() {
    return profile?.role !== "admin" && !agreementRecord;
  }

  function formatAgreementDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(currentLocale(), { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function loadAgreementState() {
    if (profile?.role === "admin") {
      agreementRecord = null;
      agreementVersionRecord = null;
      updateAgreementProfileCard();
      return;
    }

    const [versionResult, agreementResult] = await Promise.all([
      supabase
        .from("teacher_agreement_versions")
        .select("version, title, content_hash, published_at")
        .eq("version", CURRENT_AGREEMENT_VERSION)
        .maybeSingle(),
      supabase
        .from("teacher_agreements")
        .select("id, teacher_id, teacher_name, agreement_version, confirmations, agreed_at")
        .eq("teacher_id", currentUser.id)
        .eq("agreement_version", CURRENT_AGREEMENT_VERSION)
        .maybeSingle()
    ]);

    if (versionResult.error) throw versionResult.error;
    if (!versionResult.data) throw new Error(`Agreement version ${CURRENT_AGREEMENT_VERSION} is not configured.`);
    if (agreementResult.error) throw agreementResult.error;

    agreementVersionRecord = versionResult.data;
    agreementRecord = agreementResult.data || null;
    updateAgreementProfileCard();
  }

  function updateAgreementProfileCard() {
    const panel = $("profileAgreementPanel");
    const status = $("profileAgreementStatus");
    const button = $("viewAgreementButton");
    if (!panel || !status || !button) return;
    if (profile?.role === "admin") {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    if (agreementRecord) {
      status.textContent = `${agreementRecord.agreement_version} · ${formatAgreementDate(agreementRecord.agreed_at)} · ${agreementRecord.teacher_name}`;
      button.disabled = false;
    } else {
      status.textContent = `${CURRENT_AGREEMENT_VERSION} 계약 동의가 필요합니다.`;
      button.disabled = true;
    }
  }

  function resetAgreementForm() {
    const form = $("agreementForm");
    form?.reset();
    const suggestedName = profile?.full_name && profile.full_name !== "선생님" ? profile.full_name : "";
    $("agreementTeacherName").value = suggestedName;
    updateAgreementSubmitState();
  }

  function updateAgreementSubmitState() {
    const form = $("agreementForm");
    const button = $("agreementSubmitButton");
    if (!form || !button) return;

    const checks = [...form.querySelectorAll(".agreement-check")];
    let checkedCount = 0;
    checks.forEach((input) => {
      if (input.checked) checkedCount += 1;
      input.closest("label")?.classList.toggle("is-checked", input.checked);
    });

    const allChecked = checks.length === 5 && checkedCount === 5;
    const hasName = Boolean($("agreementTeacherName")?.value.trim());
    button.disabled = !(allChecked && hasName);
  }

  function syncAgreementLanguage() {
    const language = currentLanguage() === "en" ? "en" : "ko";
    document.querySelectorAll("[data-agreement-lang]").forEach((section) => {
      section.classList.toggle("hidden", section.dataset.agreementLang !== language);
    });
    const scroll = $("agreementContractScroll");
    if (scroll) scroll.setAttribute("aria-label", language === "en" ? "NADO Teacher Service Agreement content" : "NADO Teacher Service Agreement 계약서 내용");
  }

  function showAgreement(mode = "required") {
    agreementViewMode = mode;
    agreementRequired = mode === "required";
    $("agreementEmail").textContent = currentUser?.email || "-";
    $("agreementVersionLabel").textContent = CURRENT_AGREEMENT_VERSION;
    syncAgreementLanguage();

    const isReview = mode === "review";
    $("agreementForm").classList.toggle("hidden", isReview);
    $("agreementReviewFooter").classList.toggle("hidden", !isReview);
    $("agreementReviewCloseButton").classList.toggle("hidden", !isReview);
    $("agreementAcceptedSummary").classList.toggle("hidden", !isReview || !agreementRecord);
    if (isReview && agreementRecord) {
      $("agreementAcceptedSummaryText").textContent = `${agreementRecord.teacher_name} · ${formatAgreementDate(agreementRecord.agreed_at)}`;
    }

    if (!isReview) resetAgreementForm();
    $("loginView").classList.add("hidden");
    if (agreementRequired) {
      $("appView").classList.add("hidden");
      $("onboardingView").classList.add("hidden");
    }
    $("agreementView").classList.remove("hidden");
    document.body.classList.add("agreement-open");
    $("agreementContractScroll").scrollTop = 0;
    window.setTimeout(() => isReview ? $("agreementReviewCloseButton").focus() : $("agreementContractScroll").focus(), 0);
  }

  function hideAgreementReview() {
    if (agreementViewMode !== "review") return;
    $("agreementView").classList.add("hidden");
    document.body.classList.remove("agreement-open");
    agreementRequired = false;
    agreementViewMode = "required";
  }

  async function completeAgreement(event) {
    event.preventDefault();
    if (agreementViewMode !== "required") return;
    const form = $("agreementForm");
    const button = event.submitter || $("agreementSubmitButton");
    const teacherName = $("agreementTeacherName").value.trim();
    const checks = [...form.querySelectorAll(".agreement-check")];
    if (!teacherName) {
      $("agreementTeacherName").focus();
      return showToast("Teacher 성명을 입력해주세요.", "error");
    }
    if (checks.length !== 5 || !checks.every((input) => input.checked)) {
      return showToast("전자계약 확인 항목 5개에 모두 동의해주세요.", "error");
    }

    const confirmations = Object.fromEntries(checks.map((input) => [input.name, input.checked]));
    form.classList.add("is-submitting");
    checks.forEach((input) => { input.disabled = true; });
    $("agreementTeacherName").disabled = true;
    setLoading(button, true, "동의 및 계약하기");
    try {
      const { data, error } = await supabase
        .from("teacher_agreements")
        .insert({
          teacher_id: currentUser.id,
          teacher_name: teacherName,
          agreement_version: CURRENT_AGREEMENT_VERSION,
          confirmations
        })
        .select("id, teacher_id, teacher_name, agreement_version, confirmations, agreed_at")
        .single();

      if (error && error.code !== "23505") throw error;
      if (error?.code === "23505") {
        const { data: existing, error: reloadError } = await supabase
          .from("teacher_agreements")
          .select("id, teacher_id, teacher_name, agreement_version, confirmations, agreed_at")
          .eq("teacher_id", currentUser.id)
          .eq("agreement_version", CURRENT_AGREEMENT_VERSION)
          .single();
        if (reloadError) throw reloadError;
        agreementRecord = existing;
      } else {
        agreementRecord = data;
      }
    } catch (error) {
      console.error("Agreement acceptance failed:", error);
      const setupMissing = /teacher_agreement|relation|does not exist|permission/i.test(error?.message || "");
      showToast(setupMissing
        ? "전자계약 데이터베이스 설정이 필요합니다. 운영팀에 문의해주세요."
        : "계약 동의 저장에 실패했습니다: " + (error?.message || "알 수 없는 오류"), "error");
      form.classList.remove("is-submitting");
      checks.forEach((input) => { input.disabled = false; });
      $("agreementTeacherName").disabled = false;
      setLoading(button, false, "동의 및 계약하기");
      updateAgreementSubmitState();
      return;
    }

    agreementRequired = false;
    $("agreementView").classList.add("hidden");
    document.body.classList.remove("agreement-open");
    updateAgreementProfileCard();
    form.classList.remove("is-submitting");
    checks.forEach((input) => { input.disabled = false; });
    $("agreementTeacherName").disabled = false;
    setLoading(button, false, "동의 및 계약하기");
    showToast("전자계약 동의가 완료되었습니다.");

    if (isProfileOnboardingRequired()) {
      if (!$("onboardingName").value.trim()) $("onboardingName").value = teacherName;
      showOnboarding();
      return;
    }

    try {
      await initializeDashboardData(location.hash.replace("#", "") || "dashboard");
    } catch (error) {
      console.error("Post-agreement dashboard initialization failed:", error);
      $("appView").classList.remove("hidden");
      switchPage("dashboard");
      showToast("계약 동의는 저장되었지만 일부 정보를 불러오지 못했습니다. 새로고침해주세요.", "error");
    }
  }

  function syncProfileFields(data = {}) {
    const values = {
      Name: data.full_name || "",
      School: data.school || "",
      Major: data.major || "",
      Phone: data.phone || "",
      KakaoId: data.kakao_id || "",
      BankName: data.bank_name || "",
      AccountNumber: data.account_number || "",
      Bio: data.bio || ""
    };

    Object.entries(values).forEach(([key, value]) => {
      const profileField = $(`profile${key}`);
      const onboardingField = $(`onboarding${key}`);
      if (profileField) profileField.value = value;
      if (onboardingField) onboardingField.value = value;
    });
  }

  function updateProfileHeader(data = {}) {
    const name = data.full_name || "선생님";
    $("userName").textContent = name;
    $("welcomeName").textContent = name;
    $("userEmail").textContent = currentUser?.email || "";
    $("userAvatarFallback").textContent = profileInitial(name);
    ["profile", "onboarding"].forEach((scope) => {
      const fallback = photoElements(scope).fallback;
      if (fallback) fallback.textContent = profileInitial(name);
    });
  }

  function showOnboarding() {
    onboardingRequired = true;
    $("onboardingEmail").textContent = currentUser?.email || "-";
    $("loginView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("onboardingView").classList.remove("hidden");
    document.body.classList.add("onboarding-open");
    window.setTimeout(() => $("onboardingName").focus(), 0);
  }

  function hideOnboarding() {
    onboardingRequired = false;
    $("onboardingView").classList.add("hidden");
    document.body.classList.remove("onboarding-open");
  }

  async function initializeDashboardData(requestedPage = "dashboard") {
    $("appView").classList.remove("hidden");
    if (!dashboardInitialized) {
      await Promise.all([
        loadAssignments(),
        loadAvailability(),
        loadAnnouncements(),
        loadResources(),
        loadVideos()
      ]);
      renderGuideProgress();
      dashboardInitialized = true;
    }
    switchPage(requestedPage);
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
    dashboardInitialized = false;
    $("loginView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("agreementView").classList.add("hidden");
    $("onboardingView").classList.add("hidden");

    try {
      await loadProfile();
    } catch (error) {
      console.error("Profile initialization failed:", error);
      renderSignedOutState();
      showToast("프로필 정보를 불러오지 못했습니다. 잠시 후 다시 로그인해주세요.", "error");
      return;
    }

    try {
      await loadAgreementState();
    } catch (error) {
      console.error("Agreement initialization failed:", error);
      $("loginView").classList.add("hidden");
      $("appView").classList.add("hidden");
      $("onboardingView").classList.add("hidden");
      showToast("전자계약 정보를 불러오지 못했습니다. Supabase 계약 업데이트 SQL을 확인해주세요.", "error");
      return;
    }

    if (isAgreementRequired()) {
      showAgreement("required");
      return;
    }

    if (isProfileOnboardingRequired()) {
      showOnboarding();
      return;
    }

    hideOnboarding();
    try {
      await initializeDashboardData(location.hash.replace("#", "") || "dashboard");
    } catch (error) {
      console.error("Dashboard initialization failed:", error);
      $("appView").classList.remove("hidden");
      switchPage("dashboard");
      showToast("일부 정보를 불러오지 못했습니다. 페이지를 새로고침해주세요.", "error");
    }
  }

  async function loadProfile() {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (error) {
      console.error("Profile lookup failed:", error);
      throw error;
    }
    profile = data || { id: currentUser.id, full_name: currentUser.user_metadata?.full_name || "선생님", email: currentUser.email, role: "teacher", profile_completed_at: null, profile_photo_path: null };
    updateProfileHeader(profile);
    syncProfileFields(profile);
    await refreshProfilePhoto();
    $("adminLink").classList.toggle("hidden", profile.role !== "admin");
    updateAgreementProfileCard();
  }

  async function loadAssignments() {
    const { data, error } = await supabase
      .from("student_assignments")
      .select("id, student_id, student_name, student_email, assignment_type, plan, lesson_duration_minutes, weekly_frequency, settlement_sessions, four_lesson_tuition, four_lesson_teacher_payout, teacher_payout_amount, pricing_version, first_lesson_date, settlement_date, status")
      .eq("teacher_id", currentUser.id)
      .order("settlement_date", { ascending: true })
      .order("student_name", { ascending: true });

    if (error) {
      console.error("Assignment lookup failed:", error);
      assignments = [];
      renderAssignments("학생 정보를 불러오지 못했습니다. 운영팀에 문의해주세요.");
      return;
    }

    assignments = data || [];
    renderAssignments();
    scheduleAssignmentDateRefresh();
  }

  function assignmentCard(assignment, isHistory = false) {
    const plan = assignment.plan || "unassigned";
    const isTrial = assignment.assignment_type === "trial";
    const statusLabel = isHistory
      ? (currentLanguage() === "en" ? "Payout complete" : "정산 완료")
      : (currentLanguage() === "en" ? "Current student" : "현재 학생");
    const trialBadge = isTrial
      ? `<span class="assignment-type-badge trial">${escapeHtml(currentLanguage() === "en" ? "Free trial lesson" : "무료 체험수업")}</span>`
      : "";

    return `
      <article class="assignment-card${isHistory ? " assignment-card-history" : ""}${isTrial ? " assignment-card-trial" : ""}">
        <div class="assignment-card-topline">
          ${trialBadge}
          <span class="plan-badge plan-${escapeHtml(plan)}">${escapeHtml(planLabel(assignment.plan))}</span>
          <span class="assignment-status-badge ${isHistory ? "completed" : "current"}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="assignment-student-name">
          <span>${escapeHtml(currentLanguage() === "en" ? "Student name" : "학생 이름")}</span>
          <strong>${escapeHtml(assignment.student_name)}</strong>
        </div>
        ${assignment.lesson_duration_minutes ? `<div class="assignment-service-meta">
          <span>${escapeHtml(lessonDurationLabel(assignment.lesson_duration_minutes))}</span>
          ${isTrial
            ? `<span>${escapeHtml(currentLanguage() === "en" ? "1 trial session" : "체험 1회")}</span>`
            : `<span>${escapeHtml(weeklyFrequencyLabel(assignment.weekly_frequency))}</span>
               <span>${escapeHtml(currentLanguage() === "en" ? `Payout ${sessionCountLabel(assignment.settlement_sessions)}` : `정산 ${sessionCountLabel(assignment.settlement_sessions)}`)}</span>`}
        </div>` : '<div class="assignment-pricing-missing teacher-view">기존 기록 · 수업/정산 상세 미지정</div>'}
        ${assignment.teacher_payout_amount !== null && assignment.teacher_payout_amount !== undefined && Number.isFinite(Number(assignment.teacher_payout_amount)) ? `<div class="assignment-payout-box${isTrial ? " trial" : ""}">
          <span>${escapeHtml(isTrial
            ? (currentLanguage() === "en" ? "Trial lesson teacher payout" : "체험수업 Teacher 지급액")
            : (currentLanguage() === "en" ? "First-month teacher payout" : (isHistory ? "첫 달 Teacher 정산액" : "첫 달 Teacher 정산 예정액")))}</span>
          <strong>${escapeHtml(formatWon(assignment.teacher_payout_amount))}</strong>
          ${isTrial
            ? `<small>${escapeHtml(currentLanguage() === "en" ? "Free for the student · Economy trial lesson" : "학생 무료 · Economy 체험수업")}</small>`
            : (() => {
                const weekly = Number(assignment.weekly_frequency) === 2 ? 2 : 1;
                const packageSessions = PACKAGE_SESSIONS * weekly;
                const packageTeacherPayout = Number(assignment.four_lesson_teacher_payout) * weekly;
                const sessions = Number(assignment.settlement_sessions);
                if (sessions < packageSessions) {
                  return `<small>${escapeHtml(currentLanguage() === "en"
                    ? `${sessionCountLabel(sessions)} out of ${packageSessions}-session payout ${formatWon(packageTeacherPayout)}`
                    : `${packageSessions}회 기준 ${formatWon(packageTeacherPayout)} 중 ${sessionCountLabel(sessions)} 정산`)}</small>`;
                }
                return `<small>${escapeHtml(currentLanguage() === "en" ? `${packageSessions}-session payout` : `${packageSessions}회 기준 정산액`)}</small>`;
              })()}
        </div>` : ""}
        <dl class="assignment-date-list">
          <div>
            <dt>${escapeHtml(isTrial ? (currentLanguage() === "en" ? "Trial lesson date" : "체험수업일") : (currentLanguage() === "en" ? "First lesson date" : "첫 수업일"))}</dt>
            <dd>${escapeHtml(formatKoreanDate(assignment.first_lesson_date))}</dd>
          </div>
          <div class="settlement-date-row">
            <dt>${escapeHtml(isTrial
              ? (currentLanguage() === "en" ? (isHistory ? "Trial payout date" : "Scheduled trial payout date") : (isHistory ? "체험수업 정산일" : "체험수업 정산 예정일"))
              : (currentLanguage() === "en" ? (isHistory ? "First-month payout date" : "Scheduled first-month payout date") : (isHistory ? "첫 달 수업료 정산일" : "첫 달 수업료 정산 예정일")))}</dt>
            <dd>${escapeHtml(formatKoreanDate(assignment.settlement_date))}</dd>
          </div>
        </dl>
        ${!isHistory && !isTrial && assignment.student_id ? `<a class="button secondary full assignment-room-button" href="classroom.html?assignment=${escapeHtml(assignment.id)}">${escapeHtml(currentLanguage() === "en" ? "Open shared space" : "학생 공유 공간 열기")}</a>` : ""}
      </article>`;
  }

  function renderAssignmentGroup(targetId, items, emptyMessage, isHistory = false) {
    const target = $(targetId);
    if (!items.length) {
      target.className = `assignment-list${isHistory ? " assignment-history-list" : ""} assignment-empty`;
      target.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }
    target.className = `assignment-list${isHistory ? " assignment-history-list" : ""}`;
    target.innerHTML = items.map((assignment) => assignmentCard(assignment, isHistory)).join("");
  }

  function renderAssignments(errorMessage = "") {
    const currentTarget = $("assignmentList");
    const historyTarget = $("historyAssignmentList");

    if (errorMessage) {
      $("assignmentCount").textContent = "0명";
      $("historyAssignmentCount").textContent = "0명";
      currentTarget.className = "assignment-list assignment-empty";
      historyTarget.className = "assignment-list assignment-history-list assignment-empty";
      currentTarget.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage)}</div>`;
      historyTarget.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage)}</div>`;
      return;
    }

    const { current, history } = assignmentGroups();
    current.sort((a, b) => a.settlement_date.localeCompare(b.settlement_date) || a.student_name.localeCompare(b.student_name, "ko"));
    history.sort((a, b) => b.settlement_date.localeCompare(a.settlement_date) || a.student_name.localeCompare(b.student_name, "ko"));
    $("assignmentCount").textContent = `${current.length}명`;
    $("historyAssignmentCount").textContent = `${history.length}명`;
    renderAssignmentGroup("assignmentList", current, "현재 나도에서 관리 중인 학생이 없습니다.");
    renderAssignmentGroup("historyAssignmentList", history, "아직 지난 학생 기록이 없습니다.", true);
  }

  const profileFieldIds = {
    full_name: "profileName",
    school: "profileSchool",
    major: "profileMajor",
    phone: "profilePhone",
    kakao_id: "profileKakaoId",
    bank_name: "profileBankName",
    account_number: "profileAccountNumber",
    bio: "profileBio"
  };

  const onboardingFieldIds = {
    full_name: "onboardingName",
    school: "onboardingSchool",
    major: "onboardingMajor",
    phone: "onboardingPhone",
    kakao_id: "onboardingKakaoId",
    bank_name: "onboardingBankName",
    account_number: "onboardingAccountNumber",
    bio: "onboardingBio"
  };

  const profileFieldLabels = {
    full_name: "이름",
    school: "학교",
    major: "전공",
    phone: "휴대전화",
    kakao_id: "카카오톡 ID",
    bank_name: "은행명",
    account_number: "계좌번호",
    bio: "한 줄 소개"
  };

  function collectProfilePayload(fieldIds = profileFieldIds) {
    return {
      full_name: $(fieldIds.full_name).value.trim(),
      school: $(fieldIds.school).value.trim(),
      major: $(fieldIds.major).value.trim(),
      phone: $(fieldIds.phone).value.trim(),
      kakao_id: $(fieldIds.kakao_id).value.trim(),
      bank_name: $(fieldIds.bank_name).value.trim(),
      account_number: $(fieldIds.account_number).value.trim().replace(/\s+/g, ""),
      bio: $(fieldIds.bio).value.trim(),
      updated_at: new Date().toISOString()
    };
  }

  function validateProfilePayload(payload, fieldIds = profileFieldIds) {
    const missingKey = Object.keys(profileFieldLabels).find((key) => !payload[key]);
    if (missingKey) {
      $(fieldIds[missingKey]).focus();
      showToast(`${profileFieldLabels[missingKey]} 항목을 입력해주세요.`, "error");
      return false;
    }
    if (!/^[0-9-]{8,40}$/.test(payload.account_number)) {
      $(fieldIds.account_number).focus();
      showToast("계좌번호는 숫자와 하이픈(-)만 사용해 8자 이상 입력해주세요.", "error");
      return false;
    }
    return true;
  }

  async function persistProfile(payload) {
    const columns = "id, email, full_name, school, major, phone, kakao_id, bank_name, account_number, bio, profile_photo_path, role, profile_completed_at, updated_at";
    let result = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", currentUser.id)
      .select(columns)
      .maybeSingle();

    if (!result.error && !result.data) {
      result = await supabase
        .from("profiles")
        .insert({ id: currentUser.id, email: currentUser.email, ...payload })
        .select(columns)
        .single();
    }
    if (result.error) throw result.error;
    return result.data || payload;
  }

  function applySavedProfile(savedProfile) {
    profile = { ...profile, ...savedProfile };
    updateProfileHeader(profile);
    syncProfileFields(profile);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = $("profileForm");
    const button = event.submitter || form.querySelector('button[type="submit"]');
    const payload = collectProfilePayload(profileFieldIds);
    const selectedPhotoFile = pendingProfilePhotoFile;
    if (!validateProfilePayload(payload, profileFieldIds)) return;

    setLoading(button, true, "내 정보 저장");
    try {
      const savedProfile = await persistProfile(payload);
      applySavedProfile(savedProfile);

      if (selectedPhotoFile) {
        try {
          await uploadProfilePhotoFile(selectedPhotoFile);
          clearSelectedProfilePhoto("profile");
        } catch (photoError) {
          console.error("Profile photo save failed:", photoError);
          const setupMissing = /bucket|profile_photo_path|row-level security|policy/i.test(photoError?.message || "");
          showToast(
            setupMissing
              ? "내 정보는 저장되었지만 프로필 사진용 Supabase 설정이 필요합니다."
              : "내 정보는 저장되었지만 사진 저장에 실패했습니다. 사진을 확인한 뒤 다시 저장해주세요.",
            "error"
          );
          return;
        }
      }

      showToast(selectedPhotoFile
        ? "내 정보와 프로필 사진이 함께 저장되었습니다."
        : "내 정보가 저장되었습니다.");
    } catch (error) {
      console.error("Profile update failed:", error);
      const missingColumn = /bank_name|account_number|kakao_id|profile_completed_at|profile_photo_path/i.test(error?.message || "");
      showToast(
        missingColumn
          ? "프로필 데이터베이스 설정이 필요합니다. 운영팀에 문의해주세요."
          : "저장에 실패했습니다: " + (error?.message || "알 수 없는 오류"),
        "error"
      );
    } finally {
      setLoading(button, false, "내 정보 저장");
    }
  }

  async function completeOnboarding(event) {
    event.preventDefault();
    const form = $("onboardingForm");
    const button = event.submitter || form.querySelector('button[type="submit"]');
    const basePayload = collectProfilePayload(onboardingFieldIds);
    if (!validateProfilePayload(basePayload, onboardingFieldIds)) return;

    if (!pendingOnboardingPhotoFile && !profile?.profile_photo_path) {
      $("onboardingPhotoInput")?.focus();
      showToast("프로필 사진을 선택해주세요. 최초 프로필 설정 시 사진은 필수입니다.", "error");
      return;
    }

    setLoading(button, true, "프로필 저장하고 시작하기");
    try {
      // Save text/account fields first, but do not mark onboarding complete yet.
      const savedBaseProfile = await persistProfile({ ...basePayload, updated_at: new Date().toISOString() });
      applySavedProfile(savedBaseProfile);

      if (pendingOnboardingPhotoFile) {
        try {
          await uploadProfilePhotoFile(pendingOnboardingPhotoFile);
          clearSelectedProfilePhoto("onboarding");
        } catch (photoError) {
          console.error("Onboarding profile photo upload failed:", photoError);
          showToast("프로필 사진 저장에 실패했습니다. 사진을 다시 확인한 뒤 저장해주세요.", "error");
          setLoading(button, false, "프로필 저장하고 시작하기");
          return;
        }
      }

      if (!profile?.profile_photo_path) {
        showToast("프로필 사진 저장을 확인할 수 없습니다. 다시 사진을 선택해주세요.", "error");
        setLoading(button, false, "프로필 저장하고 시작하기");
        return;
      }

      const completedProfile = await persistProfile({
        ...basePayload,
        profile_photo_path: profile.profile_photo_path,
        profile_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      applySavedProfile(completedProfile);
    } catch (error) {
      console.error("Profile onboarding failed:", error);
      const missingColumn = /profile_completed_at/i.test(error?.message || "");
      showToast(
        missingColumn
          ? "최초 프로필 설정용 데이터베이스 업데이트가 필요합니다."
          : "프로필 저장에 실패했습니다: " + (error?.message || "알 수 없는 오류"),
        "error"
      );
      setLoading(button, false, "프로필 저장하고 시작하기");
      return;
    }

    hideOnboarding();
    setLoading(button, false, "프로필 저장하고 시작하기");
    showToast("프로필 작성이 완료되었습니다.");
    try {
      await initializeDashboardData("dashboard");
    } catch (error) {
      console.error("Post-onboarding dashboard initialization failed:", error);
      $("appView").classList.remove("hidden");
      switchPage("dashboard");
      showToast("프로필은 저장되었지만 일부 정보를 불러오지 못했습니다. 새로고침해주세요.", "error");
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

  function scheduleDayShortLabel(day) {
    if (currentLanguage() === "en") return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(day)] || "";
    return days[Number(day)] || "";
  }

  function buildAvailabilityGrid() {
    const grid = $("availabilityGrid");
    if (!grid) return;

    const headers = [
      '<div class="availability-grid-corner" aria-hidden="true">시간</div>',
      ...scheduleDayOrder.map((day) => `<div class="availability-day-header" role="columnheader"><strong>${scheduleDayShortLabel(day)}</strong><span>${currentLanguage() === "en" ? "" : "요일"}</span></div>`)
    ];
    const rows = [];

    for (let minutes = scheduleStartMinutes; minutes < scheduleEndMinutes; minutes += scheduleStepMinutes) {
      const fullHour = minutes % 60 === 0;
      rows.push(`<div class="availability-time-label${fullHour ? " full-hour" : ""}" role="rowheader">${minutesToTime(minutes)}</div>`);
      scheduleDayOrder.forEach((day) => {
        const key = availabilityKey(day, minutes);
        const dayLabel = currentLanguage() === "en" ? scheduleDayShortLabel(day) : `${scheduleDayShortLabel(day)}요일`;
        rows.push(`<button class="availability-cell${fullHour ? " full-hour" : ""}" type="button" role="gridcell" data-availability-key="${key}" aria-label="${dayLabel} ${minutesToTime(minutes)}" aria-pressed="false"></button>`);
      });
    }

    grid.innerHTML = headers.concat(rows).join("");
    buildMobileAvailabilityPicker();
    renderAvailabilityGridSelection();
  }

  function buildMobileAvailabilityPicker() {
    const picker = $("availabilityMobilePicker");
    if (!picker) return;
    const activeDay = scheduleDayOrder.includes(Number(mobileScheduleDay)) ? Number(mobileScheduleDay) : 1;
    mobileScheduleDay = activeDay;
    const dayTabs = scheduleDayOrder.map((day) => `
      <button class="availability-mobile-day${day === activeDay ? " active" : ""}" type="button" data-mobile-schedule-day="${day}" aria-pressed="${day === activeDay}">${scheduleDayShortLabel(day)}</button>
    `).join("");
    const hourGroups = [];
    for (let hour = scheduleStartMinutes / 60; hour < scheduleEndMinutes / 60; hour += 1) {
      const startMinutes = hour * 60;
      hourGroups.push(`
        <div class="availability-mobile-hour">
          <strong>${String(hour).padStart(2, "0")}</strong>
          <div class="availability-mobile-half-buttons">
            <button type="button" data-availability-key="${availabilityKey(activeDay, startMinutes)}" aria-pressed="false" aria-label="${scheduleDayShortLabel(activeDay)} ${minutesToTime(startMinutes)}"><span>:00</span></button>
            <button type="button" data-availability-key="${availabilityKey(activeDay, startMinutes + 30)}" aria-pressed="false" aria-label="${scheduleDayShortLabel(activeDay)} ${minutesToTime(startMinutes + 30)}"><span>:30</span></button>
          </div>
        </div>`);
    }
    picker.innerHTML = `
      <div class="availability-mobile-days" role="tablist" aria-label="${currentLanguage() === "en" ? "Select day" : "요일 선택"}">${dayTabs}</div>
      <div class="availability-mobile-hours">${hourGroups.join("")}</div>`;
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
    renderAvailabilityGridSelection();
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

  function handleMobileAvailabilityClick(event) {
    const dayButton = event.target.closest("[data-mobile-schedule-day]");
    if (dayButton) {
      mobileScheduleDay = Number(dayButton.dataset.mobileScheduleDay);
      buildMobileAvailabilityPicker();
      renderAvailabilityGridSelection();
      return;
    }
    const cell = event.target.closest("[data-availability-key]");
    if (!cell || !$("availabilityMobilePicker").contains(cell)) return;
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
    const { data, error } = await supabase
      .from("announcements")
      .select("title, body, title_en, body_en, published_at")
      .eq("is_active", true)
      .order("published_at", { ascending: false })
      .limit(5);
    if (error || !data?.length) {
      $("announcementList").innerHTML = '<div class="empty-state announcement-empty">현재 등록된 공지사항이 없습니다.</div>';
      return;
    }

    const formatDate = (value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? "-"
        : date.toLocaleDateString(currentLocale(), { year: "numeric", month: "2-digit", day: "2-digit" });
    };

    const [latest, ...previous] = data;
    const latestDate = new Date(latest.published_at);
    const daysSincePublished = Number.isNaN(latestDate.getTime())
      ? Infinity
      : (Date.now() - latestDate.getTime()) / 86400000;
    const latestLabel = daysSincePublished <= 7 ? "NEW" : "LATEST";

    const featured = `
      <article class="announcement-featured">
        <div class="announcement-featured-meta">
          <span class="announcement-label">${latestLabel}</span>
          <time datetime="${escapeHtml(latest.published_at || "")}">${escapeHtml(formatDate(latest.published_at))}</time>
        </div>
        <h4>${escapeHtml(localizedContent(latest, "title"))}</h4>
        <p>${escapeHtml(localizedContent(latest, "body"))}</p>
      </article>`;

    const archive = previous.length
      ? `<div class="announcement-archive">${previous.map((item) => `
          <article class="announcement-item">
            <time class="announcement-date" datetime="${escapeHtml(item.published_at || "")}">${escapeHtml(formatDate(item.published_at))}</time>
            <div><strong>${escapeHtml(localizedContent(item, "title"))}</strong><p>${escapeHtml(localizedContent(item, "body"))}</p></div>
          </article>`).join("")}</div>`
      : "";

    $("announcementList").innerHTML = featured + archive;
  }

  async function loadResources() {
    const { data, error } = await supabase
      .from("resources")
      .select("title, description, title_en, description_en, category, file_url, storage_path, original_name, size_bytes, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error || !data?.length) {
      $("resourceGrid").innerHTML = '<div class="panel empty-state">등록된 자료가 없습니다. 관리자에게 자료 URL 등록을 요청해주세요.</div>';
      return;
    }
    $("resourceGrid").innerHTML = data.map((item) => `
      <article class="resource-card">
        <div class="resource-icon">${item.category === "PDF" ? "PDF" : "DOC"}</div>
        <span class="resource-type">${escapeHtml(item.category || "RESOURCE")}</span>
        <h3>${escapeHtml(localizedContent(item, "title"))}</h3>
        <p>${escapeHtml(localizedContent(item, "description"))}</p>
        ${item.storage_path
          ? `<button class="resource-open-button" data-resource-storage="${escapeHtml(item.storage_path)}" type="button">회원 자료 열기 →</button>`
          : `<a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener">자료 열기 →</a>`}
      </article>`).join("");
    document.querySelectorAll("[data-resource-storage]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      const { data: signed, error: signedError } = await supabase.storage.from("member-resources").createSignedUrl(button.dataset.resourceStorage, 60);
      button.disabled = false;
      if (signedError) return showToast("자료를 열지 못했습니다.", "error");
      window.open(signed.signedUrl, "_blank", "noopener");
    }));
  }

  async function loadVideos() {
    // Training videos are temporarily hidden while the section is being revised.
    $("videoGrid").innerHTML = `
      <article class="panel training-maintenance-card">
        <span class="training-maintenance-icon">↻</span>
        <div>
          <strong>현재 수정 중입니다.</strong>
          <p>더 나은 교육 자료를 준비하고 있습니다. 준비가 완료되는 대로 이 페이지에 업데이트하겠습니다.</p>
        </div>
      </article>`;
  }

function loadGuideChecks() {
    try { return JSON.parse(localStorage.getItem(`nado-guide-${currentUser?.id || "guest"}`) || "{}"); } catch { return {}; }
  }
  function loadSubGuideChecks() {
    try { return JSON.parse(localStorage.getItem(`nado-subguide-${currentUser?.id || "guest"}`) || "{}"); } catch { return {}; }
  }
  function renderGuideProgress() {
    const checks = loadGuideChecks();
    const guideInputs = document.querySelectorAll("[data-guide]");
    guideInputs.forEach((input) => { input.checked = Boolean(checks[input.dataset.guide]); });
    const total = guideInputs.length;
    const completed = [...guideInputs].filter((input) => input.checked).length;
    $("guideProgressText").textContent = `${completed} / ${total} 완료`;
    $("guideProgressBar").style.width = `${(completed / total) * 100}%`;

    const subChecks = loadSubGuideChecks();
    document.querySelectorAll("[data-subguide]").forEach((input) => { input.checked = Boolean(subChecks[input.dataset.subguide]); });
  }
  function saveGuideCheck(event) {
    if (event.target.matches("[data-guide]")) {
      const checks = loadGuideChecks();
      checks[event.target.dataset.guide] = event.target.checked;
      localStorage.setItem(`nado-guide-${currentUser?.id || "guest"}`, JSON.stringify(checks));
      renderGuideProgress();
      return;
    }
    if (event.target.matches("[data-subguide]")) {
      const subChecks = loadSubGuideChecks();
      subChecks[event.target.dataset.subguide] = event.target.checked;
      localStorage.setItem(`nado-subguide-${currentUser?.id || "guest"}`, JSON.stringify(subChecks));
    }
  }

  function bindEvents() {
    $("loginForm").addEventListener("submit", login);
    $("resetPasswordButton").addEventListener("click", resetPassword);
    initializePayGuide();
  document.addEventListener("nado:languagechange", () => {
    buildAvailabilityGrid();
    renderAssignments();
    syncPayGuideDurationOptions(Number($("payGuideDuration")?.value) || 60);
    syncPayGuideSessionOptions();
    renderPayGuide();
    updateAgreementProfileCard();
    syncAgreementLanguage();
    if (agreementViewMode === "review" && agreementRecord) {
      $("agreementAcceptedSummaryText").textContent = `${agreementRecord.teacher_name} · ${formatAgreementDate(agreementRecord.agreed_at)}`;
    }
    if (!dashboardInitialized || !currentUser) return;
    Promise.all([loadAnnouncements(), loadResources(), loadVideos()]).catch((error) => {
      console.warn("Localized content refresh failed:", error);
    });
  });
    $("logoutButton").addEventListener("click", logout);
    $("profileForm").addEventListener("submit", saveProfile);
    $("onboardingForm").addEventListener("submit", completeOnboarding);
    $("onboardingLogoutButton").addEventListener("click", logout);
    $("agreementForm").addEventListener("submit", completeAgreement);
    $("agreementLogoutButton").addEventListener("click", logout);
    $("agreementForm").addEventListener("change", (event) => {
      if (event.target.matches(".agreement-check")) updateAgreementSubmitState();
    });
    $("agreementTeacherName").addEventListener("input", updateAgreementSubmitState);
    $("viewAgreementButton").addEventListener("click", () => { if (agreementRecord) showAgreement("review"); });
    $("agreementReviewCloseButton").addEventListener("click", hideAgreementReview);
    $("agreementReviewCloseBottomButton").addEventListener("click", hideAgreementReview);
    $("profilePhotoInput").addEventListener("change", (event) => selectProfilePhoto("profile", event.target.files?.[0]));
    $("onboardingPhotoInput").addEventListener("change", (event) => selectProfilePhoto("onboarding", event.target.files?.[0]));
    $("profilePhotoRemoveButton").addEventListener("click", removeProfilePhoto);
    $("onboardingPhotoClearButton").addEventListener("click", () => clearSelectedProfilePhoto("onboarding"));
    $("userAvatarImage").addEventListener("error", () => updateTopbarPhoto(""));
    $("profilePhotoImage").addEventListener("error", () => renderPhotoPreview("profile", ""));
    $("onboardingPhotoImage").addEventListener("error", () => renderPhotoPreview("onboarding", ""));
    buildAvailabilityGrid();
    $("availabilityGrid").addEventListener("pointerdown", handleGridPointerDown);
    $("availabilityGrid").addEventListener("click", handleGridClick);
    $("availabilityMobilePicker").addEventListener("click", handleMobileAvailabilityClick);
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
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && currentUser) renderAssignments();
    });
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
