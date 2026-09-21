(() => {
  'use strict';

  const config = window.NADO_CONFIG || {};
  const client = window.NADO_SUPABASE_CLIENT || window.supabase?.createClient?.(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  if (!client) return;

  const $ = (id) => document.getElementById(id);
  const LOCATION_OPTIONS = [
    ['IGC', '인천 · IGC', 'Incheon · IGC'],
    ['트리플스트리트', '인천 · 트리플스트리트', 'Incheon · Triple Street'],
    ['송도 내 협의', '인천 · 송도 내 협의', 'Incheon · Songdo'],
    ['서울', '서울', 'Seoul']
  ];

  let user = null;
  let activeLocation = 'IGC';
  let activeServiceArea = '';
  let selected = new Set();
  let dirty = false;
  let dragState = null;
  let catalog = [];

  function isEnglish() {
    return window.NADO_I18N?.getLanguage?.() === 'en';
  }

  function tr(ko, en) {
    return isEnglish() ? en : ko;
  }

  function showToast(ko, en, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = tr(ko, en || ko);
    el.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  function escapeHtml(v = '') {
    return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function timeToMinutes(value) {
    const [h, m] = String(value || '').slice(0, 5).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  }

  function minutesToTime(minutes) {
    if (minutes === 1440) return '24:00';
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }

  function key(day, minutes) { return `${Number(day)}:${Number(minutes)}`; }
  function parseKey(value) {
    const [day, minutes] = String(value).split(':').map(Number);
    return { day, minutes };
  }

  function activeAreaLabel() {
    return catalog.find(a => a.code === activeServiceArea)?.label || activeServiceArea || '';
  }

  function renderLocationButtons() {
    const wrap = $('nadoLocationButtons');
    if (!wrap) return;
    wrap.innerHTML = LOCATION_OPTIONS.map(([value, ko, en]) => `
      <button
        type="button"
        class="nado-v2-location-button${value === activeLocation ? ' active' : ''}"
        data-v2-location="${escapeHtml(value)}"
        aria-pressed="${value === activeLocation}"
      >${escapeHtml(tr(ko, en))}</button>
    `).join('');
  }

  function formatMobileTimeButtons() {
    document.querySelectorAll('#availabilityMobilePicker [data-availability-key]').forEach(button => {
      const { minutes } = parseKey(button.dataset.availabilityKey);
      if (!Number.isFinite(minutes)) return;
      const label = minutesToTime(minutes);
      if (button.textContent !== label) button.textContent = label;
    });
  }

  function setDirty(value = true) {
    dirty = value;
    const state = $('scheduleSaveState');
    if (state) {
      state.textContent = value ? tr('저장 필요', 'Unsaved') : tr('저장됨', 'Saved');
      state.classList.toggle('saved', !value);
    }
  }

  function syncPageCopy() {
    const intro = document.querySelector('#page-schedule .page-intro > div');
    const title = intro?.querySelector('h2');
    const copy = intro?.querySelector('p:not(.section-kicker)');
    if (title) title.textContent = tr('수업 가능 스케줄', 'Teaching Availability');
    if (copy) copy.textContent = tr(
      '가능 장소를 먼저 선택한 뒤, 해당 장소에서 수업 가능한 시간을 등록해주세요.',
      'Choose a location first, then add the times you can teach there.'
    );
  }

  function updateTimeHeading() {
    const formPanel = document.querySelector('#page-schedule .schedule-form-panel');
    const heading = formPanel?.querySelector('.form-section-head h3');
    const copy = formPanel?.querySelector('.form-section-head p');
    const area = activeAreaLabel();
    if (heading) {
      heading.textContent = activeLocation === '서울' && area
        ? tr(`${area} 가능 시간`, `${area} Availability`)
        : tr('가능 시간', 'Available Times');
    }
    if (copy) {
      copy.textContent = activeLocation === '서울' && area
        ? tr(`${area}에서 가능한 시간을 선택해주세요.`, `Select the times you can teach in ${area}.`)
        : tr('선택한 장소에서 가능한 시간을 모두 선택해주세요.', 'Select all times you can teach at this location.');
    }
  }

  function renderSelection() {
    document.querySelectorAll('#page-schedule [data-availability-key]').forEach(cell => {
      const on = selected.has(cell.dataset.availabilityKey);
      cell.classList.toggle('selected', on);
      cell.setAttribute('aria-pressed', String(on));
    });
    const count = $('availabilityCellCount');
    if (count) {
      const hours = selected.size / 2;
      count.textContent = isEnglish()
        ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr selected`
        : `${Number.isInteger(hours) ? hours : hours.toFixed(1)}시간 선택`;
    }
    formatMobileTimeButtons();
  }

  function setCell(value, on) {
    if (selected.has(value) === on) return;
    on ? selected.add(value) : selected.delete(value);
    renderSelection();
    setDirty(true);
  }

  function rowsFromSelection(memo) {
    const grouped = new Map();
    [...selected]
      .map(parseKey)
      .sort((a, b) => a.day - b.day || a.minutes - b.minutes)
      .forEach(({ day, minutes }) => {
        if (!grouped.has(day)) grouped.set(day, []);
        grouped.get(day).push(minutes);
      });

    const rows = [];
    grouped.forEach((times, day) => {
      let start = null;
      times.forEach((minutes, index) => {
        if (start === null) start = minutes;
        const next = times[index + 1];
        if (next !== minutes + 30) {
          rows.push({
            teacher_id: user.id,
            day_of_week: day,
            start_time: minutesToTime(start),
            end_time: minutesToTime(minutes + 30),
            location: activeLocation,
            service_area: activeLocation === '서울' ? activeServiceArea : null,
            memo
          });
          start = null;
        }
      });
    });
    return rows;
  }

  function renderAreaEditor(mineSet) {
    const wrap = $('nadoAreaEditorWrap');
    const select = $('nadoAreaEditorSelect');
    const empty = $('nadoAreaEditorEmpty');
    if (!wrap || !select || !empty) return;

    const availableAreas = catalog.filter(a => mineSet.has(a.code));
    wrap.hidden = activeLocation !== '서울';
    select.hidden = availableAreas.length === 0;
    empty.hidden = availableAreas.length > 0;

    if (!availableAreas.length) {
      activeServiceArea = '';
      updateTimeHeading();
      return;
    }

    if (!availableAreas.some(a => a.code === activeServiceArea)) activeServiceArea = availableAreas[0].code;
    select.innerHTML = availableAreas.map(area => `<option value="${escapeHtml(area.code)}">${escapeHtml(area.label)}</option>`).join('');
    select.value = activeServiceArea;
    updateTimeHeading();
  }

  async function loadCatalogAndAreas() {
    const [{ data: catalogData, error: catalogError }, { data: mine, error: mineError }] = await Promise.all([
      client.rpc('get_seoul_service_area_catalog'),
      client.from('teacher_service_areas').select('area, active').eq('teacher_id', user.id).eq('region', 'Seoul')
    ]);
    if (catalogError || mineError) throw catalogError || mineError;

    catalog = Array.isArray(catalogData) ? catalogData : [];
    const mineSet = new Set((mine || []).filter(row => row.active).map(row => row.area));
    const grid = $('nadoServiceAreaGrid');
    if (grid) {
      grid.innerHTML = catalog.map(area => `
        <label class="nado-area-chip">
          <input type="checkbox" data-v2-area-check value="${escapeHtml(area.code)}" ${mineSet.has(area.code) ? 'checked' : ''}>
          <span>${escapeHtml(area.label)}</span>
        </label>`).join('');
    }
    renderAreaEditor(mineSet);
  }

  async function loadCurrentSchedule() {
    if (!user) return;
    if (activeLocation === '서울' && !activeServiceArea) {
      selected = new Set();
      renderSelection();
      setDirty(false);
      updateTimeHeading();
      return;
    }

    let query = client.from('availability')
      .select('day_of_week,start_time,end_time,memo')
      .eq('teacher_id', user.id)
      .eq('location', activeLocation);

    if (activeLocation === '서울') query = query.eq('service_area', activeServiceArea);
    else query = query.is('service_area', null);

    const { data, error } = await query.order('day_of_week').order('start_time');
    if (error) return showToast('스케줄을 불러오지 못했습니다.', 'Could not load your schedule.', 'error');

    selected = new Set();
    (data || []).forEach(row => {
      const start = Math.max(480, Math.ceil(timeToMinutes(row.start_time) / 30) * 30);
      const end = Math.min(1440, timeToMinutes(row.end_time));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let minutes = start; minutes < end; minutes += 30) selected.add(key(row.day_of_week, minutes));
    });

    if ($('scheduleMemo')) $('scheduleMemo').value = data?.[0]?.memo || '';
    renderSelection();
    setDirty(false);
    updateTimeHeading();
  }

  async function saveCurrentSchedule() {
    if (!user) return;
    if (activeLocation === '서울' && !activeServiceArea) {
      return showToast('먼저 가능한 서울 지역을 선택해주세요.', 'Select at least one available Seoul area first.', 'error');
    }

    const button = $('saveScheduleButton');
    if (button) {
      button.disabled = true;
      button.textContent = tr('저장 중...', 'Saving...');
    }

    try {
      let del = client.from('availability').delete().eq('teacher_id', user.id).eq('location', activeLocation);
      if (activeLocation === '서울') del = del.eq('service_area', activeServiceArea);
      else del = del.is('service_area', null);
      const { error: deleteError } = await del;
      if (deleteError) throw deleteError;

      const rows = rowsFromSelection($('scheduleMemo')?.value.trim() || '');
      if (rows.length) {
        const { error } = await client.from('availability').insert(rows);
        if (error) throw error;
      }

      setDirty(false);
      const area = activeAreaLabel();
      showToast(
        activeLocation === '서울' && area ? `${area} 가능 시간이 저장되었습니다.` : `${activeLocation} 가능 시간이 저장되었습니다.`,
        activeLocation === '서울' && area ? `Availability for ${area} was saved.` : `Availability for ${activeLocation} was saved.`
      );
    } catch (error) {
      console.error(error);
      showToast('저장에 실패했습니다: ' + (error?.message || '알 수 없는 오류'), 'Failed to save: ' + (error?.message || 'Unknown error'), 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = tr('저장', 'Save');
      }
    }
  }

  async function setAreaAvailable(input) {
    const area = input.value;
    const label = catalog.find(a => a.code === area)?.label || area;
    input.disabled = true;

    try {
      if (input.checked) {
        const { data: existing, error: existingError } = await client.from('teacher_service_areas')
          .select('id,active')
          .eq('teacher_id', user.id)
          .eq('region', 'Seoul')
          .eq('area', area)
          .limit(1);
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
          `${label}을(를) 가능 지역에서 제거하면 저장된 시간도 삭제됩니다. 제거할까요?`,
          `Removing ${label} will also delete its saved times. Remove it?`
        ));
        if (!confirmed) {
          input.checked = true;
          return;
        }

        const { error } = await client.from('teacher_service_areas').delete()
          .eq('teacher_id', user.id)
          .eq('region', 'Seoul')
          .eq('area', area);
        if (error) throw error;

        const { error: scheduleError } = await client.from('availability').delete()
          .eq('teacher_id', user.id)
          .eq('location', '서울')
          .eq('service_area', area);
        if (scheduleError) throw scheduleError;
        if (activeServiceArea === area) activeServiceArea = '';
      }

      await loadCatalogAndAreas();
      await loadCurrentSchedule();
    } catch (error) {
      input.checked = !input.checked;
      showToast('가능 장소 변경에 실패했습니다.', 'Could not update available locations.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function addCustomArea() {
    const input = $('nadoCustomAreaInput');
    const label = String(input?.value || '').trim().replace(/\s+/g, ' ');
    if (!label) return;
    if (label.length > 10) {
      return showToast('장소명은 10자 이내로 입력해주세요.', 'Location names must be 10 characters or fewer.', 'error');
    }

    const { data, error } = await client.rpc('add_seoul_service_area', { p_label: label });
    if (error) return showToast('장소 항목 추가에 실패했습니다.', 'Could not add the location.', 'error');

    const area = Array.isArray(data) ? data[0] : data;
    if (area?.code) {
      const { error: insertError } = await client.from('teacher_service_areas').upsert({
        teacher_id: user.id,
        region: 'Seoul',
        area: area.code,
        active: true
      }, { onConflict: 'teacher_id,region,area' });
      if (insertError) return showToast('새 장소 선택 저장에 실패했습니다.', 'Could not save the new location selection.', 'error');
      activeServiceArea = area.code;
    }

    if (input) input.value = '';
    $('nadoCustomAreaRow')?.classList.remove('open');
    $('nadoCustomAreaToggle')?.setAttribute('aria-expanded', 'false');
    await loadCatalogAndAreas();
    await loadCurrentSchedule();
    showToast('새 가능 장소가 추가되었습니다.', 'New available location added.');
  }

  function applyLanguage() {
    syncPageCopy();

    const locationLabel = document.querySelector('label[for="scheduleLocation"]');
    if (locationLabel) locationLabel.textContent = tr('가능 장소', 'Available Location');

    const locationSelect = $('scheduleLocation');
    if (locationSelect) {
      const current = locationSelect.value || activeLocation;
      locationSelect.innerHTML = LOCATION_OPTIONS.map(([value, ko, en]) => `<option value="${escapeHtml(value)}">${escapeHtml(tr(ko, en))}</option>`).join('');
      locationSelect.value = current;
    }
    renderLocationButtons();

    const notice = document.querySelector('#page-schedule .location-assignment-notice');
    if (notice) notice.style.display = 'none';

    if ($('nadoSeoulAreaTitle')) $('nadoSeoulAreaTitle').textContent = tr('서울 가능 지역', 'Available Seoul Areas');
    if ($('nadoSeoulAreaCopy')) $('nadoSeoulAreaCopy').textContent = tr('수업할 수 있는 지역을 모두 선택해주세요.', 'Select every area where you can teach.');
    if ($('nadoCustomAreaInput')) $('nadoCustomAreaInput').placeholder = tr('기타 장소 (10자 이내)', 'Other location (max 10 chars)');
    if ($('nadoCustomAreaToggle')) $('nadoCustomAreaToggle').textContent = tr('+ 기타 장소 추가', '+ Add another location');
    if ($('nadoCustomAreaAdd')) $('nadoCustomAreaAdd').textContent = tr('추가', 'Add');
    if ($('nadoAreaEditorLabel')) $('nadoAreaEditorLabel').textContent = tr('시간 설정 지역', 'Area for Time Setting');
    if ($('nadoAreaEditorEmpty')) $('nadoAreaEditorEmpty').textContent = tr('가능한 서울 지역을 먼저 선택해주세요.', 'Select an available Seoul area first.');

    if ($('clearScheduleButton')) $('clearScheduleButton').textContent = tr('시간 초기화', 'Clear Times');
    if ($('saveScheduleButton') && !$('saveScheduleButton').disabled) $('saveScheduleButton').textContent = tr('저장', 'Save');

    updateTimeHeading();
    renderSelection();
  }

  function installUi() {
    const select = $('scheduleLocation');
    if (!select || $('nadoScheduleV2')) return false;

    const field = select.closest('.schedule-preference-field');
    const formPanel = field?.closest('.schedule-form-panel');
    const formHead = formPanel?.querySelector('.form-section-head');
    if (!field || !formPanel || !formHead) return false;

    formPanel.insertBefore(field, formHead);

    const notice = document.querySelector('#page-schedule .location-assignment-notice');
    if (notice) notice.style.display = 'none';
    const memoGroup = $('scheduleMemo')?.closest('.field-group');
    if (memoGroup) memoGroup.style.display = 'none';

    const panel = document.createElement('div');
    panel.id = 'nadoScheduleV2';
    panel.innerHTML = `
      <div id="nadoLocationButtons" class="nado-v2-location-buttons" aria-label="가능 장소"></div>
      <div id="nadoSeoulAreaPanel" class="nado-v2-panel" hidden>
        <strong id="nadoSeoulAreaTitle">서울 가능 지역</strong>
        <p id="nadoSeoulAreaCopy">수업할 수 있는 지역을 모두 선택해주세요.</p>
        <div id="nadoServiceAreaGrid" class="nado-v2-area-grid"></div>
        <button id="nadoCustomAreaToggle" class="nado-v2-custom-toggle" type="button" aria-expanded="false">+ 기타 장소 추가</button>
        <div id="nadoCustomAreaRow" class="nado-v2-custom-row">
          <input id="nadoCustomAreaInput" maxlength="10" placeholder="기타 장소 (10자 이내)">
          <button id="nadoCustomAreaAdd" type="button">추가</button>
        </div>
        <div id="nadoAreaEditorWrap" class="nado-v2-editor">
          <label id="nadoAreaEditorLabel" for="nadoAreaEditorSelect">시간 설정 지역</label>
          <select id="nadoAreaEditorSelect"></select>
          <p id="nadoAreaEditorEmpty" class="nado-v2-empty" hidden>가능한 서울 지역을 먼저 선택해주세요.</p>
        </div>
      </div>`;
    field.appendChild(panel);

    const style = document.createElement('style');
    style.id = 'nadoScheduleV2Styles';
    style.textContent = `
      #page-schedule .page-intro .section-kicker{display:none}
      #page-schedule .page-intro>div>p:not(.section-kicker){font-size:1.03rem;line-height:1.65;color:#596579;max-width:760px}
      #page-schedule .schedule-preference-field{margin:0 0 22px;padding:18px;border:1px solid #dbe7f5;border-radius:16px;background:#f8fbff}
      #page-schedule .schedule-preference-field>label{display:block;font-size:1rem;font-weight:800;margin-bottom:8px}
      #page-schedule #scheduleLocation{width:100%}
      #page-schedule .location-assignment-notice{display:none!important}
      #page-schedule .availability-legend{display:none!important}
      #page-schedule .availability-picker-head{justify-content:flex-end;margin-bottom:10px}
      #page-schedule .availability-help{display:none!important}
      #page-schedule .current-slots-panel{display:none!important}
      #page-schedule .form-section-head{margin-top:2px}
      #page-schedule .form-section-head p{font-size:1rem;line-height:1.6;color:#596579}
      #page-schedule .schedule-actions{margin-top:18px}
      #page-schedule #clearScheduleButton{min-width:120px}
      #page-schedule #saveScheduleButton{min-width:150px}
      .nado-v2-panel{margin-top:16px;padding-top:16px;border-top:1px solid #dbe7f5}
      .nado-v2-panel>strong{font-size:1rem}
      .nado-v2-panel>p{margin:6px 0 14px;color:#596579;font-size:1rem;line-height:1.55}
      .nado-v2-location-buttons{display:none}
      .nado-v2-area-grid{display:flex;flex-wrap:wrap;gap:8px}
      .nado-area-chip{cursor:pointer}
      .nado-area-chip input{position:absolute;opacity:0;pointer-events:none}
      .nado-area-chip span{display:block;padding:8px 12px;border:1px solid #d7e2ef;border-radius:999px;background:#fff;font-size:.9rem;color:#344054}
      .nado-area-chip input:checked+span{background:#4A90E2;color:#fff;border-color:#4A90E2;font-weight:700}
      .nado-v2-custom-row{display:flex;gap:8px;margin-top:12px}
      .nado-v2-custom-row input{flex:1;min-width:0;border:1px solid #d7e2ef;border-radius:10px;padding:10px 12px;background:#fff}
      .nado-v2-custom-row button{border:0;border-radius:10px;background:#4A90E2;color:#fff;font-weight:700;padding:10px 16px;white-space:nowrap}
      .nado-v2-custom-toggle{display:none;width:100%;margin-top:12px;padding:11px 14px;border:1px solid #4A90E2;border-radius:11px;background:#fff;color:#2e6dc2;font-weight:800}
      .nado-v2-editor{margin-top:16px}
      .nado-v2-editor>label{display:block;font-weight:800;margin-bottom:7px}
      .nado-v2-editor select{width:100%;padding:10px 12px;border:1px solid #d7e2ef;border-radius:10px;background:#fff}
      .nado-v2-empty{font-size:.9rem;color:#667085;margin:8px 0 0}
      @media (max-width:620px){
        #page-schedule{padding-bottom:88px}
        #page-schedule .page-intro{margin-bottom:22px}
        #page-schedule .page-intro h2{font-size:1.9rem;line-height:1.2}
        #page-schedule .page-intro>div>p:not(.section-kicker){font-size:1rem;line-height:1.55}
        #page-schedule #scheduleSaveState{display:none}
        #page-schedule .schedule-form-panel{padding:0;border:0;border-radius:0;box-shadow:none;background:transparent}
        #page-schedule .schedule-preference-field{margin:0 0 26px;padding:0;border:0;border-radius:0;background:transparent}
        #page-schedule .schedule-preference-field>label{margin-bottom:12px;font-size:1.1rem;color:#111827}
        #page-schedule #scheduleLocation{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .nado-v2-location-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .nado-v2-location-button{min-height:48px;padding:10px 8px;border:1px solid #d5deea;border-radius:12px;background:#fff;color:#1f2937;font-size:.9rem;font-weight:750;line-height:1.25}
        .nado-v2-location-button.active{border-color:#2f6feb;background:linear-gradient(135deg,#3277ef,#1f63e9);color:#fff;box-shadow:0 7px 16px rgba(47,111,235,.18)}
        .nado-v2-panel{margin-top:26px;padding-top:0;border-top:0}
        .nado-v2-panel>strong{display:block;margin-bottom:10px;font-size:1.1rem;color:#111827}
        .nado-v2-panel>p{margin:0 0 13px;font-size:.94rem;line-height:1.5}
        .nado-v2-area-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .nado-area-chip span{display:grid;place-items:center;min-height:44px;padding:8px 5px;border-radius:11px;text-align:center;font-size:.84rem;line-height:1.2}
        .nado-v2-custom-toggle{display:block}
        .nado-v2-custom-row{display:none;margin-top:8px}
        .nado-v2-custom-row.open{display:flex}
        .nado-v2-custom-row input{min-height:46px;font-size:16px}
        .nado-v2-custom-row button{min-width:66px}
        .nado-v2-editor{margin-top:24px}
        .nado-v2-editor>label{margin-bottom:10px;font-size:1.1rem;color:#111827}
        .nado-v2-editor select{min-height:50px;padding:12px 14px;border-radius:11px;font-size:16px}
        #page-schedule .form-section-head{margin:0 0 13px}
        #page-schedule .form-section-head h3{font-size:1.1rem}
        #page-schedule .form-section-head p{margin-top:6px;font-size:.94rem;line-height:1.5}
        #page-schedule .availability-picker-head{display:none}
        #page-schedule .availability-mobile-picker{margin-top:0}
        #page-schedule .availability-mobile-days{grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin-bottom:14px}
        #page-schedule .availability-mobile-day{min-height:44px;padding:6px 1px;border-radius:10px;font-size:.78rem}
        #page-schedule .availability-mobile-hours{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        #page-schedule .availability-mobile-hour{display:contents}
        #page-schedule .availability-mobile-hour>strong{display:none}
        #page-schedule .availability-mobile-half-buttons{display:contents}
        #page-schedule .availability-mobile-half-buttons button{min-height:46px;padding:8px 3px;border:1px solid #d5deea;border-radius:10px;background:#fff;color:#1f2937;font-size:.82rem;font-weight:750}
        #page-schedule .availability-mobile-half-buttons button.selected{border-color:#2f6feb;background:linear-gradient(135deg,#3277ef,#1f63e9);color:#fff;box-shadow:0 6px 14px rgba(47,111,235,.16)}
        #page-schedule .schedule-actions{position:fixed;z-index:70;left:0;right:0;bottom:0;display:grid;grid-template-columns:1fr 1.35fr;gap:9px;margin:0;padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #e5eaf0;background:rgba(255,255,255,.96);box-shadow:0 -8px 24px rgba(22,50,79,.08);backdrop-filter:blur(12px)}
        #page-schedule .schedule-actions .button{width:100%;min-width:0;min-height:50px;border-radius:11px;font-size:1rem}
        #page-schedule #clearScheduleButton{order:0;background:#fff;border:1px solid #d5deea}
        #page-schedule #saveScheduleButton{order:1;background:linear-gradient(135deg,#3277ef,#1f63e9)}
      }
      @media (max-width:390px){
        .nado-v2-area-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(style);

    applyLanguage();
    return true;
  }

  function installEvents() {
    document.addEventListener('click', event => {
      const save = event.target.closest?.('#saveScheduleButton');
      if (save) {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveCurrentSchedule();
        return;
      }

      const clear = event.target.closest?.('#clearScheduleButton');
      if (clear) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selected.clear();
        renderSelection();
        setDirty(true);
        return;
      }

      if (event.target.closest?.('#nadoCustomAreaAdd')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        addCustomArea();
        return;
      }

      const customToggle = event.target.closest?.('#nadoCustomAreaToggle');
      if (customToggle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const row = $('nadoCustomAreaRow');
        const willOpen = !row?.classList.contains('open');
        row?.classList.toggle('open', willOpen);
        customToggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) $('nadoCustomAreaInput')?.focus();
        return;
      }

      const locationButton = event.target.closest?.('[data-v2-location]');
      if (locationButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const select = $('scheduleLocation');
        if (!select || locationButton.dataset.v2Location === activeLocation) return;
        select.value = locationButton.dataset.v2Location;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(renderLocationButtons, 0);
        return;
      }

      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (cell) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCell(cell.dataset.availabilityKey, !selected.has(cell.dataset.availabilityKey));
      }
    }, true);

    document.addEventListener('change', event => {
      const areaCheck = event.target.closest?.('[data-v2-area-check]');
      if (areaCheck) {
        event.stopImmediatePropagation();
        setAreaAvailable(areaCheck);
        return;
      }

      if (event.target?.id === 'nadoAreaEditorSelect') {
        event.stopImmediatePropagation();
        if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 지역을 바꿀까요?', 'You have unsaved time changes. Switch areas?'))) {
          event.target.value = activeServiceArea;
          return;
        }
        activeServiceArea = event.target.value;
        loadCurrentSchedule();
        return;
      }

      if (event.target?.id === 'scheduleLocation') {
        event.stopImmediatePropagation();
        if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 장소를 바꿀까요?', 'You have unsaved time changes. Switch locations?'))) {
          event.target.value = activeLocation;
          return;
        }
        activeLocation = event.target.value;
        renderLocationButtons();
        $('nadoSeoulAreaPanel').hidden = activeLocation !== '서울';
        loadCatalogAndAreas().then(loadCurrentSchedule);
      }
    }, true);

    document.addEventListener('pointerdown', event => {
      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (!cell || event.pointerType === 'touch' || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dragState = {
        pointerId: event.pointerId,
        on: !selected.has(cell.dataset.availabilityKey),
        seen: new Set([cell.dataset.availabilityKey])
      };
      setCell(cell.dataset.availabilityKey, dragState.on);
    }, true);

    document.addEventListener('pointermove', event => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('#page-schedule [data-availability-key]');
      if (!cell || dragState.seen.has(cell.dataset.availabilityKey)) return;
      dragState.seen.add(cell.dataset.availabilityKey);
      setCell(cell.dataset.availabilityKey, dragState.on);
    }, true);

    document.addEventListener('pointerup', event => {
      if (dragState && event.pointerId === dragState.pointerId) dragState = null;
    }, true);

    document.addEventListener('nado:languagechange', () => {
      setTimeout(() => {
        applyLanguage();
        renderSelection();
      }, 30);
    });

    const mobilePicker = $('availabilityMobilePicker');
    if (mobilePicker) {
      new MutationObserver(() => formatMobileTimeButtons()).observe(mobilePicker, { childList: true, subtree: true });
    }
  }

  async function start() {
    for (let i = 0; i < 40 && !$('scheduleLocation'); i += 1) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!installUi()) return;
    installEvents();

    const { data } = await client.auth.getUser();
    user = data?.user || null;

    if (!user) {
      client.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) return;
        user = session.user;
        activeLocation = $('scheduleLocation')?.value || 'IGC';
        $('nadoSeoulAreaPanel').hidden = activeLocation !== '서울';
        loadCatalogAndAreas().then(loadCurrentSchedule);
      });
      return;
    }

    activeLocation = $('scheduleLocation')?.value || 'IGC';
    $('nadoSeoulAreaPanel').hidden = activeLocation !== '서울';
    await loadCatalogAndAreas();
    await loadCurrentSchedule();
    applyLanguage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
