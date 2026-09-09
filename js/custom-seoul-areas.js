(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let supabase = null;
  let user = null;
  let refreshing = false;
  let lastSignature = '';

  function getClient() {
    if (supabase) return supabase;
    const config = window.NADO_CONFIG || {};
    if (!window.supabase || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
    supabase = window.NADO_SUPABASE_CLIENT || window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return supabase;
  }

  function normalize(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  async function getUser() {
    if (user) return user;
    const sb = getClient();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
    return user;
  }

  function syncLocationCopy() {
    const label = document.querySelector('label[for="scheduleLocation"]');
    if (label) label.textContent = '가능 장소';

    const notice = document.querySelector('#page-schedule .location-assignment-notice');
    if (notice) {
      const title = notice.querySelector('strong');
      const text = notice.querySelector('p');
      if (title) title.textContent = '가능 장소 안내';
      if (text) text.textContent = '선택한 가능 장소와 가능 시간은 학생 매칭에 사용됩니다. 실제 수업 장소는 학생과 최종 조율할 수 있습니다.';
    }
  }

  function ensureUi() {
    const wrap = $('matchingSeoulAreas');
    if (!wrap) return false;
    syncLocationCopy();

    let controls = $('sharedSeoulAreaControls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'sharedSeoulAreaControls';
      controls.className = 'custom-seoul-area-controls';
      controls.innerHTML = `
        <div class="custom-seoul-area-title">기타 지역 추가</div>
        <div class="custom-seoul-area-row">
          <input id="customSeoulAreaInput" type="text" placeholder="예: 마곡, 성수" maxlength="10" />
          <button id="customSeoulAreaAddButton" type="button">항목 추가</button>
        </div>
        <div class="custom-seoul-area-help">10자 이내로 추가하면 모든 선생님의 서울 가능 장소 선택지에 표시됩니다.</div>
        <div id="customSeoulAreaMessage" class="custom-seoul-area-message" aria-live="polite"></div>
      `;
      wrap.appendChild(controls);

      $('customSeoulAreaAddButton').addEventListener('click', addArea);
      $('customSeoulAreaInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addArea();
        }
      });
    }

    if (!$('sharedSeoulAreaStyles')) {
      const style = document.createElement('style');
      style.id = 'sharedSeoulAreaStyles';
      style.textContent = `
        .custom-seoul-area-controls{margin-top:14px;padding-top:14px;border-top:1px dashed #d5dfeb}
        .custom-seoul-area-title{font-weight:700;margin-bottom:8px}
        .custom-seoul-area-row{display:flex;gap:8px;align-items:center}
        .custom-seoul-area-row input{flex:1;min-width:0;border:1px solid #d7e2ef;border-radius:10px;padding:9px 11px;background:#fff}
        .custom-seoul-area-row button{border:0;border-radius:10px;padding:9px 13px;background:#4A90E2;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap}
        .custom-seoul-area-help{font-size:.78rem;color:#667085;margin-top:6px}
        .custom-seoul-area-message{font-size:.8rem;margin-top:7px;min-height:1em}
      `;
      document.head.appendChild(style);
    }
    return true;
  }

  async function persistSelection(input) {
    const currentUser = await getUser();
    if (!currentUser || !input?.value) return;
    const sb = getClient();
    const area = input.value;

    input.disabled = true;
    try {
      if (input.checked) {
        const { data: existing, error: selectError } = await sb
          .from('teacher_service_areas')
          .select('id, active')
          .eq('teacher_id', currentUser.id)
          .eq('region', 'Seoul')
          .eq('area', area)
          .limit(1);
        if (selectError) throw selectError;

        if (existing?.length) {
          if (!existing[0].active) {
            const { error } = await sb.from('teacher_service_areas').update({ active: true }).eq('id', existing[0].id);
            if (error) throw error;
          }
        } else {
          const { error } = await sb.from('teacher_service_areas').insert({
            teacher_id: currentUser.id,
            region: 'Seoul',
            area,
            active: true
          });
          if (error) throw error;
        }
      } else {
        const { error } = await sb
          .from('teacher_service_areas')
          .delete()
          .eq('teacher_id', currentUser.id)
          .eq('region', 'Seoul')
          .eq('area', area);
        if (error) throw error;
      }
      lastSignature = '';
    } catch (error) {
      input.checked = !input.checked;
      const message = $('customSeoulAreaMessage');
      if (message) message.textContent = '가능 장소 저장에 실패했습니다.';
      console.warn('서울 가능 장소 저장 실패:', error);
    } finally {
      input.disabled = false;
    }
  }

  async function refreshCatalog(force = false) {
    if (refreshing || !ensureUi()) return;
    const currentUser = await getUser();
    if (!currentUser) return;
    refreshing = true;

    try {
      const sb = getClient();
      const [{ data: catalog, error: catalogError }, { data: selectedRows, error: selectedError }] = await Promise.all([
        sb.rpc('get_seoul_service_area_catalog'),
        sb.from('teacher_service_areas')
          .select('area, active')
          .eq('teacher_id', currentUser.id)
          .eq('region', 'Seoul')
      ]);
      if (catalogError || selectedError) {
        console.warn('서울 가능 장소 조회 실패:', catalogError || selectedError);
        return;
      }

      const selected = new Set((selectedRows || []).filter((row) => row.active).map((row) => row.area));
      const rows = Array.isArray(catalog) ? catalog : [];
      const signature = JSON.stringify({
        catalog: rows.map((row) => [row.code, row.label]),
        selected: [...selected].sort()
      });
      if (!force && signature === lastSignature) return;

      const grid = document.querySelector('#matchingSeoulAreas .matching-area-grid');
      if (!grid) return;

      grid.innerHTML = rows.map((row) => `
        <label>
          <input type="checkbox" data-seoul-area value="${escapeHtml(row.code)}" ${selected.has(row.code) ? 'checked' : ''}>
          <span>${escapeHtml(row.label)}</span>
        </label>
      `).join('');

      grid.querySelectorAll('[data-seoul-area]').forEach((input) => {
        input.addEventListener('change', async () => {
          await persistSelection(input);
          const memo = $('scheduleMemo');
          if (memo) memo.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
      lastSignature = signature;
    } finally {
      refreshing = false;
    }
  }

  async function addArea() {
    const input = $('customSeoulAreaInput');
    const message = $('customSeoulAreaMessage');
    if (!input) return;

    const label = normalize(input.value);
    if (!label) return;
    if (label.length > 10) {
      if (message) message.textContent = '장소명은 10자 이내로 입력해주세요.';
      return;
    }

    const currentUser = await getUser();
    if (!currentUser) return;
    const sb = getClient();
    if (message) message.textContent = '추가 중...';

    const { data, error } = await sb.rpc('add_seoul_service_area', { p_label: label });
    if (error) {
      if (message) message.textContent = error.message?.includes('AREA_LABEL_LENGTH')
        ? '장소명은 10자 이내로 입력해주세요.'
        : '항목 추가에 실패했습니다.';
      return;
    }

    const area = Array.isArray(data) ? data[0] : data;
    if (area?.code) {
      const { data: existing } = await sb
        .from('teacher_service_areas')
        .select('id, active')
        .eq('teacher_id', currentUser.id)
        .eq('region', 'Seoul')
        .eq('area', area.code)
        .limit(1);

      if (existing?.length) {
        await sb.from('teacher_service_areas').update({ active: true }).eq('id', existing[0].id);
      } else {
        await sb.from('teacher_service_areas').insert({
          teacher_id: currentUser.id,
          region: 'Seoul',
          area: area.code,
          active: true
        });
      }
    }

    input.value = '';
    lastSignature = '';
    if (message) message.textContent = '새 가능 장소 항목이 추가되었습니다.';
    await refreshCatalog(true);
  }

  async function waitForUi() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if ($('matchingSeoulAreas')) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  async function start() {
    if (!(await waitForUi())) return;
    ensureUi();
    await refreshCatalog(true);

    const wrap = $('matchingSeoulAreas');
    if (wrap) {
      new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.attributeName === 'hidden') && !wrap.hidden) {
          lastSignature = '';
          refreshCatalog(true);
        }
      }).observe(wrap, { attributes: true, attributeFilter: ['hidden'] });
    }

    const locationSelect = $('scheduleLocation');
    if (locationSelect) {
      locationSelect.addEventListener('change', () => {
        syncLocationCopy();
        if (locationSelect.value === '서울') {
          lastSignature = '';
          window.setTimeout(() => refreshCatalog(true), 0);
        }
      });
    }

    window.setInterval(() => {
      syncLocationCopy();
      if (wrap && !wrap.hidden) refreshCatalog(false);
    }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
