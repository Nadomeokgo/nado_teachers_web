(() => {
  'use strict';

  const config = window.NADO_CONFIG || {};
  const client = window.NADO_SUPABASE_CLIENT || window.supabase?.createClient?.(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  if (!client) return;

  const $ = id => document.getElementById(id);
  const LOCATION_OPTIONS = [
    ['IGC', '인천 · IGC', 'Incheon · IGC'],
    ['트리플스트리트', '인천 · 트리플스트리트', 'Incheon · Triple Street'],
    ['송도 내 협의', '송도', 'Songdo'],
    ['서울', '서울', 'Seoul']
  ];
  const AREA_EN = {
    'Line 3 vicinity': 'Near Line 3', Gangnam: 'Gangnam', Daechi: 'Daechi', Seocho: 'Seocho',
    Seonyudo: 'Seonyudo', Sinchon: 'Sinchon', 'Yangcheon-gu': 'Yangcheon-gu',
    'Yeongdeungpo-gu': 'Yeongdeungpo-gu', Yongsan: 'Yongsan', Jamsil: 'Jamsil', Hanti: 'Hanti',
    Hapjeong: 'Hapjeong', Hongdae: 'Hongdae'
  };
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const TIME_START = 9 * 60;
  const TIME_END = 24 * 60;
  const STEP = 30;

  let user = null;
  let activeLocation = 'IGC';
  let activeServiceArea = '';
  let catalog = [];
  let selectedAreas = new Set();
  let activeDay = 1;
  let slotsByDay = Array.from({ length: 7 }, () => new Set());
  let pendingStart = null;
  let dirty = false;

  const isEnglish = () => window.NADO_I18N?.getLanguage?.() === 'en';
  const tr = (ko, en) => isEnglish() ? en : ko;
  const escapeHtml = (v = '') => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const areaLabel = area => isEnglish() ? (AREA_EN[area.code] || area.code || area.label) : area.label;

  function timeToMinutes(value) {
    const [h, m] = String(value || '').slice(0, 5).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  }

  function minutesToTime(minutes) {
    if (minutes === 1440) return '24:00';
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function displayTime(minutes) {
    if (minutes === 1440) return '24:00';
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function showToast(ko, en, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = tr(ko, en || ko);
    el.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  function setDirty(value = true) {
    dirty = value;
    const state = $('scheduleSaveState');
    if (state) {
      state.textContent = value ? tr('저장 필요', 'Unsaved') : tr('저장됨', 'Saved');
      state.classList.toggle('saved', !value);
    }
  }

  function resetSlots() {
    slotsByDay = Array.from({ length: 7 }, () => new Set());
  }

  function renderLocationButtons() {
    const wrap = $('nadoLocationButtons');
    if (!wrap) return;
    wrap.innerHTML = LOCATION_OPTIONS.map(([value, ko, en]) => `
      <button type="button" class="nado-v5-location-button${value === activeLocation ? ' active' : ''}" data-v5-location="${escapeHtml(value)}" aria-pressed="${value === activeLocation}">${escapeHtml(tr(ko, en))}</button>
    `).join('');
  }

  function renderAreaGrid() {
    const grid = $('nadoServiceAreaGrid');
    if (!grid) return;
    grid.innerHTML = catalog.map(area => `
      <label class="nado-v5-area-chip">
        <input type="checkbox" data-v5-area-check value="${escapeHtml(area.code)}" ${selectedAreas.has(area.code) ? 'checked' : ''}>
        <span>${escapeHtml(areaLabel(area))}</span>
      </label>
    `).join('');
  }

  function renderAreaEditor() {
    const panel = $('nadoSeoulAreaPanel');
    if (panel) panel.hidden = activeLocation !== '서울';
    const wrap = $('nadoAreaEditorWrap');
    const select = $('nadoAreaEditorSelect');
    const empty = $('nadoAreaEditorEmpty');
    if (!wrap || !select || !empty) return;

    const available = catalog.filter(area => selectedAreas.has(area.code));
    wrap.hidden = activeLocation !== '서울';
    select.hidden = available.length === 0;
    empty.hidden = available.length > 0;

    if (!available.length) {
      activeServiceArea = '';
      select.innerHTML = '';
      return;
    }

    if (!available.some(area => area.code === activeServiceArea)) activeServiceArea = available[0].code;
    select.innerHTML = available.map(area => `<option value="${escapeHtml(area.code)}">${escapeHtml(areaLabel(area))}</option>`).join('');
    select.value = activeServiceArea;
  }

  async function loadCatalogAndAreas() {
    if (!user) return;
    const [{ data: cat, error: catalogError }, { data: mine, error: mineError }] = await Promise.all([
      client.rpc('get_seoul_service_area_catalog'),
      client.from('teacher_service_areas').select('area,active').eq('teacher_id', user.id).eq('region', 'Seoul')
    ]);
    if (catalogError || mineError) throw catalogError || mineError;

    catalog = (Array.isArray(cat) ? cat : []).filter(area => area.code !== '테스트 지역' && area.label !== '테스트 지역');
    selectedAreas = new Set((mine || []).filter(row => row.active && row.area !== '테스트 지역').map(row => row.area));
    renderAreaGrid();
    renderAreaEditor();
  }

  function renderDayTabs() {
    const wrap = $('nadoDayTabs');
    if (!wrap) return;
    wrap.innerHTML = DAY_ORDER.map(day => {
      const count = slotsByDay[day].size;
      const label = isEnglish() ? DAYS_EN[day] : DAYS_KO[day];
      return `<button type="button" class="nado-v5-day${day === activeDay ? ' active' : ''}" data-v5-day="${day}" aria-pressed="${day === activeDay}"><span>${label}</span>${count ? `<b>${count}</b>` : ''}</button>`;
    }).join('');
  }

  function renderTimeGrid() {
    const grid = $('nadoTimeGrid');
    if (!grid) return;
    const slots = slotsByDay[activeDay];
    const buttons = [];
    for (let minutes = TIME_START; minutes <= TIME_END; minutes += STEP) {
      const selected = minutes < TIME_END && slots.has(minutes);
      const pending = pendingStart === minutes;
      const classes = ['nado-v5-time'];
      if (selected) classes.push('selected');
      if (pending) classes.push('pending');
      if (minutes === TIME_END) classes.push('end-boundary');
      buttons.push(`<button type="button" class="${classes.join(' ')}" data-v5-time="${minutes}" aria-pressed="${selected || pending}">${displayTime(minutes)}</button>`);
    }
    grid.innerHTML = buttons.join('');
  }

  function renderStatus() {
    const status = $('nadoRangeStatus');
    if (!status) return;
    if (pendingStart !== null) {
      status.className = 'nado-v5-range-status pending';
      status.innerHTML = `<strong>${tr('시작 시간 선택됨', 'Start time selected')}</strong><span>${displayTime(pendingStart)} · ${tr('끝 시간을 선택해주세요.', 'Choose the end time.')}</span>`;
      return;
    }
    status.className = 'nado-v5-range-status';
    status.textContent = tr(
      '시작 시간과 끝 시간을 선택하세요. 이미 선택된 시간과 겹치는 부분은 다시 선택하면 해제됩니다.',
      'Choose a start and end time. Any overlap with already selected times will be deselected.'
    );
  }

  function renderPicker() {
    renderDayTabs();
    renderTimeGrid();
    renderStatus();
  }

  function toggleSelectedRange(first, second) {
    if (first === second) {
      pendingStart = null;
      renderPicker();
      return showToast('시작 시간과 다른 끝 시간을 선택해주세요.', 'Choose an end time different from the start time.', 'error');
    }

    const start = Math.min(first, second);
    const clickedEnd = Math.max(first, second);
    const exclusiveEnd = clickedEnd === TIME_END ? TIME_END : Math.min(TIME_END, clickedEnd + STEP);
    const slots = slotsByDay[activeDay];

    for (let minutes = start; minutes < exclusiveEnd; minutes += STEP) {
      if (slots.has(minutes)) slots.delete(minutes);
      else slots.add(minutes);
    }

    pendingStart = null;
    setDirty(true);
    renderPicker();
  }

  function handleTimeClick(minutes) {
    if (pendingStart === null) {
      pendingStart = minutes;
      renderPicker();
      return;
    }
    toggleSelectedRange(pendingStart, minutes);
  }

  async function loadCurrentSchedule() {
    if (!user) return;
    pendingStart = null;
    resetSlots();

    if (activeLocation === '서울' && !activeServiceArea) {
      renderPicker();
      setDirty(false);
      return;
    }

    let query = client.from('availability')
      .select('day_of_week,start_time,end_time')
      .eq('teacher_id', user.id)
      .eq('location', activeLocation);
    query = activeLocation === '서울' ? query.eq('service_area', activeServiceArea) : query.is('service_area', null);

    const { data, error } = await query.order('day_of_week').order('start_time');
    if (error) return showToast('스케줄을 불러오지 못했습니다.', 'Could not load your schedule.', 'error');

    (data || []).forEach(row => {
      const day = Number(row.day_of_week);
      const start = Math.max(TIME_START, timeToMinutes(row.start_time));
      const end = Math.min(TIME_END, timeToMinutes(row.end_time));
      if (day < 0 || day > 6 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      for (let minutes = start; minutes < end; minutes += STEP) slotsByDay[day].add(minutes);
    });

    renderPicker();
    setDirty(false);
  }

  function rangesFromSlots(day) {
    const sorted = [...slotsByDay[day]].sort((a, b) => a - b);
    if (!sorted.length) return [];
    const ranges = [];
    let start = sorted[0];
    let previous = sorted[0];

    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      if (current !== previous + STEP) {
        ranges.push({ start, end: previous + STEP });
        start = current;
      }
      previous = current;
    }
    ranges.push({ start, end: Math.min(TIME_END, previous + STEP) });
    return ranges;
  }

  function allRangesPayload() {
    const rows = [];
    for (let day = 0; day < 7; day += 1) {
      rangesFromSlots(day).forEach(range => rows.push({
        teacher_id: user.id,
        day_of_week: day,
        start_time: minutesToTime(range.start),
        end_time: minutesToTime(range.end),
        location: activeLocation,
        service_area: activeLocation === '서울' ? activeServiceArea : null,
        memo: ''
      }));
    }
    return rows;
  }

  async function saveCurrentSchedule() {
    if (!user) return;
    if (activeLocation === '서울' && !activeServiceArea) {
      return showToast('먼저 가능한 서울 지역을 선택해주세요.', 'Select at least one Seoul area first.', 'error');
    }
    if (pendingStart !== null) {
      return showToast('끝 시간을 선택해서 시간 범위를 완성해주세요.', 'Choose an end time to complete the range.', 'error');
    }

    const button = $('saveScheduleButton');
    if (button) {
      button.disabled = true;
      button.textContent = tr('저장 중...', 'Saving...');
    }

    try {
      let del = client.from('availability').delete().eq('teacher_id', user.id).eq('location', activeLocation);
      del = activeLocation === '서울' ? del.eq('service_area', activeServiceArea) : del.is('service_area', null);
      const { error: deleteError } = await del;
      if (deleteError) throw deleteError;

      const payload = allRangesPayload();
      if (payload.length) {
        const { error: insertError } = await client.from('availability').insert(payload);
        if (insertError) throw insertError;
      }

      setDirty(false);
      showToast('가능 시간이 저장되었습니다.', 'Availability saved.');
    } catch (error) {
      console.error(error);
      showToast('저장에 실패했습니다.', 'Failed to save.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = tr('저장', 'Save');
      }
    }
  }

  async function setAreaAvailable(input) {
    const area = input.value;
    const info = catalog.find(item => item.code === area);
    const label = info ? areaLabel(info) : area;
    input.disabled = true;

    try {
      if (input.checked) {
        const { data: existing, error: existingError } = await client.from('teacher_service_areas')
          .select('id').eq('teacher_id', user.id).eq('region', 'Seoul').eq('area', area).limit(1);
        if (existingError) throw existingError;
        if (existing?.length) {
          const { error } = await client.from('teacher_service_areas').update({ active: true }).eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await client.from('teacher_service_areas').insert({ teacher_id: user.id, region: 'Seoul', area, active: true });
          if (error) throw error;
        }
        activeServiceArea = area;
      } else {
        const confirmed = window.confirm(tr(
          `${label}을(를) 가능 지역에서 제거하면 해당 지역의 저장된 시간도 삭제됩니다. 제거할까요?`,
          `Removing ${label} will also delete its saved availability. Remove it?`
        ));
        if (!confirmed) {
          input.checked = true;
          return;
        }
        const { error } = await client.from('teacher_service_areas').delete()
          .eq('teacher_id', user.id).eq('region', 'Seoul').eq('area', area);
        if (error) throw error;
        const { error: scheduleError } = await client.from('availability').delete()
          .eq('teacher_id', user.id).eq('location', '서울').eq('service_area', area);
        if (scheduleError) throw scheduleError;
        if (activeServiceArea === area) activeServiceArea = '';
      }

      await loadCatalogAndAreas();
      await loadCurrentSchedule();
    } catch (error) {
      input.checked = !input.checked;
      showToast('가능 지역 변경에 실패했습니다.', 'Could not update available areas.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  function applyLanguage() {
    const intro = document.querySelector('#page-schedule .page-intro > div');
    if (intro) {
      const heading = intro.querySelector('h2');
      const copy = intro.querySelector('p:not(.section-kicker)');
      if (heading) heading.textContent = tr('수업 가능 스케줄', 'Teaching Availability');
      if (copy) copy.textContent = tr('가능 장소와 수업 가능한 시간대를 등록해주세요.', 'Choose where and when you are available to teach.');
    }

    const locationLabel = document.querySelector('label[for="scheduleLocation"]');
    if (locationLabel) locationLabel.textContent = tr('가능 장소', 'Available Location');
    const select = $('scheduleLocation');
    if (select) {
      const current = select.value || activeLocation;
      select.innerHTML = LOCATION_OPTIONS.map(([value, ko, en]) => `<option value="${escapeHtml(value)}">${escapeHtml(tr(ko, en))}</option>`).join('');
      select.value = current;
    }

    if ($('nadoSeoulAreaTitle')) $('nadoSeoulAreaTitle').textContent = tr('서울 가능 지역', 'Available Seoul Areas');
    if ($('nadoSeoulAreaCopy')) $('nadoSeoulAreaCopy').textContent = tr('수업할 수 있는 지역을 모두 선택해주세요.', 'Select every area where you can teach.');
    if ($('nadoAreaEditorLabel')) $('nadoAreaEditorLabel').textContent = tr('시간 설정 지역', 'Area for Time Setting');
    if ($('nadoAreaEditorEmpty')) $('nadoAreaEditorEmpty').textContent = tr('가능한 서울 지역을 먼저 선택해주세요.', 'Select an available Seoul area first.');
    if ($('nadoTimeTitle')) $('nadoTimeTitle').textContent = tr('가능한 시간대를 선택해주세요', 'Select your available times');
    if ($('nadoTimeCopy')) $('nadoTimeCopy').textContent = tr('처음 시간과 끝 시간을 누르면 그 사이가 한 번에 선택됩니다.', 'Tap the first and last time to select the full range.');
    if ($('clearScheduleButton')) $('clearScheduleButton').textContent = tr('시간 초기화', 'Clear Times');
    if ($('saveScheduleButton') && !$('saveScheduleButton').disabled) $('saveScheduleButton').textContent = tr('저장', 'Save');

    renderLocationButtons();
    renderAreaGrid();
    renderAreaEditor();
    renderPicker();
  }

  function installUi() {
    const select = $('scheduleLocation');
    if (!select || $('nadoScheduleV5')) return false;
    const field = select.closest('.schedule-preference-field');
    const formPanel = field?.closest('.schedule-form-panel');
    const formHead = formPanel?.querySelector('.form-section-head');
    if (!field || !formPanel || !formHead) return false;

    formPanel.insertBefore(field, formHead);
    document.querySelector('#page-schedule .availability-picker')?.setAttribute('hidden', '');
    document.querySelector('#page-schedule .current-slots-panel')?.setAttribute('hidden', '');
    const memoGroup = $('scheduleMemo')?.closest('.field-group');
    if (memoGroup) memoGroup.hidden = true;
    const notice = document.querySelector('#page-schedule .location-assignment-notice');
    if (notice) notice.hidden = true;

    const locationUi = document.createElement('div');
    locationUi.id = 'nadoScheduleV5';
    locationUi.innerHTML = `
      <div id="nadoLocationButtons" class="nado-v5-location-buttons"></div>
      <div id="nadoSeoulAreaPanel" class="nado-v5-seoul" hidden>
        <strong id="nadoSeoulAreaTitle">서울 가능 지역</strong>
        <p id="nadoSeoulAreaCopy">수업할 수 있는 지역을 모두 선택해주세요.</p>
        <div id="nadoServiceAreaGrid" class="nado-v5-area-grid"></div>
        <div id="nadoAreaEditorWrap" class="nado-v5-area-editor">
          <label id="nadoAreaEditorLabel" for="nadoAreaEditorSelect">시간 설정 지역</label>
          <select id="nadoAreaEditorSelect"></select>
          <p id="nadoAreaEditorEmpty" class="nado-v5-empty" hidden>가능한 서울 지역을 먼저 선택해주세요.</p>
        </div>
      </div>`;
    field.appendChild(locationUi);

    formHead.innerHTML = `<div><h3 id="nadoTimeTitle">가능한 시간대를 선택해주세요</h3><p id="nadoTimeCopy">처음 시간과 끝 시간을 누르면 그 사이가 한 번에 선택됩니다.</p></div>`;
    const picker = document.createElement('div');
    picker.className = 'nado-v5-picker';
    picker.innerHTML = `<div id="nadoDayTabs" class="nado-v5-days"></div><div id="nadoTimeGrid" class="nado-v5-time-grid"></div><div id="nadoRangeStatus" class="nado-v5-range-status"></div>`;
    formHead.insertAdjacentElement('afterend', picker);

    const style = document.createElement('style');
    style.id = 'nadoScheduleV5Styles';
    style.textContent = `
      #page-schedule .availability-picker[hidden],#page-schedule .current-slots-panel[hidden]{display:none!important}
      #page-schedule .schedule-layout{display:block!important}
      #page-schedule .schedule-form-panel{max-width:100%!important}
      #page-schedule .schedule-preference-field{margin:0 0 28px;padding:22px;border:1px solid #dde6f0;border-radius:18px;background:#f8fbff}
      #page-schedule .schedule-preference-field>label{display:block;margin-bottom:12px;font-size:1.15rem;font-weight:850;color:#101828}
      #page-schedule #scheduleLocation{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      #page-schedule .location-assignment-notice{display:none!important}
      #page-schedule .form-section-head{margin:0 0 18px}
      #page-schedule .form-section-head h3{font-size:1.45rem;line-height:1.25;margin:0;color:#101828}
      #page-schedule .form-section-head p{margin:8px 0 0;font-size:1rem;line-height:1.55;color:#7b8794}
      .nado-v5-location-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .nado-v5-location-button{min-height:66px;padding:14px 18px;border:1px solid #d3deeb;border-radius:16px;background:#fff;color:#1f2937;font-size:1.04rem;font-weight:850;cursor:pointer}
      .nado-v5-location-button.active{border-color:#2f6feb;background:#2f6feb;color:#fff;box-shadow:0 8px 18px rgba(47,111,235,.18)}
      .nado-v5-seoul{margin-top:26px;padding-top:22px;border-top:1px solid #dde6f0}
      .nado-v5-seoul>strong{display:block;font-size:1.18rem;color:#101828}.nado-v5-seoul>p{margin:7px 0 15px;color:#667085;font-size:.98rem}
      .nado-v5-area-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .nado-v5-area-chip input{position:absolute;opacity:0;pointer-events:none}
      .nado-v5-area-chip span{display:grid;place-items:center;min-height:52px;padding:9px 10px;border:1px solid #d4dfed;border-radius:13px;background:#fff;color:#344054;font-size:.95rem;font-weight:780;text-align:center;cursor:pointer}
      .nado-v5-area-chip input:checked+span{background:#4a90e2;color:#fff;border-color:#4a90e2}
      .nado-v5-area-editor{margin-top:18px}.nado-v5-area-editor>label{display:block;margin-bottom:7px;font-weight:800;color:#344054}.nado-v5-area-editor select{width:100%;min-height:48px;padding:0 13px;border:1px solid #d4dfed;border-radius:11px;background:#fff;font-size:16px}.nado-v5-empty{margin:8px 0 0;color:#667085}
      .nado-v5-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-bottom:24px}
      .nado-v5-day{position:relative;min-height:58px;border:1px solid #dfe6ef;border-radius:14px;background:#fff;color:#111;font-size:1rem;font-weight:850;cursor:pointer}.nado-v5-day.active{border:2px solid #4a90e2;background:#eaf5ff;color:#3275c9}.nado-v5-day b{position:absolute;right:-7px;top:-10px;display:grid;place-items:center;min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:#4a90e2;color:#fff;font-size:.75rem}
      .nado-v5-time-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px 14px}
      .nado-v5-time{min-height:56px;border:1px solid #e0e7ef;border-radius:14px;background:#f8fafc;color:#111;font-size:1rem;font-weight:820;cursor:pointer}.nado-v5-time.selected{border-color:#4a90e2;background:#4a90e2;color:#fff}.nado-v5-time.pending{border-color:#2563eb;background:#dceeff;color:#1f66bd;box-shadow:0 0 0 3px rgba(74,144,226,.14)}.nado-v5-time.end-boundary{background:#fff}
      .nado-v5-range-status{min-height:44px;margin-top:18px;color:#7b8794;font-size:.94rem;line-height:1.5}.nado-v5-range-status.pending{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:12px;background:#eef6ff;color:#3c6fa8}.nado-v5-range-status.pending strong{color:#245f9f}
      #page-schedule .schedule-actions{margin-top:22px}
      @media(max-width:700px){
        #page-schedule{padding-bottom:92px}#page-schedule .page-intro{margin-bottom:22px}#page-schedule .page-intro h2{font-size:1.75rem!important;line-height:1.18}#page-schedule #scheduleSaveState{display:none}
        #page-schedule .schedule-form-panel{padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important}#page-schedule .schedule-preference-field{margin:0 0 28px;padding:0;border:0;border-radius:0;background:transparent}
        .nado-v5-location-buttons{gap:8px}.nado-v5-location-button{min-height:54px;padding:10px 7px;border-radius:12px;font-size:.9rem}.nado-v5-seoul{margin-top:24px;padding-top:0;border-top:0}.nado-v5-area-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.nado-v5-area-chip span{min-height:47px;padding:8px 6px;border-radius:11px;font-size:.88rem}
        .nado-v5-days{display:flex;overflow-x:auto;gap:8px;margin:0 -2px 18px;padding:2px 2px 8px;scrollbar-width:none}.nado-v5-days::-webkit-scrollbar{display:none}.nado-v5-day{flex:0 0 58px;min-height:50px;border-radius:12px;font-size:.9rem}.nado-v5-day b{right:-4px;top:-7px;min-width:22px;height:22px;font-size:.68rem}
        .nado-v5-time-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nado-v5-time{min-height:52px;border-radius:11px;font-size:.93rem}.nado-v5-range-status{margin-top:14px;font-size:.9rem}.nado-v5-range-status.pending{display:block}
        #page-schedule .schedule-actions{position:fixed!important;z-index:70;left:0;right:0;bottom:0;display:grid!important;grid-template-columns:1fr 1.3fr;gap:8px;margin:0!important;padding:11px 14px calc(11px + env(safe-area-inset-bottom));border-top:1px solid #e5eaf0;background:rgba(255,255,255,.96);box-shadow:0 -8px 24px rgba(22,50,79,.08);backdrop-filter:blur(12px)}#page-schedule .schedule-actions .button{width:100%!important;min-width:0!important;min-height:49px;border-radius:11px;font-size:.96rem}
      }
      @media(max-width:420px){.nado-v5-time-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
    applyLanguage();
    return true;
  }

  async function switchLocation(nextLocation) {
    if (nextLocation === activeLocation) return;
    if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 장소를 바꿀까요?', 'You have unsaved time changes. Switch locations?'))) {
      renderLocationButtons();
      return;
    }
    activeLocation = nextLocation;
    pendingStart = null;
    const select = $('scheduleLocation');
    if (select) select.value = activeLocation;
    renderLocationButtons();
    await loadCatalogAndAreas();
    await loadCurrentSchedule();
  }

  function installEvents() {
    document.addEventListener('click', event => {
      const locationButton = event.target.closest?.('[data-v5-location]');
      if (locationButton) {
        event.preventDefault(); event.stopImmediatePropagation();
        switchLocation(locationButton.dataset.v5Location); return;
      }
      const dayButton = event.target.closest?.('[data-v5-day]');
      if (dayButton) {
        event.preventDefault();
        activeDay = Number(dayButton.dataset.v5Day); pendingStart = null; renderPicker(); return;
      }
      const timeButton = event.target.closest?.('[data-v5-time]');
      if (timeButton) {
        event.preventDefault(); handleTimeClick(Number(timeButton.dataset.v5Time)); return;
      }
      if (event.target.closest?.('#saveScheduleButton')) {
        event.preventDefault(); event.stopImmediatePropagation(); saveCurrentSchedule(); return;
      }
      if (event.target.closest?.('#clearScheduleButton')) {
        event.preventDefault(); event.stopImmediatePropagation(); resetSlots(); pendingStart = null; setDirty(true); renderPicker();
      }
    }, true);

    document.addEventListener('change', event => {
      const areaCheck = event.target.closest?.('[data-v5-area-check]');
      if (areaCheck) {
        event.stopImmediatePropagation();
        if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 지역 선택을 변경할까요?', 'You have unsaved time changes. Change area selection?'))) {
          areaCheck.checked = !areaCheck.checked; return;
        }
        setAreaAvailable(areaCheck); return;
      }
      if (event.target?.id === 'nadoAreaEditorSelect') {
        event.stopImmediatePropagation();
        const next = event.target.value;
        if (next === activeServiceArea) return;
        if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 지역을 바꿀까요?', 'You have unsaved time changes. Switch areas?'))) {
          event.target.value = activeServiceArea; return;
        }
        activeServiceArea = next; pendingStart = null; loadCurrentSchedule(); return;
      }
      if (event.target?.id === 'scheduleLocation') {
        event.stopImmediatePropagation(); switchLocation(event.target.value);
      }
    }, true);

    document.addEventListener('nado:languagechange', () => setTimeout(applyLanguage, 30));
  }

  async function start() {
    for (let i = 0; i < 40 && !$('scheduleLocation'); i += 1) await new Promise(resolve => setTimeout(resolve, 250));
    if (!installUi()) return;
    installEvents();

    const { data } = await client.auth.getUser();
    user = data?.user || null;
    if (!user) {
      client.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) return;
        user = session.user;
        activeLocation = $('scheduleLocation')?.value || 'IGC';
        loadCatalogAndAreas().then(loadCurrentSchedule);
      });
      return;
    }

    activeLocation = $('scheduleLocation')?.value || 'IGC';
    await loadCatalogAndAreas();
    await loadCurrentSchedule();
    applyLanguage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
