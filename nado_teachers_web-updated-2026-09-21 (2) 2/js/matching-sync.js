(() => {
  'use strict';

  const SEOUL_AREAS = [
    ['Gangnam', '강남'],
    ['Seocho', '서초'],
    ['Daechi', '대치'],
    ['Jamsil', '잠실'],
    ['Hanti', '한티'],
    ['Yeongdeungpo-gu', '영등포구'],
    ['Seonyudo', '선유도'],
    ['Yangcheon-gu', '양천구'],
    ['Hapjeong', '합정'],
    ['Hongdae', '홍대'],
    ['Sinchon', '신촌'],
    ['Yongsan', '용산'],
    ['Line 3 vicinity', '3호선 인근']
  ];
  const LOCATION_OPTIONS = [
    ['IGC', '인천 · IGC'],
    ['트리플스트리트', '인천 · 트리플스트리트'],
    ['송도 내 협의', '인천 · 송도 내 협의'],
    ['서울', '서울']
  ];

  let client = null;
  let user = null;
  let activeLocation = 'IGC';
  let selected = new Set();
  let dragState = null;
  let dirty = false;
  let started = false;

  const $ = (id) => document.getElementById(id);

  function getClient() {
    if (client) return client;
    const config = window.NADO_CONFIG || {};
    if (!window.supabase || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return client;
  }

  function showToast(message, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast show' + (type ? ' ' + type : '');
    window.setTimeout(() => el.classList.remove('show'), 2600);
  }

  function timeToMinutes(value) {
    const [h, m] = String(value || '').slice(0, 5).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  }

  function minutesToTime(minutes) {
    if (minutes === 1440) return '24:00';
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }

  function availabilityKey(day, minutes) {
    return Number(day) + ':' + Number(minutes);
  }

  function parseAvailabilityKey(value) {
    const [day, minutes] = String(value).split(':').map(Number);
    return { day, minutes };
  }

  function setDirty(value = true) {
    dirty = value;
    const state = $('scheduleSaveState');
    if (!state) return;
    state.textContent = value ? '저장 필요' : '저장됨';
    state.classList.toggle('saved', !value);
  }

  function renderSelection() {
    document.querySelectorAll('#page-schedule [data-availability-key]').forEach((cell) => {
      const isSelected = selected.has(cell.dataset.availabilityKey);
      cell.classList.toggle('selected', isSelected);
      cell.setAttribute('aria-pressed', String(isSelected));
    });
    const count = $('availabilityCellCount');
    if (count) count.textContent = selected.size + '칸 선택';
  }

  function setCell(key, shouldSelect) {
    const had = selected.has(key);
    if (had === shouldSelect) return;
    shouldSelect ? selected.add(key) : selected.delete(key);
    renderSelection();
    setDirty(true);
  }

  function rowsFromSelection(memo) {
    const grouped = new Map();
    [...selected].map(parseAvailabilityKey)
      .sort((a, b) => a.day - b.day || a.minutes - b.minutes)
      .forEach(({ day, minutes }) => {
        if (!grouped.has(day)) grouped.set(day, []);
        grouped.get(day).push(minutes);
      });

    const rows = [];
    grouped.forEach((minutesList, day) => {
      let start = null;
      minutesList.forEach((minutes, index) => {
        if (start === null) start = minutes;
        const next = minutesList[index + 1];
        if (next !== minutes + 30) {
          rows.push({
            teacher_id: user.id,
            day_of_week: day,
            start_time: minutesToTime(start),
            end_time: minutesToTime(minutes + 30),
            location: activeLocation,
            memo
          });
          start = null;
        }
      });
    });
    return rows;
  }

  async function loadSeoulAreas() {
    const wrap = $('matchingSeoulAreas');
    if (!wrap || !user) return;
    wrap.hidden = activeLocation !== '서울';
    if (activeLocation !== '서울') return;

    const sb = getClient();
    const { data, error } = await sb
      .from('teacher_service_areas')
      .select('area, active')
      .eq('teacher_id', user.id)
      .eq('region', 'Seoul');
    if (error) {
      console.warn('서울 지역 조회 실패:', error.message);
      return;
    }
    const activeAreas = new Set((data || []).filter((row) => row.active).map((row) => row.area));
    wrap.querySelectorAll('[data-seoul-area]').forEach((input) => {
      input.checked = activeAreas.has(input.value);
    });
  }

  async function saveSeoulAreas() {
    if (activeLocation !== '서울') return;
    const sb = getClient();
    const selectedAreas = new Set(
      [...document.querySelectorAll('[data-seoul-area]:checked')].map((input) => input.value)
    );
    const managedAreas = new Set(SEOUL_AREAS.map(([value]) => value));

    const { data: existing, error: loadError } = await sb
      .from('teacher_service_areas')
      .select('id, area, active')
      .eq('teacher_id', user.id)
      .eq('region', 'Seoul');
    if (loadError) throw loadError;

    const rows = existing || [];
    const deleteIds = rows
      .filter((row) => managedAreas.has(row.area) && !selectedAreas.has(row.area))
      .map((row) => row.id);
    if (deleteIds.length) {
      const { error } = await sb.from('teacher_service_areas').delete().in('id', deleteIds);
      if (error) throw error;
    }

    const activateIds = rows
      .filter((row) => managedAreas.has(row.area) && selectedAreas.has(row.area) && !row.active)
      .map((row) => row.id);
    if (activateIds.length) {
      const { error } = await sb.from('teacher_service_areas').update({ active: true }).in('id', activateIds);
      if (error) throw error;
    }

    const existingAreas = new Set(rows.map((row) => row.area));
    const inserts = [...selectedAreas]
      .filter((area) => !existingAreas.has(area))
      .map((area) => ({ teacher_id: user.id, region: 'Seoul', area, active: true }));
    if (inserts.length) {
      const { error } = await sb.from('teacher_service_areas').insert(inserts);
      if (error) throw error;
    }
  }

  async function renderLocationSummary() {
    const box = $('matchingLocationSummary');
    if (!box || !user) return;
    const sb = getClient();
    const { data } = await sb.from('availability').select('location').eq('teacher_id', user.id);
    const counts = {};
    (data || []).forEach((row) => { counts[row.location] = (counts[row.location] || 0) + 1; });
    box.innerHTML = LOCATION_OPTIONS.map(([value, label]) =>
      '<span class="matching-location-chip' + (value === activeLocation ? ' active' : '') + '">' +
      label + ' · ' + (counts[value] || 0) + '개</span>'
    ).join('');
  }

  async function loadCurrentLocation() {
    const sb = getClient();
    if (!sb) return;
    if (!user) {
      const result = await sb.auth.getUser();
      user = result.data?.user || null;
    }
    if (!user) return;

    const { data, error } = await sb
      .from('availability')
      .select('day_of_week, start_time, end_time, location, memo')
      .eq('teacher_id', user.id)
      .eq('location', activeLocation)
      .order('day_of_week')
      .order('start_time');

    if (error) {
      console.error('스케줄 조회 실패:', error);
      showToast('스케줄을 불러오지 못했습니다.', 'error');
      return;
    }

    selected = new Set();
    (data || []).forEach((row) => {
      const start = Math.max(480, Math.ceil(timeToMinutes(row.start_time) / 30) * 30);
      const end = Math.min(1440, timeToMinutes(row.end_time));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let minutes = start; minutes < end; minutes += 30) {
        selected.add(availabilityKey(row.day_of_week, minutes));
      }
    });

    const memo = $('scheduleMemo');
    if (memo) memo.value = data?.[0]?.memo || '';
    await loadSeoulAreas();
    renderSelection();
    setDirty(false);
    await renderLocationSummary();
  }

  async function saveCurrentLocation() {
    if (!user) return;
    if (activeLocation === '서울' && !document.querySelector('[data-seoul-area]:checked')) {
      showToast('서울 수업 가능 지역을 하나 이상 선택해주세요.', 'error');
      return;
    }

    const sb = getClient();
    const button = $('saveScheduleButton');
    if (button) {
      button.disabled = true;
      button.textContent = '저장 중...';
    }

    try {
      const memo = $('scheduleMemo')?.value.trim() || '';
      const { error: deleteError } = await sb
        .from('availability')
        .delete()
        .eq('teacher_id', user.id)
        .eq('location', activeLocation);
      if (deleteError) throw deleteError;

      const rows = rowsFromSelection(memo);
      if (rows.length) {
        const { error } = await sb.from('availability').insert(rows);
        if (error) throw error;
      }

      await saveSeoulAreas();
      setDirty(false);
      showToast(activeLocation === '서울'
        ? '서울 가능 시간과 지역이 저장되었습니다.'
        : activeLocation + ' 가능 시간이 저장되었습니다.');
      await renderLocationSummary();
    } catch (error) {
      console.error('스케줄 저장 실패:', error);
      showToast('저장에 실패했습니다: ' + (error?.message || '알 수 없는 오류'), 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '스케줄 저장하기';
      }
    }
  }

  function installScheduleUI() {
    const select = $('scheduleLocation');
    if (!select || $('matchingSeoulAreas')) return;

    select.innerHTML = LOCATION_OPTIONS.map(([value, label]) =>
      '<option value="' + value + '">' + label + '</option>'
    ).join('');

    const field = select.closest('.schedule-preference-field');
    if (!field) return;

    const areas = document.createElement('div');
    areas.id = 'matchingSeoulAreas';
    areas.className = 'matching-seoul-areas';
    areas.hidden = true;
    areas.innerHTML = '<strong>서울 수업 가능 지역</strong>' +
      '<p>학생 매칭에 사용할 지역을 모두 선택해주세요.</p>' +
      '<div class="matching-area-grid">' +
      SEOUL_AREAS.map(([value, label]) =>
        '<label><input type="checkbox" data-seoul-area value="' + value + '"><span>' + label + '</span></label>'
      ).join('') + '</div>';
    field.appendChild(areas);

    const summary = document.createElement('div');
    summary.id = 'matchingLocationSummary';
    summary.className = 'matching-location-summary';
    field.appendChild(summary);

    select.addEventListener('change', async () => {
      if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 장소를 바꾸면 현재 변경사항이 사라집니다. 계속할까요?')) {
        select.value = activeLocation;
        return;
      }
      activeLocation = select.value;
      if (user) localStorage.setItem('nado-matching-location-' + user.id, activeLocation);
      await loadCurrentLocation();
    });

    areas.addEventListener('change', () => setDirty(true));
    $('scheduleMemo')?.addEventListener('input', () => setDirty(true));
  }

  function installEventOverrides() {
    document.addEventListener('click', (event) => {
      const save = event.target.closest?.('#saveScheduleButton');
      if (save) {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveCurrentLocation();
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

      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (!cell) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const key = cell.dataset.availabilityKey;
      setCell(key, !selected.has(key));
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest?.('#page-schedule [data-availability-key]');
      if (!cell || event.pointerType === 'touch' || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const shouldSelect = !selected.has(cell.dataset.availabilityKey);
      dragState = { pointerId: event.pointerId, shouldSelect, visited: new Set() };
      dragState.visited.add(cell.dataset.availabilityKey);
      setCell(cell.dataset.availabilityKey, shouldSelect);
    }, true);

    document.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('#page-schedule [data-availability-key]');
      if (!cell) return;
      const key = cell.dataset.availabilityKey;
      if (dragState.visited.has(key)) return;
      dragState.visited.add(key);
      setCell(key, dragState.shouldSelect);
    }, true);

    document.addEventListener('pointerup', (event) => {
      if (dragState && event.pointerId === dragState.pointerId) dragState = null;
    }, true);
  }

  function addStyles() {
    if ($('matchingSyncStyles')) return;
    const style = document.createElement('style');
    style.id = 'matchingSyncStyles';
    style.textContent = `
      .matching-seoul-areas{margin-top:16px;padding:16px;border:1px solid #dbe7f5;border-radius:14px;background:#f8fbff}
      .matching-seoul-areas>p{margin:4px 0 12px;color:#667085;font-size:.88rem}
      .matching-area-grid{display:flex;flex-wrap:wrap;gap:8px}
      .matching-area-grid label{cursor:pointer}.matching-area-grid input{position:absolute;opacity:0;pointer-events:none}
      .matching-area-grid span{display:block;padding:8px 12px;border:1px solid #d7e2ef;border-radius:999px;background:white;font-size:.88rem}
      .matching-area-grid input:checked+span{background:#4A90E2;color:white;border-color:#4A90E2;font-weight:700}
      .matching-location-summary{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
      .matching-location-chip{font-size:.76rem;padding:5px 8px;border-radius:999px;background:#eef2f6;color:#667085}
      .matching-location-chip.active{background:#e3f2fd;color:#2e6dc2;font-weight:700}
      #page-schedule .current-slots-panel{display:none}
    `;
    document.head.appendChild(style);
  }

  async function start() {
    if (started) return;
    started = true;
    addStyles();
    installScheduleUI();
    installEventOverrides();

    const sb = getClient();
    if (!sb) return;
    const result = await sb.auth.getUser();
    user = result.data?.user || null;

    if (!user) {
      sb.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) return;
        user = session.user;
        activeLocation = localStorage.getItem('nado-matching-location-' + user.id) || 'IGC';
        if ($('scheduleLocation')) $('scheduleLocation').value = activeLocation;
        window.setTimeout(loadCurrentLocation, 250);
      });
      return;
    }

    activeLocation = localStorage.getItem('nado-matching-location-' + user.id) || 'IGC';
    if ($('scheduleLocation')) $('scheduleLocation').value = activeLocation;
    await loadCurrentLocation();

    window.setInterval(() => {
      if ($('page-schedule')?.classList.contains('active')) renderSelection();
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 0), { once: true });
  else window.setTimeout(start, 0);
})();
