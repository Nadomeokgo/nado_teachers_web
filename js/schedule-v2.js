(() => {
  'use strict';

  const config = window.NADO_CONFIG || {};
  const client = window.supabase?.createClient?.(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  if (!client) return;

  const $ = (id) => document.getElementById(id);
  const LOCATION_OPTIONS = [
    ['IGC', '인천 · IGC'],
    ['트리플스트리트', '인천 · 트리플스트리트'],
    ['송도 내 협의', '인천 · 송도 내 협의'],
    ['서울', '서울']
  ];

  let user = null;
  let activeLocation = 'IGC';
  let activeServiceArea = '';
  let selected = new Set();
  let dirty = false;
  let dragState = null;
  let catalog = [];

  function showToast(message, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => el.classList.remove('show'), 2600);
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

  function setDirty(value = true) {
    dirty = value;
    const state = $('scheduleSaveState');
    if (state) {
      state.textContent = value ? '저장 필요' : '저장됨';
      state.classList.toggle('saved', !value);
    }
  }

  function renderSelection() {
    document.querySelectorAll('#page-schedule [data-availability-key]').forEach((cell) => {
      const on = selected.has(cell.dataset.availabilityKey);
      cell.classList.toggle('selected', on);
      cell.setAttribute('aria-pressed', String(on));
    });
    const count = $('availabilityCellCount');
    if (count) {
      const hours = selected.size / 2;
      count.textContent = `${selected.size}칸 · ${Number.isInteger(hours) ? hours : hours.toFixed(1)}시간`;
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

    if (activeServiceArea && !mineSet.has(activeServiceArea)) activeServiceArea = '';
    if (!activeServiceArea) activeServiceArea = [...mineSet][0] || '';
    renderAreaTabs(mineSet);
  }

  function renderAreaTabs(mineSet = null) {
    if (!mineSet) {
      mineSet = new Set([...document.querySelectorAll('[data-v2-area-check]:checked')].map(el => el.value));
    }
    const tabs = $('nadoAreaScheduleTabs');
    const empty = $('nadoAreaScheduleEmpty');
    if (!tabs || !empty) return;

    const selectedAreas = catalog.filter(a => mineSet.has(a.code));
    tabs.innerHTML = selectedAreas.map(area => `
      <button type="button" class="nado-area-schedule-tab${activeServiceArea === area.code ? ' active' : ''}" data-v2-area-tab="${escapeHtml(area.code)}">${escapeHtml(area.label)}</button>
    `).join('');
    empty.hidden = selectedAreas.length > 0;
    tabs.hidden = selectedAreas.length === 0;

    const title = $('nadoAreaScheduleTitle');
    const active = catalog.find(a => a.code === activeServiceArea);
    if (title) title.textContent = active ? `${active.label} 가능 시간` : '지역별 가능 시간';
  }

  async function loadCurrentSchedule() {
    if (!user) return;
    if (activeLocation === '서울' && !activeServiceArea) {
      selected = new Set();
      renderSelection();
      setDirty(false);
      return;
    }

    let query = client.from('availability')
      .select('day_of_week,start_time,end_time,memo')
      .eq('teacher_id', user.id)
      .eq('location', activeLocation);
    if (activeLocation === '서울') query = query.eq('service_area', activeServiceArea);
    else query = query.is('service_area', null);

    const { data, error } = await query.order('day_of_week').order('start_time');
    if (error) {
      showToast('스케줄을 불러오지 못했습니다.', 'error');
      return;
    }

    selected = new Set();
    (data || []).forEach(row => {
      const start = Math.max(480, Math.ceil(timeToMinutes(row.start_time) / 30) * 30);
      const end = Math.min(1440, timeToMinutes(row.end_time));
      for (let m = start; Number.isFinite(start) && Number.isFinite(end) && m < end; m += 30) {
        selected.add(key(row.day_of_week, m));
      }
    });
    if ($('scheduleMemo')) $('scheduleMemo').value = data?.[0]?.memo || '';
    renderSelection();
    setDirty(false);
    renderAreaTabs();
  }

  async function saveCurrentSchedule() {
    if (!user) return;
    if (activeLocation === '서울' && !activeServiceArea) {
      return showToast('먼저 가능한 서울 지역을 선택해주세요.', 'error');
    }

    const button = $('saveScheduleButton');
    if (button) { button.disabled = true; button.textContent = '저장 중...'; }
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
      const active = catalog.find(a => a.code === activeServiceArea);
      showToast(activeLocation === '서울' && active ? `${active.label} 가능 시간이 저장되었습니다.` : `${activeLocation} 가능 시간이 저장되었습니다.`);
    } catch (error) {
      console.error(error);
      showToast('저장에 실패했습니다: ' + (error?.message || '알 수 없는 오류'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = '스케줄 저장하기'; }
    }
  }

  async function setAreaAvailable(input) {
    const area = input.value;
    input.disabled = true;
    try {
      if (input.checked) {
        const { data: existing } = await client.from('teacher_service_areas')
          .select('id,active').eq('teacher_id', user.id).eq('region','Seoul').eq('area', area).limit(1);
        if (existing?.length) {
          const { error } = await client.from('teacher_service_areas').update({active:true}).eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await client.from('teacher_service_areas').insert({teacher_id:user.id,region:'Seoul',area,active:true});
          if (error) throw error;
        }
        if (!activeServiceArea) activeServiceArea = area;
      } else {
        const { error } = await client.from('teacher_service_areas').delete()
          .eq('teacher_id', user.id).eq('region','Seoul').eq('area', area);
        if (error) throw error;
        const { error: scheduleError } = await client.from('availability').delete()
          .eq('teacher_id', user.id).eq('location','서울').eq('service_area', area);
        if (scheduleError) throw scheduleError;
        if (activeServiceArea === area) activeServiceArea = '';
      }
      await loadCatalogAndAreas();
      await loadCurrentSchedule();
    } catch (error) {
      input.checked = !input.checked;
      showToast('가능 장소 변경에 실패했습니다.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function addCustomArea() {
    const input = $('nadoCustomAreaInput');
    const label = String(input?.value || '').trim().replace(/\s+/g, ' ');
    if (!label) return;
    if (label.length > 10) return showToast('장소명은 10자 이내로 입력해주세요.', 'error');

    const { data, error } = await client.rpc('add_seoul_service_area', { p_label: label });
    if (error) return showToast('장소 항목 추가에 실패했습니다.', 'error');
    const area = Array.isArray(data) ? data[0] : data;
    if (area?.code) {
      const { error: insertError } = await client.from('teacher_service_areas').upsert({
        teacher_id: user.id, region:'Seoul', area:area.code, active:true
      }, { onConflict: 'teacher_id,region,area' });
      if (insertError) return showToast('새 장소 선택 저장에 실패했습니다.', 'error');
      activeServiceArea = area.code;
    }
    if (input) input.value = '';
    await loadCatalogAndAreas();
    await loadCurrentSchedule();
    showToast('새 가능 장소가 추가되었습니다. 이제 이 지역의 시간을 설정해주세요.');
  }

  function installUi() {
    const select = $('scheduleLocation');
    if (!select || $('nadoScheduleV2')) return false;
    select.innerHTML = LOCATION_OPTIONS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
    const label = document.querySelector('label[for="scheduleLocation"]');
    if (label) label.textContent = '가능 장소';
    const notice = document.querySelector('#page-schedule .location-assignment-notice');
    if (notice) notice.innerHTML = '<strong>가능 장소 안내</strong><p>장소별로 가능한 시간이 다르면 서울 지역을 선택한 뒤 각 지역별 가능 시간을 따로 설정해주세요.</p>';

    const field = select.closest('.schedule-preference-field');
    const panel = document.createElement('div');
    panel.id = 'nadoScheduleV2';
    panel.innerHTML = `
      <div id="nadoSeoulAreaPanel" class="nado-v2-panel" hidden>
        <strong>서울 수업 가능 지역</strong>
        <p>가능한 지역을 선택하세요. 각 지역마다 시간을 따로 저장할 수 있습니다.</p>
        <div id="nadoServiceAreaGrid" class="nado-v2-area-grid"></div>
        <div class="nado-v2-custom-row">
          <input id="nadoCustomAreaInput" maxlength="10" placeholder="기타 장소 (10자 이내)">
          <button id="nadoCustomAreaAdd" type="button">항목 추가</button>
        </div>
        <div class="nado-v2-area-schedule">
          <div class="nado-v2-area-heading"><strong id="nadoAreaScheduleTitle">지역별 가능 시간</strong><small>아래 지역을 바꾸면 시간표도 해당 지역 기준으로 바뀝니다.</small></div>
          <div id="nadoAreaScheduleTabs" class="nado-v2-tabs"></div>
          <p id="nadoAreaScheduleEmpty" class="nado-v2-empty">가능한 서울 지역을 먼저 하나 이상 선택해주세요.</p>
        </div>
      </div>`;
    field.appendChild(panel);

    const style = document.createElement('style');
    style.textContent = `
      .nado-v2-panel{margin-top:16px;padding:16px;border:1px solid #dbe7f5;border-radius:14px;background:#f8fbff}
      .nado-v2-panel>p{margin:4px 0 12px;color:#667085;font-size:.88rem}.nado-v2-area-grid{display:flex;flex-wrap:wrap;gap:8px}
      .nado-area-chip{cursor:pointer}.nado-area-chip input{position:absolute;opacity:0;pointer-events:none}.nado-area-chip span,.nado-v2-tabs button{display:block;padding:8px 12px;border:1px solid #d7e2ef;border-radius:999px;background:#fff;font-size:.88rem}
      .nado-area-chip input:checked+span,.nado-v2-tabs button.active{background:#4A90E2;color:#fff;border-color:#4A90E2;font-weight:700}
      .nado-v2-custom-row{display:flex;gap:8px;margin-top:12px}.nado-v2-custom-row input{flex:1;border:1px solid #d7e2ef;border-radius:10px;padding:9px 11px}.nado-v2-custom-row button{border:0;border-radius:10px;background:#4A90E2;color:#fff;font-weight:700;padding:9px 13px}
      .nado-v2-area-schedule{margin-top:18px;padding-top:14px;border-top:1px dashed #ccd8e7}.nado-v2-area-heading{display:flex;flex-direction:column;gap:3px}.nado-v2-area-heading small{color:#667085}.nado-v2-tabs{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.nado-v2-tabs button{cursor:pointer}.nado-v2-empty{font-size:.85rem;color:#667085;margin:10px 0 0}
      #page-schedule .current-slots-panel{display:none}
    `;
    document.head.appendChild(style);
    return true;
  }

  function installEvents() {
    document.addEventListener('click', (event) => {
      const save = event.target.closest?.('#saveScheduleButton');
      if (save) {
        event.preventDefault(); event.stopImmediatePropagation(); saveCurrentSchedule(); return;
      }
      const clear = event.target.closest?.('#clearScheduleButton');
      if (clear) {
        event.preventDefault(); event.stopImmediatePropagation(); selected.clear(); renderSelection(); setDirty(true); return;
      }
      const areaTab = event.target.closest?.('[data-v2-area-tab]');
      if (areaTab) {
        event.preventDefault();
        if (dirty && !confirm('저장하지 않은 시간 변경사항이 있습니다. 지역을 바꾸면 현재 변경사항이 사라집니다. 계속할까요?')) return;
        activeServiceArea = areaTab.dataset.v2AreaTab;
        loadCurrentSchedule(); return;
      }
      if (event.target.closest?.('#nadoCustomAreaAdd')) { event.preventDefault(); addCustomArea(); return; }
      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (cell) {
        event.preventDefault(); event.stopImmediatePropagation();
        setCell(cell.dataset.availabilityKey, !selected.has(cell.dataset.availabilityKey));
      }
    }, true);

    document.addEventListener('change', (event) => {
      const areaCheck = event.target.closest?.('[data-v2-area-check]');
      if (areaCheck) { event.stopImmediatePropagation(); setAreaAvailable(areaCheck); return; }
      if (event.target?.id === 'scheduleLocation') {
        event.stopImmediatePropagation();
        if (dirty && !confirm('저장하지 않은 시간 변경사항이 있습니다. 장소를 바꾸면 현재 변경사항이 사라집니다. 계속할까요?')) {
          event.target.value = activeLocation; return;
        }
        activeLocation = event.target.value;
        $('nadoSeoulAreaPanel').hidden = activeLocation !== '서울';
        loadCatalogAndAreas().then(loadCurrentSchedule);
      }
    }, true);

    document.addEventListener('input', (event) => {
      if (event.target?.id === 'scheduleMemo') setDirty(true);
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (!cell || event.pointerType === 'touch' || event.button !== 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      dragState = { pointerId:event.pointerId, on:!selected.has(cell.dataset.availabilityKey), seen:new Set([cell.dataset.availabilityKey]) };
      setCell(cell.dataset.availabilityKey, dragState.on);
    }, true);
    document.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const cell = document.elementFromPoint(event.clientX,event.clientY)?.closest?.('#page-schedule [data-availability-key]');
      if (!cell || dragState.seen.has(cell.dataset.availabilityKey)) return;
      dragState.seen.add(cell.dataset.availabilityKey); setCell(cell.dataset.availabilityKey, dragState.on);
    }, true);
    document.addEventListener('pointerup', (event) => { if (dragState && event.pointerId === dragState.pointerId) dragState = null; }, true);
  }

  function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  async function start() {
    for (let i=0;i<40 && !$('scheduleLocation');i++) await new Promise(r=>setTimeout(r,250));
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
