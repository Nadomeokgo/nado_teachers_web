(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let supabase = null;
  let user = null;
  let refreshing = false;

  function getClient() {
    if (supabase) return supabase;
    const config = window.NADO_CONFIG || {};
    if (!window.supabase || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
    supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
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

  function ensureUi() {
    const wrap = $('matchingSeoulAreas');
    if (!wrap) return false;

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
        <div class="custom-seoul-area-help">10자 이내로 추가하면 모든 선생님의 서울 지역 선택지에 표시됩니다.</div>
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

  async function refreshCatalog() {
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
      if (catalogError || selectedError) return;

      const selected = new Set((selectedRows || []).filter((row) => row.active).map((row) => row.area));
      const grid = document.querySelector('#matchingSeoulAreas .matching-area-grid');
      if (!grid) return;

      const rows = Array.isArray(catalog) ? catalog : [];
      grid.innerHTML = rows.map((row) => `
        <label>
          <input type="checkbox" data-seoul-area value="${escapeHtml(row.code)}" ${selected.has(row.code) ? 'checked' : ''}>
          <span>${escapeHtml(row.label)}</span>
        </label>
      `).join('');

      grid.querySelectorAll('[data-seoul-area]').forEach((input) => {
        input.addEventListener('change', () => {
          const memo = $('scheduleMemo');
          if (memo) memo.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
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
    if (message) message.textContent = '새 장소 항목이 추가되었습니다.';
    await refreshCatalog();
  }

  async function start() {
    const observer = new MutationObserver(() => {
      const wrap = $('matchingSeoulAreas');
      if (wrap && !wrap.hidden) refreshCatalog();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

    ensureUi();
    await refreshCatalog();
    window.setInterval(() => {
      const wrap = $('matchingSeoulAreas');
      if (wrap && !wrap.hidden) refreshCatalog();
    }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
