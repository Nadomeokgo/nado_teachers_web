(() => {
  'use strict';

  const config = window.NADO_CONFIG || {};
  const client = window.NADO_SUPABASE_CLIENT || window.supabase?.createClient?.(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  if (!client) return;

  const $ = (id) => document.getElementById(id);
  const LOCATION_OPTIONS = [
    ['IGC', '인천 · IGC', 'Incheon · IGC'],
    ['트리플스트리트', '인천 · 트리플스트리트', 'Incheon · Triple Street'],
    ['송도 내 협의', '인천 · 송도 내 협의', 'Incheon · Songdo (coordinate later)'],
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
    return String(v).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
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

  function setDirty(value = true) {
    dirty = value;
    const state = $('scheduleSaveState');
    if (state) {
      state.textContent = value ? tr('저장 필요', 'Unsaved') : tr('저장됨', 'Saved');
      state.classList.toggle('saved', !value);
    }
  }

  function updateTimeHeading() {
    const formPanel = document.querySelector('#page-schedule .schedule-form-panel');
    const heading = formPanel?.querySelector('.form-section-head h3');
    const copy = formPanel?.querySelector('.form-section-head p');
    const area = activeAreaLabel();
    if (heading) heading.textContent = activeLocation === '서울' && area ? tr(`${area} 가능 시간 선택`, `Select availability for ${area}`) : tr('가능 시간 선택', 'Select available times');
    if (copy) copy.textContent = activeLocation === '서울' && area
      ? tr(`${area}에서 수업 가능한 모든 시간 칸을 선택한 뒤 저장해주세요.`, `Select every time you can teach in ${area}, then save.`)
      : tr('현재 선택한 장소에서 수업 가능한 모든 시간 칸을 선택한 뒤 저장해주세요.', 'Select every time you can teach at the selected location, then save.');
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
        ? `${selected.size} slots · ${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`
        : `${selected.size}칸 · ${Number.isInteger(hours) ? hours : hours.toFixed(1)}시간`;
    }
  }

  function setCell(value, on) {
    if (selected.has(value) === on) return;
    on ? selected.add(value) : selected.delete(value);
    renderSelection();
    setDirty(true);
  }

  function rowsFromSelection(memo) {
    const grouped = new Map();
    [...selected].map(parseKey).sort((a,b) => a.day-b.day || a.minutes-b.minutes).forEach(({day, minutes}) => {
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
    const mineSet = new Set((mine || []).filter(r => r.active).map(r => r.area));
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
      for (let m = start; m < end; m += 30) selected.add(key(row.day_of_week, m));
    });
    if ($('scheduleMemo')) $('scheduleMemo').value = data?.[0]?.memo || '';
    renderSelection();
    setDirty(false);
    updateTimeHeading();
  }

  async function saveCurrentSchedule() {
    if (!user) return;
    if (activeLocation === '서울' && !activeServiceArea) return showToast('먼저 가능한 서울 지역을 선택해주세요.', 'Select at least one available Seoul area first.', 'error');
    const button = $('saveScheduleButton');
    if (button) { button.disabled = true; button.textContent = tr('저장 중...', 'Saving...'); }
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
      showToast(activeLocation === '서울' && area ? `${area} 가능 시간이 저장되었습니다.` : `${activeLocation} 가능 시간이 저장되었습니다.`, activeLocation === '서울' && area ? `Availability for ${area} was saved.` : `Availability for ${activeLocation} was saved.`);
    } catch (error) {
      console.error(error);
      showToast('저장에 실패했습니다: ' + (error?.message || '알 수 없는 오류'), 'Failed to save: ' + (error?.message || 'Unknown error'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = tr('스케줄 저장하기', 'Save Schedule'); }
    }
  }

  async function setAreaAvailable(input) {
    const area = input.value;
    const label = catalog.find(a => a.code === area)?.label || area;
    input.disabled = true;
    try {
      if (input.checked) {
        const { data: existing, error: existingError } = await client.from('teacher_service_areas').select('id,active').eq('teacher_id', user.id).eq('region','Seoul').eq('area', area).limit(1);
        if (existingError) throw existingError;
        if (existing?.length) {
          const { error } = await client.from('teacher_service_areas').update({active:true}).eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await client.from('teacher_service_areas').insert({teacher_id:user.id,region:'Seoul',area,active:true});
          if (error) throw error;
        }
        activeServiceArea = area;
      } else {
        const confirmed = window.confirm(tr(`${label}을(를) 가능 지역에서 제거하면 이 지역에 저장된 시간도 삭제됩니다. 제거할까요?`, `Removing ${label} will also delete the saved times for this area. Remove it?`));
        if (!confirmed) { input.checked = true; return; }
        const { error } = await client.from('teacher_service_areas').delete().eq('teacher_id', user.id).eq('region','Seoul').eq('area', area);
        if (error) throw error;
        const { error: scheduleError } = await client.from('availability').delete().eq('teacher_id', user.id).eq('location','서울').eq('service_area', area);
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
    if (label.length > 10) return showToast('장소명은 10자 이내로 입력해주세요.', 'Location names must be 10 characters or fewer.', 'error');
    const { data, error } = await client.rpc('add_seoul_service_area', { p_label: label });
    if (error) return showToast('장소 항목 추가에 실패했습니다.', 'Could not add the location.', 'error');
    const area = Array.isArray(data) ? data[0] : data;
    if (area?.code) {
      const { error: insertError } = await client.from('teacher_service_areas').upsert({ teacher_id: user.id, region:'Seoul', area:area.code, active:true }, { onConflict: 'teacher_id,region,area' });
      if (insertError) return showToast('새 장소 선택 저장에 실패했습니다.', 'Could not save the new location selection.', 'error');
      activeServiceArea = area.code;
    }
    if (input) input.value = '';
    await loadCatalogAndAreas();
    await loadCurrentSchedule();
    showToast('새 가능 장소가 추가되었습니다. 이제 이 지역의 시간을 설정해주세요.', 'The new location was added. Set your available times for this area.');
  }

  function applyLanguage() {
    const locationLabel = document.querySelector('label[for="scheduleLocation"]');
    if (locationLabel) locationLabel.textContent = tr('가능 장소', 'Available Location');
    const locationSelect = $('scheduleLocation');
    if (locationSelect) {
      const current = locationSelect.value || activeLocation;
      locationSelect.innerHTML = LOCATION_OPTIONS.map(([value, ko, en]) => `<option value="${escapeHtml(value)}">${escapeHtml(tr(ko, en))}</option>`).join('');
      locationSelect.value = current;
    }
    const notice = document.querySelector('#page-schedule .location-assignment-notice');
    if (notice) notice.innerHTML = `<strong>${tr('가능 장소 안내','Available location')}</strong><p>${tr('장소별로 가능한 시간이 다르면 서울을 선택한 뒤 각 지역의 시간을 따로 설정해주세요.','If your availability differs by location, choose Seoul and set the times for each area separately.')}</p>`;
    if ($('nadoSeoulAreaTitle')) $('nadoSeoulAreaTitle').textContent = tr('서울 수업 가능 지역', 'Available Seoul Areas');
    if ($('nadoSeoulAreaCopy')) $('nadoSeoulAreaCopy').textContent = tr('수업 가능한 지역을 모두 선택하세요. 선택한 지역은 모든 선생님이 사용하는 공용 장소 목록을 기준으로 합니다.', 'Select every area where you can teach. The list is shared across all Teachers accounts.');
    if ($('nadoCustomAreaInput')) $('nadoCustomAreaInput').placeholder = tr('기타 장소 (10자 이내)', 'Other location (max 10 chars)');
    if ($('nadoCustomAreaAdd')) $('nadoCustomAreaAdd').textContent = tr('항목 추가', 'Add Location');
    if ($('nadoAreaEditorLabel')) $('nadoAreaEditorLabel').textContent = tr('시간을 설정할 지역', 'Area to Set Times For');
    if ($('nadoAreaEditorEmpty')) $('nadoAreaEditorEmpty').textContent = tr('가능한 서울 지역을 먼저 하나 이상 선택해주세요.', 'Select at least one available Seoul area first.');
    if ($('nadoAreaEditorHelp')) $('nadoAreaEditorHelp').textContent = tr('지역을 바꾸면 아래 시간표가 해당 지역 기준으로 바뀝니다.', 'Changing the area updates the timetable below for that area.');
    const memoLabel = document.querySelector('label[for="scheduleMemo"]');
    if (memoLabel) memoLabel.textContent = tr('운영팀에 전달할 메모', 'Note for NADO Operations');
    if ($('scheduleMemo')) $('scheduleMemo').placeholder = tr('예: 시험 기간에는 일정이 변경될 수 있습니다.', 'e.g. My availability may change during exam periods.');
    if ($('clearScheduleButton')) $('clearScheduleButton').textContent = tr('전체 삭제', 'Clear Times');
    if ($('saveScheduleButton') && !$('saveScheduleButton').disabled) $('saveScheduleButton').textContent = tr('스케줄 저장하기', 'Save Schedule');
    const legend = document.querySelector('#page-schedule .availability-legend');
    if (legend) {
      const spans = legend.querySelectorAll('span');
      if (spans[0]) spans[0].lastChild.textContent = tr(' 선택 가능', ' Available');
      if (spans[1]) spans[1].lastChild.textContent = tr(' 선택됨', ' Selected');
    }
    const desktopHelp = document.querySelector('#page-schedule .desktop-schedule-help');
    const mobileHelp = document.querySelector('#page-schedule .mobile-schedule-help');
    if (desktopHelp) desktopHelp.textContent = tr('PC에서는 시작 칸을 누른 채 드래그해 선택할 수 있습니다.', 'On desktop, click and drag across the time cells.');
    if (mobileHelp) mobileHelp.textContent = tr('모바일에서는 먼저 요일을 선택한 뒤, 한 시간 안의 :00 / :30 버튼을 탭해주세요.', 'On mobile, choose a day first, then tap the :00 / :30 buttons.');
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
    const panel = document.createElement('div');
    panel.id = 'nadoScheduleV2';
    panel.innerHTML = `
      <div id="nadoSeoulAreaPanel" class="nado-v2-panel" hidden>
        <strong id="nadoSeoulAreaTitle">서울 수업 가능 지역</strong>
        <p id="nadoSeoulAreaCopy">수업 가능한 지역을 모두 선택하세요.</p>
        <div id="nadoServiceAreaGrid" class="nado-v2-area-grid"></div>
        <div class="nado-v2-custom-row">
          <input id="nadoCustomAreaInput" maxlength="10" placeholder="기타 장소 (10자 이내)">
          <button id="nadoCustomAreaAdd" type="button">항목 추가</button>
        </div>
        <div id="nadoAreaEditorWrap" class="nado-v2-editor">
          <label id="nadoAreaEditorLabel" for="nadoAreaEditorSelect">시간을 설정할 지역</label>
          <select id="nadoAreaEditorSelect"></select>
          <p id="nadoAreaEditorHelp">지역을 바꾸면 아래 시간표가 해당 지역 기준으로 바뀝니다.</p>
          <p id="nadoAreaEditorEmpty" class="nado-v2-empty" hidden>가능한 서울 지역을 먼저 하나 이상 선택해주세요.</p>
        </div>
      </div>`;
    field.appendChild(panel);
    const style = document.createElement('style');
    style.id = 'nadoScheduleV2Styles';
    style.textContent = `
      #page-schedule .schedule-preference-field{margin:0 0 22px;padding:18px;border:1px solid #dbe7f5;border-radius:16px;background:#f8fbff}
      #page-schedule .schedule-preference-field>label{display:block;font-size:1rem;font-weight:800;margin-bottom:8px}
      #page-schedule #scheduleLocation{width:100%}
      .nado-v2-panel{margin-top:16px;padding-top:16px;border-top:1px solid #dbe7f5}
      .nado-v2-panel>p{margin:4px 0 12px;color:#667085;font-size:.88rem}
      .nado-v2-area-grid{display:flex;flex-wrap:wrap;gap:8px}
      .nado-area-chip{cursor:pointer}.nado-area-chip input{position:absolute;opacity:0;pointer-events:none}
      .nado-area-chip span{display:block;padding:8px 12px;border:1px solid #d7e2ef;border-radius:999px;background:#fff;font-size:.88rem;color:#344054}
      .nado-area-chip input:checked+span{background:#4A90E2;color:#fff;border-color:#4A90E2;font-weight:700}
      .nado-v2-custom-row{display:flex;gap:8px;margin-top:12px}.nado-v2-custom-row input{flex:1;min-width:0;border:1px solid #d7e2ef;border-radius:10px;padding:9px 11px;background:#fff}.nado-v2-custom-row button{border:0;border-radius:10px;background:#4A90E2;color:#fff;font-weight:700;padding:9px 13px;white-space:nowrap}
      .nado-v2-editor{margin-top:16px;padding:14px;border-radius:12px;background:#fff;border:1px solid #d7e2ef}.nado-v2-editor>label{display:block;font-weight:800;margin-bottom:7px}.nado-v2-editor select{width:100%;padding:10px 12px;border:1px solid #d7e2ef;border-radius:10px;background:#fff}.nado-v2-editor>p{margin:7px 0 0;color:#667085;font-size:.8rem}.nado-v2-empty{font-size:.85rem;color:#667085}
      #page-schedule .current-slots-panel{display:none}
    `;
    document.head.appendChild(style);
    applyLanguage();
    return true;
  }

  function installEvents() {
    document.addEventListener('click', event => {
      const save = event.target.closest?.('#saveScheduleButton');
      if (save) { event.preventDefault(); event.stopImmediatePropagation(); saveCurrentSchedule(); return; }
      const clear = event.target.closest?.('#clearScheduleButton');
      if (clear) { event.preventDefault(); event.stopImmediatePropagation(); selected.clear(); renderSelection(); setDirty(true); return; }
      if (event.target.closest?.('#nadoCustomAreaAdd')) { event.preventDefault(); event.stopImmediatePropagation(); addCustomArea(); return; }
      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (cell) { event.preventDefault(); event.stopImmediatePropagation(); setCell(cell.dataset.availabilityKey, !selected.has(cell.dataset.availabilityKey)); }
    }, true);
    document.addEventListener('change', event => {
      const areaCheck = event.target.closest?.('[data-v2-area-check]');
      if (areaCheck) { event.stopImmediatePropagation(); setAreaAvailable(areaCheck); return; }
      if (event.target?.id === 'nadoAreaEditorSelect') {
        event.stopImmediatePropagation();
        if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 지역을 바꿀까요?', 'You have unsaved time changes. Switch areas?'))) { event.target.value = activeServiceArea; return; }
        activeServiceArea = event.target.value; loadCurrentSchedule(); return;
      }
      if (event.target?.id === 'scheduleLocation') {
        event.stopImmediatePropagation();
        if (dirty && !window.confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 장소를 바꿀까요?', 'You have unsaved time changes. Switch locations?'))) { event.target.value = activeLocation; return; }
        activeLocation = event.target.value;
        $('nadoSeoulAreaPanel').hidden = activeLocation !== '서울';
        loadCatalogAndAreas().then(loadCurrentSchedule);
      }
    }, true);
    document.addEventListener('input', event => { if (event.target?.id === 'scheduleMemo') setDirty(true); }, true);
    document.addEventListener('pointerdown', event => {
      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (!cell || event.pointerType === 'touch' || event.button !== 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      dragState = { pointerId:event.pointerId, on:!selected.has(cell.dataset.availabilityKey), seen:new Set([cell.dataset.availabilityKey]) };
      setCell(cell.dataset.availabilityKey, dragState.on);
    }, true);
    document.addEventListener('pointermove', event => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const cell = document.elementFromPoint(event.clientX,event.clientY)?.closest?.('#page-schedule [data-availability-key]');
      if (!cell || dragState.seen.has(cell.dataset.availabilityKey)) return;
      dragState.seen.add(cell.dataset.availabilityKey); setCell(cell.dataset.availabilityKey, dragState.on);
    }, true);
    document.addEventListener('pointerup', event => { if (dragState && event.pointerId === dragState.pointerId) dragState = null; }, true);
    document.addEventListener('nado:languagechange', () => setTimeout(() => { applyLanguage(); renderSelection(); }, 30));
  }

  async function start() {
    for (let i = 0; i < 40 && !$('scheduleLocation'); i += 1) await new Promise(r => setTimeout(r, 250));
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
