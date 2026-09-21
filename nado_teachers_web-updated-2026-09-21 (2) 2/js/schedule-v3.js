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
  const DAYS_KO = ['일','월','화','수','목','금','토'];
  const DAYS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let user = null;
  let activeLocation = 'IGC';
  let activeServiceArea = '';
  let catalog = [];
  let dirty = false;

  const isEnglish = () => window.NADO_I18N?.getLanguage?.() === 'en';
  const tr = (ko,en) => isEnglish() ? en : ko;
  const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const areaLabel = area => isEnglish() ? (AREA_EN[area.code] || area.code || area.label) : area.label;

  function showToast(ko,en,type='') {
    const el = $('toast'); if (!el) return;
    el.textContent = tr(ko,en||ko); el.className = 'toast show' + (type ? ' '+type : '');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  function setDirty(value=true) {
    dirty = value;
    const state = $('scheduleSaveState');
    if (state) {
      state.textContent = value ? tr('저장 필요','Unsaved') : tr('저장됨','Saved');
      state.classList.toggle('saved', !value);
    }
  }

  function timeOptions(selected, includeEnd=false) {
    const out = [];
    for (let m=8*60; m <= (includeEnd ? 24*60 : 23*60+30); m+=30) {
      const h = Math.floor(m/60), mm = m%60;
      const value = m===1440 ? '24:00' : `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      out.push(`<option value="${value}"${value===selected?' selected':''}>${value}</option>`);
    }
    return out.join('');
  }

  function renderLocationButtons() {
    const wrap = $('nadoLocationButtons'); if (!wrap) return;
    wrap.innerHTML = LOCATION_OPTIONS.map(([value,ko,en]) => `
      <button type="button" class="nado-v3-location-button${value===activeLocation?' active':''}" data-v3-location="${escapeHtml(value)}" aria-pressed="${value===activeLocation}">${escapeHtml(tr(ko,en))}</button>
    `).join('');
  }

  function renderAreaGrid(mineSet) {
    const grid = $('nadoServiceAreaGrid'); if (!grid) return;
    grid.innerHTML = catalog.map(area => `
      <label class="nado-area-chip"><input type="checkbox" data-v3-area-check value="${escapeHtml(area.code)}" ${mineSet.has(area.code)?'checked':''}><span>${escapeHtml(areaLabel(area))}</span></label>
    `).join('');
  }

  function renderAreaEditor(mineSet) {
    const panel = $('nadoSeoulAreaPanel');
    if (panel) panel.hidden = activeLocation !== '서울';
    const wrap = $('nadoAreaEditorWrap'), select = $('nadoAreaEditorSelect'), empty = $('nadoAreaEditorEmpty');
    if (!wrap || !select || !empty) return;
    const available = catalog.filter(a => mineSet.has(a.code));
    wrap.hidden = activeLocation !== '서울';
    select.hidden = !available.length; empty.hidden = !!available.length;
    if (!available.length) { activeServiceArea=''; return; }
    if (!available.some(a => a.code===activeServiceArea)) activeServiceArea = available[0].code;
    select.innerHTML = available.map(a => `<option value="${escapeHtml(a.code)}">${escapeHtml(areaLabel(a))}</option>`).join('');
    select.value = activeServiceArea;
  }

  async function loadCatalogAndAreas() {
    const [{data:cat,error:ce},{data:mine,error:me}] = await Promise.all([
      client.rpc('get_seoul_service_area_catalog'),
      client.from('teacher_service_areas').select('area,active').eq('teacher_id',user.id).eq('region','Seoul')
    ]);
    if (ce || me) throw ce || me;
    catalog = (Array.isArray(cat)?cat:[]).filter(a => a.code !== '테스트 지역' && a.label !== '테스트 지역');
    const mineSet = new Set((mine||[]).filter(r=>r.active && r.area!=='테스트 지역').map(r=>r.area));
    renderAreaGrid(mineSet); renderAreaEditor(mineSet);
  }

  function rangeRow({day=1,start_time='18:00',end_time='19:00'}={}) {
    const row = document.createElement('div');
    row.className = 'nado-range-row';
    row.innerHTML = `
      <label><span class="range-label">${tr('요일','Day')}</span><select data-range-day>${Array.from({length:7},(_,i)=>{const d=(i+1)%7;return `<option value="${d}"${d===Number(day)?' selected':''}>${isEnglish()?DAYS_EN[d]:DAYS_KO[d]}</option>`}).join('')}</select></label>
      <label><span class="range-label">${tr('시작','Start')}</span><select data-range-start>${timeOptions(String(start_time).slice(0,5),false)}</select></label>
      <span class="range-dash">–</span>
      <label><span class="range-label">${tr('종료','End')}</span><select data-range-end>${timeOptions(String(end_time).slice(0,5),true)}</select></label>
      <button type="button" class="nado-range-remove" aria-label="${tr('시간대 삭제','Remove time range')}">×</button>`;
    return row;
  }

  function renderRanges(rows=[]) {
    const list = $('nadoRangeList'); if (!list) return;
    list.innerHTML='';
    (rows.length ? rows : [{day:1,start_time:'18:00',end_time:'19:00'}]).forEach(r => list.appendChild(rangeRow(r)));
    setDirty(false);
  }

  async function loadCurrentSchedule() {
    if (!user) return;
    if (activeLocation==='서울' && !activeServiceArea) { renderRanges([]); return; }
    let q = client.from('availability').select('day_of_week,start_time,end_time,memo').eq('teacher_id',user.id).eq('location',activeLocation);
    q = activeLocation==='서울' ? q.eq('service_area',activeServiceArea) : q.is('service_area',null);
    const {data,error} = await q.order('day_of_week').order('start_time');
    if (error) return showToast('스케줄을 불러오지 못했습니다.','Could not load your schedule.','error');
    renderRanges((data||[]).map(r=>({day:r.day_of_week,start_time:r.start_time,end_time:r.end_time})));
  }

  function collectRanges() {
    const rows=[];
    document.querySelectorAll('#nadoRangeList .nado-range-row').forEach(row => {
      const day=Number(row.querySelector('[data-range-day]')?.value);
      const start=row.querySelector('[data-range-start]')?.value;
      const end=row.querySelector('[data-range-end]')?.value;
      if (day>=0 && start && end) rows.push({day,start,end});
    });
    return rows;
  }

  function validateRanges(rows) {
    for (const r of rows) {
      if (r.start >= r.end) return tr('종료 시간은 시작 시간보다 늦어야 합니다.','End time must be later than start time.');
    }
    const grouped = new Map();
    rows.forEach(r => { if(!grouped.has(r.day)) grouped.set(r.day,[]); grouped.get(r.day).push(r); });
    for (const list of grouped.values()) {
      list.sort((a,b)=>a.start.localeCompare(b.start));
      for (let i=1;i<list.length;i++) if (list[i].start < list[i-1].end) return tr('같은 요일의 시간대가 서로 겹칩니다.','Time ranges on the same day cannot overlap.');
    }
    return '';
  }

  async function saveCurrentSchedule() {
    if (!user) return;
    if (activeLocation==='서울' && !activeServiceArea) return showToast('먼저 가능한 서울 지역을 선택해주세요.','Select at least one Seoul area first.','error');
    const ranges=collectRanges();
    const invalid=validateRanges(ranges); if (invalid) return showToast(invalid,invalid,'error');
    const btn=$('saveScheduleButton'); if(btn){btn.disabled=true;btn.textContent=tr('저장 중...','Saving...');}
    try {
      let del = client.from('availability').delete().eq('teacher_id',user.id).eq('location',activeLocation);
      del = activeLocation==='서울' ? del.eq('service_area',activeServiceArea) : del.is('service_area',null);
      const {error:de}=await del; if(de) throw de;
      if(ranges.length){
        const payload=ranges.map(r=>({teacher_id:user.id,day_of_week:r.day,start_time:r.start,end_time:r.end,location:activeLocation,service_area:activeLocation==='서울'?activeServiceArea:null,memo:''}));
        const {error:ie}=await client.from('availability').insert(payload); if(ie) throw ie;
      }
      setDirty(false); showToast('가능 시간이 저장되었습니다.','Availability saved.');
    } catch(e){ console.error(e); showToast('저장에 실패했습니다.','Failed to save.','error'); }
    finally { if(btn){btn.disabled=false;btn.textContent=tr('저장','Save');} }
  }

  async function setAreaAvailable(input) {
    const area=input.value; input.disabled=true;
    try {
      if(input.checked){
        const {data:existing,error:ee}=await client.from('teacher_service_areas').select('id').eq('teacher_id',user.id).eq('region','Seoul').eq('area',area).limit(1);
        if(ee) throw ee;
        if(existing?.length){ const {error}=await client.from('teacher_service_areas').update({active:true}).eq('id',existing[0].id); if(error) throw error; }
        else { const {error}=await client.from('teacher_service_areas').insert({teacher_id:user.id,region:'Seoul',area,active:true}); if(error) throw error; }
        activeServiceArea=area;
      } else {
        const {error}=await client.from('teacher_service_areas').delete().eq('teacher_id',user.id).eq('region','Seoul').eq('area',area); if(error) throw error;
        const {error:se}=await client.from('availability').delete().eq('teacher_id',user.id).eq('location','서울').eq('service_area',area); if(se) throw se;
        if(activeServiceArea===area) activeServiceArea='';
      }
      await loadCatalogAndAreas(); await loadCurrentSchedule();
    } catch(e){ input.checked=!input.checked; showToast('가능 지역 변경에 실패했습니다.','Could not update areas.','error'); }
    finally { input.disabled=false; }
  }

  function applyLanguage() {
    const intro=document.querySelector('#page-schedule .page-intro > div');
    if(intro){ const h=intro.querySelector('h2'), p=intro.querySelector('p:not(.section-kicker)'); if(h)h.textContent=tr('수업 가능 스케줄','Teaching Availability'); if(p)p.textContent=tr('가능 장소와 시간 범위를 등록해주세요.','Choose where and when you are available to teach.'); }
    const label=document.querySelector('label[for="scheduleLocation"]'); if(label) label.textContent=tr('가능 장소','Available Location');
    const sel=$('scheduleLocation'); if(sel){ const current=sel.value||activeLocation; sel.innerHTML=LOCATION_OPTIONS.map(([v,ko,en])=>`<option value="${escapeHtml(v)}">${escapeHtml(tr(ko,en))}</option>`).join(''); sel.value=current; }
    renderLocationButtons();
    if($('nadoSeoulAreaTitle')) $('nadoSeoulAreaTitle').textContent=tr('서울 가능 지역','Available Seoul Areas');
    if($('nadoSeoulAreaCopy')) $('nadoSeoulAreaCopy').textContent=tr('수업할 수 있는 지역을 모두 선택해주세요.','Select every area where you can teach.');
    if($('nadoAreaEditorLabel')) $('nadoAreaEditorLabel').textContent=tr('시간 설정 지역','Area for Time Setting');
    if($('nadoAreaEditorEmpty')) $('nadoAreaEditorEmpty').textContent=tr('가능한 서울 지역을 먼저 선택해주세요.','Select an available Seoul area first.');
    if($('nadoRangeTitle')) $('nadoRangeTitle').textContent=tr('가능 시간','Available Times');
    if($('nadoRangeCopy')) $('nadoRangeCopy').textContent=tr('요일별로 시작 시간과 종료 시간을 선택해주세요.','Choose a start and end time for each day.');
    if($('nadoAddRange')) $('nadoAddRange').textContent=tr('+ 시간대 추가','+ Add time range');
    if($('clearScheduleButton')) $('clearScheduleButton').textContent=tr('시간 초기화','Clear Times');
    if($('saveScheduleButton') && !$('saveScheduleButton').disabled) $('saveScheduleButton').textContent=tr('저장','Save');
    const rows=collectRanges(); renderRanges(rows.map(r=>({day:r.day,start_time:r.start,end_time:r.end})));
    loadCatalogAndAreas().catch(()=>{});
  }

  function installUi() {
    const select=$('scheduleLocation'); if(!select || $('nadoScheduleV3')) return false;
    const field=select.closest('.schedule-preference-field'); const panel=field?.closest('.schedule-form-panel'); const head=panel?.querySelector('.form-section-head');
    if(!field||!panel||!head) return false;
    panel.insertBefore(field,head);
    document.querySelector('#page-schedule .availability-picker')?.setAttribute('hidden','');
    document.querySelector('#page-schedule .current-slots-panel')?.setAttribute('hidden','');
    const memo=$('scheduleMemo')?.closest('.field-group'); if(memo) memo.hidden=true;
    const notice=document.querySelector('#page-schedule .location-assignment-notice'); if(notice) notice.hidden=true;
    head.innerHTML=`<div><h3 id="nadoRangeTitle">가능 시간</h3><p id="nadoRangeCopy">요일별로 시작 시간과 종료 시간을 선택해주세요.</p></div>`;

    const ui=document.createElement('div'); ui.id='nadoScheduleV3'; ui.innerHTML=`
      <div id="nadoLocationButtons" class="nado-v3-location-buttons"></div>
      <div id="nadoSeoulAreaPanel" class="nado-v3-seoul" hidden>
        <strong id="nadoSeoulAreaTitle">서울 가능 지역</strong><p id="nadoSeoulAreaCopy">수업할 수 있는 지역을 모두 선택해주세요.</p>
        <div id="nadoServiceAreaGrid" class="nado-v3-area-grid"></div>
        <div id="nadoAreaEditorWrap" class="nado-v3-editor"><label id="nadoAreaEditorLabel" for="nadoAreaEditorSelect">시간 설정 지역</label><select id="nadoAreaEditorSelect"></select><p id="nadoAreaEditorEmpty" hidden></p></div>
      </div>`;
    field.appendChild(ui);

    const rangeBox=document.createElement('div'); rangeBox.className='nado-range-box'; rangeBox.innerHTML=`<div id="nadoRangeList"></div><button id="nadoAddRange" type="button" class="nado-add-range">+ 시간대 추가</button>`;
    head.insertAdjacentElement('afterend',rangeBox);

    const style=document.createElement('style'); style.textContent=`
      #page-schedule .availability-picker[hidden],#page-schedule .current-slots-panel[hidden]{display:none!important}
      #page-schedule .schedule-layout{display:block!important}.nado-v3-location-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:10px}
      .nado-v3-location-button{min-height:64px;padding:14px;border:1px solid #d4dfed;border-radius:16px;background:#fff;color:#1f2937;font-size:1rem;font-weight:800}.nado-v3-location-button.active{background:#2f6feb;color:#fff;border-color:#2f6feb;box-shadow:0 8px 18px rgba(47,111,235,.16)}
      .nado-v3-seoul{margin-top:24px}.nado-v3-seoul>strong{font-size:1.08rem}.nado-v3-seoul>p{margin:6px 0 14px;color:#667085}.nado-v3-area-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.nado-area-chip input{position:absolute;opacity:0}.nado-area-chip span{display:grid;place-items:center;min-height:50px;padding:10px;border:1px solid #d4dfed;border-radius:14px;background:#fff;font-weight:750;text-align:center}.nado-area-chip input:checked+span{background:#4A90E2;color:#fff;border-color:#4A90E2}
      .nado-v3-editor{margin-top:18px}.nado-v3-editor label{display:block;font-weight:800;margin-bottom:7px}.nado-v3-editor select{width:100%;min-height:48px;border:1px solid #d4dfed;border-radius:12px;padding:0 12px;background:#fff}
      .nado-range-box{margin-top:14px}.nado-range-row{display:grid;grid-template-columns:1fr 1fr auto 1fr auto;gap:10px;align-items:end;margin-bottom:10px;padding:14px;border:1px solid #e0e7f0;border-radius:14px;background:#fbfdff}.nado-range-row label{display:block}.range-label{display:block;margin-bottom:6px;font-size:.82rem;font-weight:800;color:#667085}.nado-range-row select{width:100%;min-height:46px;padding:0 10px;border:1px solid #d4dfed;border-radius:10px;background:#fff;font-size:16px}.range-dash{padding-bottom:13px;color:#98a2b3}.nado-range-remove{width:42px;height:46px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;font-size:1.45rem;color:#667085}.nado-add-range{width:100%;min-height:48px;border:1px dashed #4A90E2;border-radius:12px;background:#fff;color:#2f6feb;font-weight:800}
      #page-schedule .schedule-actions{margin-top:18px}
      @media(max-width:620px){
        #page-schedule .content-wrap{padding-left:14px!important;padding-right:14px!important}#page-schedule .page-intro h2{font-size:1.7rem!important}#page-schedule .schedule-form-panel{padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important}.schedule-preference-field{padding:0!important;border:0!important;background:transparent!important}.nado-v3-location-buttons{gap:8px}.nado-v3-location-button{min-height:54px;padding:10px 8px;border-radius:12px;font-size:.9rem}.nado-v3-area-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.nado-area-chip span{min-height:46px;padding:8px 6px;border-radius:11px;font-size:.88rem}.nado-range-row{grid-template-columns:1fr 1fr;gap:10px;padding:12px}.nado-range-row label:first-child{grid-column:1/-1}.range-dash{display:none}.nado-range-remove{grid-column:1/-1;width:100%;height:42px;font-size:1rem}.nado-range-remove::after{content:' ${tr('삭제','Remove')}';font-size:.9rem}.nado-range-row select{min-height:48px}.nado-add-range{min-height:50px}.nado-v3-editor select{font-size:16px}.schedule-actions{position:sticky!important;bottom:0!important;z-index:20!important;display:grid!important;grid-template-columns:1fr 1.25fr!important;gap:8px!important;padding:10px 0 calc(10px + env(safe-area-inset-bottom))!important;background:rgba(255,255,255,.96)!important;backdrop-filter:blur(10px)}.schedule-actions .button{width:100%!important;min-width:0!important}
      }
    `; document.head.appendChild(style);
    applyLanguage(); return true;
  }

  function installEvents(){
    document.addEventListener('click',e=>{
      const loc=e.target.closest?.('[data-v3-location]'); if(loc){ const sel=$('scheduleLocation'); if(!sel||loc.dataset.v3Location===activeLocation)return; sel.value=loc.dataset.v3Location; sel.dispatchEvent(new Event('change',{bubbles:true})); return; }
      if(e.target.closest?.('#nadoAddRange')){ $('nadoRangeList')?.appendChild(rangeRow()); setDirty(true); return; }
      const rm=e.target.closest?.('.nado-range-remove'); if(rm){ rm.closest('.nado-range-row')?.remove(); if(!$('nadoRangeList')?.children.length)$('nadoRangeList')?.appendChild(rangeRow()); setDirty(true); return; }
      if(e.target.closest?.('#saveScheduleButton')){ e.preventDefault(); e.stopImmediatePropagation(); saveCurrentSchedule(); return; }
      if(e.target.closest?.('#clearScheduleButton')){ e.preventDefault(); e.stopImmediatePropagation(); renderRanges([]); setDirty(true); return; }
    },true);
    document.addEventListener('change',e=>{
      if(e.target.closest?.('[data-range-day],[data-range-start],[data-range-end]')) { setDirty(true); return; }
      const area=e.target.closest?.('[data-v3-area-check]'); if(area){ e.stopImmediatePropagation(); setAreaAvailable(area); return; }
      if(e.target.id==='nadoAreaEditorSelect'){ e.stopImmediatePropagation(); activeServiceArea=e.target.value; loadCurrentSchedule(); return; }
      if(e.target.id==='scheduleLocation'){ e.stopImmediatePropagation(); activeLocation=e.target.value; renderLocationButtons(); loadCatalogAndAreas().then(loadCurrentSchedule); }
    },true);
    document.addEventListener('nado:languagechange',()=>setTimeout(applyLanguage,30));
  }

  async function start(){
    for(let i=0;i<40&&!$('scheduleLocation');i++) await new Promise(r=>setTimeout(r,250));
    if(!installUi()) return; installEvents();
    const {data}=await client.auth.getUser(); user=data?.user||null;
    if(!user){ client.auth.onAuthStateChange((_e,s)=>{ if(!s?.user)return; user=s.user; activeLocation=$('scheduleLocation')?.value||'IGC'; loadCatalogAndAreas().then(loadCurrentSchedule); }); return; }
    activeLocation=$('scheduleLocation')?.value||'IGC'; await loadCatalogAndAreas(); await loadCurrentSchedule(); applyLanguage();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
