(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let supabase = null;
  let user = null;

  function getClient() {
    if (supabase) return supabase;
    const config = window.NADO_CONFIG || {};
    if (!window.supabase || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
    supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return supabase;
  }

  function normalizeArea(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
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
    if (!wrap || $('customSeoulAreaControls')) return false;

    const controls = document.createElement('div');
    controls.id = 'customSeoulAreaControls';
    controls.className = 'custom-seoul-area-controls';
    controls.innerHTML = `
      <div class="custom-seoul-area-title">기타 지역</div>
      <div class="custom-seoul-area-row">
        <input id="customSeoulAreaInput" type="text" placeholder="예: 마곡, 성수, 잠실새내" maxlength="40" />
        <button id="customSeoulAreaAddButton" type="button">추가</button>
      </div>
      <div class="custom-seoul-area-help">선택지에 없는 지역을 직접 추가할 수 있어요.</div>
      <div id="customSeoulAreaList" class="custom-seoul-area-list"></div>
    `;
    wrap.appendChild(controls);

    const style = document.createElement('style');
    style.textContent = `
      .custom-seoul-area-controls{margin-top:14px;padding-top:14px;border-top:1px dashed #d5dfeb}
      .custom-seoul-area-title{font-weight:700;margin-bottom:8px}
      .custom-seoul-area-row{display:flex;gap:8px;align-items:center}
      .custom-seoul-area-row input{flex:1;min-width:0;border:1px solid #d7e2ef;border-radius:10px;padding:9px 11px;background:#fff}
      .custom-seoul-area-row button{border:0;border-radius:10px;padding:9px 13px;background:#4A90E2;color:#fff;font-weight:700;cursor:pointer}
      .custom-seoul-area-help{font-size:.78rem;color:#667085;margin-top:6px}
      .custom-seoul-area-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
      .custom-seoul-area-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:#eef6ff;color:#2e6dc2;font-size:.84rem}
      .custom-seoul-area-chip button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:1rem;line-height:1;padding:0}
    `;
    document.head.appendChild(style);

    $('customSeoulAreaAddButton').addEventListener('click', addArea);
    $('customSeoulAreaInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addArea();
      }
    });
    return true;
  }

  async function loadCustomAreas() {
    if (!ensureUi()) return;
    const currentUser = await getUser();
    if (!currentUser) return;

    const sb = getClient();
    const { data, error } = await sb
      .from('teacher_service_areas')
      .select('id, area, active')
      .eq('teacher_id', currentUser.id)
      .eq('region', 'Seoul')
      .eq('active', true)
      .order('area');
    if (error) return;

    const fixed = new Set(
      [...document.querySelectorAll('#matchingSeoulAreas [data-seoul-area]')]
        .map((el) => normalizeArea(el.value).toLowerCase())
    );
    const customRows = (data || []).filter((row) => !fixed.has(normalizeArea(row.area).toLowerCase()));
    const list = $('customSeoulAreaList');
    if (!list) return;
    list.innerHTML = customRows.map((row) => `
      <span class="custom-seoul-area-chip" data-custom-area-id="${row.id}">
        ${escapeHtml(row.area)}
        <button type="button" aria-label="${escapeHtml(row.area)} 삭제">×</button>
      </span>
    `).join('');

    list.querySelectorAll('[data-custom-area-id] button').forEach((button) => {
      button.addEventListener('click', async () => {
        const chip = button.closest('[data-custom-area-id]');
        const id = chip?.dataset.customAreaId;
        if (!id) return;
        const { error: deleteError } = await sb
          .from('teacher_service_areas')
          .delete()
          .eq('id', id)
          .eq('teacher_id', currentUser.id);
        if (!deleteError) chip.remove();
      });
    });
  }

  async function addArea() {
    const input = $('customSeoulAreaInput');
    if (!input) return;
    const area = normalizeArea(input.value);
    if (!area) return;

    const currentUser = await getUser();
    if (!currentUser) return;
    const sb = getClient();

    const existingFixed = [...document.querySelectorAll('#matchingSeoulAreas [data-seoul-area]')]
      .find((el) => normalizeArea(el.value).toLowerCase() === area.toLowerCase()
        || normalizeArea(el.nextElementSibling?.textContent).toLowerCase() === area.toLowerCase());
    if (existingFixed) {
      existingFixed.checked = true;
      existingFixed.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = '';
      return;
    }

    const { data: existing } = await sb
      .from('teacher_service_areas')
      .select('id, active')
      .eq('teacher_id', currentUser.id)
      .eq('region', 'Seoul')
      .ilike('area', area)
      .limit(1);

    if (existing?.length) {
      await sb.from('teacher_service_areas').update({ active: true }).eq('id', existing[0].id);
    } else {
      await sb.from('teacher_service_areas').insert({
        teacher_id: currentUser.id,
        region: 'Seoul',
        area,
        active: true
      });
    }

    input.value = '';
    await loadCustomAreas();
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  async function start() {
    const observer = new MutationObserver(() => {
      if (ensureUi()) loadCustomAreas();
      const wrap = $('matchingSeoulAreas');
      if (wrap && !wrap.hidden) loadCustomAreas();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

    if (ensureUi()) await loadCustomAreas();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
