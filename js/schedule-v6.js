(() => {
  'use strict';
  if (window.__NADO_SCHEDULE_V6_LOADED__) return;
  window.__NADO_SCHEDULE_V6_LOADED__ = true;
  const config=window.NADO_CONFIG||{};
  const client=window.NADO_SUPABASE_CLIENT||window.supabase?.createClient?.(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
  if(!client)return;
  const $=id=>document.getElementById(id);
  const LOCS=[['송도','송도','Songdo'],['서울','서울','Seoul']];
  // Group locations only in the UI; matching and pricing still use these stored values.
  const STORAGE_GROUPS={
    '송도':[{region:'Songdo',location:'송도'},{region:'IGC_TRIPLE',location:'IGC & 트스'}],
    '서울':[{region:'Seoul',location:'서울'}]
  };
  const AREA_CATALOGS={
    Songdo:['송도 전체','센트럴파크','커낼워크','테크노파크','캠퍼스타운'],
    IGC_TRIPLE:['IGC','트리플스트리트'],
    Seoul:['서울 전체','강남','대치','잠실','한티','용산','신촌','홍대','합정','성수','마곡','선유도','서초','영등포구','양천구','3호선 인근']
  };
  const AREA_LABELS_EN={
    '송도 전체':'All Songdo','센트럴파크':'Central Park','커낼워크':'Canal Walk','테크노파크':'Techno Park','캠퍼스타운':'Campus Town',
    'IGC':'IGC','트리플스트리트':'Triple Street',
    '서울 전체':'All Seoul','강남':'Gangnam','대치':'Daechi','잠실':'Jamsil','한티':'Hanti','용산':'Yongsan','신촌':'Sinchon','홍대':'Hongdae','합정':'Hapjeong','성수':'Seongsu','마곡':'Magok','선유도':'Seonyudo','서초':'Seocho','영등포구':'Yeongdeungpo-gu','양천구':'Yangcheon-gu','3호선 인근':'Near Line 3'
  };
  const DKO=['일','월','화','수','목','금','토'],DEN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],ORDER=[1,2,3,4,5,6,0];
  const START=480,END=1440,STEP=30;
  let user=null,activeLocation='송도',activeArea='',catalog=[],selectedAreas=new Set(),dirty=false,slots=Array.from({length:7},()=>new Set());
  let dragState=null,dragPointer={x:0,y:0},dragScrollFrame=0,suppressTimeClick=false;
  let busy=false,scheduleReady=false,focusedCell={day:1,time:START};
  const en=()=>window.NADO_I18N?.getLanguage?.()==='en';
  const tr=(ko,enText)=>en()?enText:ko;
  const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const areaKey=(location,area)=>JSON.stringify([location,area]);
  const activeDescriptor=()=>catalog.find(a=>a.key===activeArea);
  const areaQuery=(query,area)=>area.code===null?query.is('service_area',null):query.eq('service_area',area.code);
  const notifySaved=(area,rowCount)=>document.dispatchEvent(new CustomEvent('nado:schedule-saved',{detail:{teacherId:user.id,location:area.location,serviceArea:area.code,rowCount}}));
  const needsArea=()=>true;
  function areaLabel(a){
    if(a.code===null)return a.location==='IGC & 트스'?tr('IGC·트리플스트리트 공통 시간 (기존)','IGC / Triple Street shared times (existing)'):tr(`${a.location} 공통 시간 (기존)`,`${a.location==='서울'?'Seoul':'Songdo'} shared times (existing)`);
    const label=en()?(AREA_LABELS_EN[a.code]||a.label||a.code):(a.label||a.code);
    if(!catalog.some(other=>other.key!==a.key&&other.code===a.code))return label;
    return `${label} (${a.location==='IGC & 트스'?tr('IGC·트리플스트리트','IGC / Triple Street'):tr(a.location,a.location==='서울'?'Seoul':'Songdo')})`;
  }
  const t2m=v=>{const [h,m]=String(v||'').slice(0,5).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:NaN};
  const m2t=m=>m===1440?'24:00':`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const showTime=m=>m===1440?'24:00':`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
  function toast(ko,enText,type=''){const el=$('toast');if(!el)return;el.textContent=tr(ko,enText||ko);el.className='toast show'+(type?' '+type:'');setTimeout(()=>el.classList.remove('show'),2600)}
  function setDirty(v=true){dirty=v;const el=$('scheduleSaveState');if(el){el.textContent=v?tr('저장 필요','Unsaved'):tr('저장됨','Saved');el.classList.toggle('saved',!v)}}
  function reset(){slots=Array.from({length:7},()=>new Set())}
  function renderLocations(){const w=$('nadoLocationButtons');if(!w)return;w.innerHTML=LOCS.map(([v,ko,e])=>`<button type="button" class="nado-v6-location-button${v===activeLocation?' active':''}" data-v6-location="${esc(v)}">${esc(tr(ko,e))}</button>`).join('')}
  function renderAreas(){
    const panel=$('nadoAreaPanel');if(panel)panel.hidden=!needsArea();
    const grid=$('nadoAreaGrid');
    if(grid)grid.innerHTML=catalog.map(a=>`<label class="nado-v6-area-chip"><input type="checkbox" data-v6-area value="${esc(a.key)}" ${selectedAreas.has(a.key)?'checked':''}><span>${esc(areaLabel(a))}</span></label>`).join('');
    const sel=$('nadoAreaSelect'),empty=$('nadoAreaEmpty');if(!sel||!empty)return;
    const arr=catalog.filter(a=>selectedAreas.has(a.key));sel.hidden=!arr.length;empty.hidden=!!arr.length;
    if(!arr.length){activeArea='';sel.innerHTML='';return}
    if(!arr.some(a=>a.key===activeArea))activeArea=arr[0].key;
    sel.innerHTML=arr.map(a=>`<option value="${esc(a.key)}">${esc(areaLabel(a))}</option>`).join('');sel.value=activeArea;
  }
  async function loadAreas(){
    if(!user){catalog=[];selectedAreas=new Set();renderAreas();return}
    const groups=STORAGE_GROUPS[activeLocation]||STORAGE_GROUPS['송도'];
    const results=await Promise.all(groups.map(async group=>{
      const [areas,availability]=await Promise.all([
        client.from('teacher_service_areas').select('area,active,region').eq('teacher_id',user.id).eq('region',group.region),
        client.from('availability').select('service_area').eq('teacher_id',user.id).eq('location',group.location)
      ]);
      if(areas.error)throw areas.error;if(availability.error)throw availability.error;
      return {...group,mine:areas.data||[],saved:availability.data||[]};
    }));
    // Older profiles used Incheon for places whose availability is stored as 송도.
    // Keep those records associated with their existing schedule, without moving them.
    if(activeLocation==='송도'){
      const legacy=await client.from('teacher_service_areas').select('area,active,region').eq('teacher_id',user.id).eq('region','Incheon');
      if(legacy.error)throw legacy.error;
      const songdo=results.find(group=>group.location==='송도');
      const savedAreas=new Set(songdo.saved.map(row=>row.service_area));
      songdo.mine.push(...(legacy.data||[]).filter(row=>savedAreas.has(row.area)));
    }
    const entries=new Map(),selected=new Set();
    for(const group of results){
      const defaults=AREA_CATALOGS[group.region]||[];
      for(const code of [...defaults,...group.mine.map(row=>row.area),...group.saved.map(row=>row.service_area)]){
        if(code!==null&&typeof code!=='string')continue;
        const key=areaKey(group.location,code);
        if(!entries.has(key))entries.set(key,{key,code,label:code,location:group.location,region:group.region,sourceRegions:[]});
      }
      for(const row of group.mine){
        const key=areaKey(group.location,row.area),entry=entries.get(key);if(!entry)continue;
        const sourceRegion=row.region||group.region;if(!entry.sourceRegions.includes(sourceRegion))entry.sourceRegions.push(sourceRegion);
        if(row.active)selected.add(key);
      }
      for(const row of group.saved)selected.add(areaKey(group.location,row.service_area));
    }
    catalog=[...entries.values()];selectedAreas=selected;renderAreas();
  }
  function slotLabel(day,time){return tr(`${DKO[day]}요일 ${showTime(time)}–${showTime(time+STEP)}`,`${DEN[day]} ${showTime(time)}–${showTime(time+STEP)}`)}
  function renderTimes(){
    const w=$('nadoTimeGrid');if(!w)return;
    let html=`<div class="nado-weekly-corner">${tr('시간','Time')}</div>`+ORDER.map(d=>`<div class="nado-weekly-day">${en()?DEN[d]:DKO[d]}</div>`).join('');
    for(let m=START;m<END;m+=STEP){
      html+=`<div class="nado-weekly-time-label${m%60===0?' hour':''}">${showTime(m)}</div>`;
      html+=ORDER.map(d=>`<button type="button" class="nado-weekly-cell${m%60===0?' hour':''}${slots[d].has(m)?' selected':''}" data-v6-day="${d}" data-v6-time="${m}" aria-label="${esc(slotLabel(d,m))}" aria-pressed="${slots[d].has(m)}" tabindex="${focusedCell.day===d&&focusedCell.time===m?'0':'-1'}" ${busy||!scheduleReady?'disabled':''}></button>`).join('');
    }
    w.innerHTML=html;
  }
  function renderStatus(){
    const el=$('nadoRangeStatus');if(!el)return;
    el.className='nado-weekly-status'+(dragState?' active':'');
    if(dragState){
      const first=ORDER[Math.min(ORDER.indexOf(dragState.anchorDay),ORDER.indexOf(dragState.currentDay))];
      const last=ORDER[Math.max(ORDER.indexOf(dragState.anchorDay),ORDER.indexOf(dragState.currentDay))];
      const range=`${showTime(Math.min(dragState.anchor,dragState.current))}–${showTime(Math.max(dragState.anchor,dragState.current)+STEP)}`;
      el.textContent=tr(`${DKO[first]}–${DKO[last]} ${range} ${dragState.adding?'선택':'해제'} 중 · Esc로 취소`,`${DEN[first]}–${DEN[last]} ${range}: ${dragState.adding?'selecting':'removing'} · Esc to cancel`);
    }else{
      const count=slots.reduce((sum,day)=>sum+day.size,0);
      el.textContent=tr(`선택한 시간대 ${count}칸 · 1칸 = 30분. 선택한 칸에서 드래그하면 해제됩니다.`,`Selected: ${count} slots · 30 minutes each. Drag from a selected cell to remove slots.`);
    }
  }
  function syncTimeButtons(){
    document.querySelectorAll('#nadoTimeGrid [data-v6-time]').forEach(button=>{
      const d=Number(button.dataset.v6Day),m=Number(button.dataset.v6Time),selected=slots[d].has(m);
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
      button.tabIndex=focusedCell.day===d&&focusedCell.time===m?0:-1;
      button.disabled=busy||!scheduleReady;
    });
  }
  function setBusy(value){
    busy=value;
    document.querySelectorAll('#nadoScheduleV6 button, #nadoScheduleV6 input, #nadoScheduleV6 select, #clearScheduleButton, #saveScheduleButton').forEach(el=>el.disabled=value);
    syncTimeButtons();
    if($('saveScheduleButton'))$('saveScheduleButton').disabled=value||!scheduleReady;
    if($('clearScheduleButton'))$('clearScheduleButton').disabled=value||!scheduleReady;
  }
  function cloneSlots(source=slots){return source.map(day=>new Set(day))}
  function applyDragRange(day,current){
    if(!dragState)return;
    dragState.currentDay=day;dragState.current=current;
    slots=cloneSlots(dragState.before);
    const first=Math.min(ORDER.indexOf(dragState.anchorDay),ORDER.indexOf(day));
    const last=Math.max(ORDER.indexOf(dragState.anchorDay),ORDER.indexOf(day));
    const start=Math.min(dragState.anchor,current),end=Math.max(dragState.anchor,current);
    for(let col=first;col<=last;col++)for(let m=start;m<=end;m+=STEP){
      if(dragState.adding)slots[ORDER[col]].add(m);else slots[ORDER[col]].delete(m);
    }
    syncTimeButtons();renderStatus();setDirty(true);
  }
  function timeButtonAt(x,y){const hit=document.elementFromPoint(x,y)?.closest?.('[data-v6-time]');return hit&&$('nadoTimeGrid')?.contains(hit)?hit:null}
  function stopDragScroll(){if(dragScrollFrame)cancelAnimationFrame(dragScrollFrame);dragScrollFrame=0}
  function dragHit(){
    const scroller=$('nadoTimeScroll');if(!scroller)return null;
    const rect=scroller.getBoundingClientRect();
    const timeLabel=scroller.querySelector('.nado-weekly-time-label');
    const dayHead=scroller.querySelector('.nado-weekly-day');
    const left=rect.left+(timeLabel?.getBoundingClientRect().width||48)+3;
    const top=rect.top+(dayHead?.getBoundingClientRect().height||38)+3;
    return timeButtonAt(Math.max(left,Math.min(rect.right-8,dragPointer.x)),Math.max(top,Math.min(rect.bottom-8,dragPointer.y)));
  }
  function runDragScroll(){
    stopDragScroll();
    const tick=()=>{
      if(!dragState)return;
      const scroller=$('nadoTimeScroll');if(!scroller)return;
      const rect=scroller.getBoundingClientRect(),edge=48;
      const speed=(point,low,high)=>point<low+edge?-Math.min(16,Math.ceil((low+edge-point)/7)):point>high-edge?Math.min(16,Math.ceil((point-high+edge)/7)):0;
      const beforeTop=scroller.scrollTop,beforeLeft=scroller.scrollLeft;
      scroller.scrollTop+=speed(dragPointer.y,rect.top+38,rect.bottom);
      scroller.scrollLeft+=speed(dragPointer.x,rect.left+48,rect.right);
      if(scroller.scrollTop!==beforeTop||scroller.scrollLeft!==beforeLeft){const hit=dragHit();if(hit)applyDragRange(Number(hit.dataset.v6Day),Number(hit.dataset.v6Time))}
      dragScrollFrame=requestAnimationFrame(tick);
    };
    dragScrollFrame=requestAnimationFrame(tick);
  }
  function beginTimeDrag(button,event){
    if(busy||!scheduleReady||dragState||(event.pointerType==='mouse'&&event.button!==0))return;
    event.preventDefault();event.stopImmediatePropagation();
    const day=Number(button.dataset.v6Day),time=Number(button.dataset.v6Time);
    suppressTimeClick=false;
    focusedCell={day,time};button.focus({preventScroll:true});
    dragPointer={x:event.clientX,y:event.clientY};
    dragState={pointerId:event.pointerId,anchorDay:day,currentDay:day,anchor:time,current:time,before:cloneSlots(),wasDirty:dirty,adding:!slots[day].has(time)};
    const scroller=$('nadoTimeScroll');scroller?.classList.add('dragging');
    try{scroller?.setPointerCapture(event.pointerId)}catch(_error){}
    applyDragRange(day,time);runDragScroll();
  }
  function moveTimeDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    event.preventDefault();dragPointer={x:event.clientX,y:event.clientY};
    const hit=dragHit();if(hit)applyDragRange(Number(hit.dataset.v6Day),Number(hit.dataset.v6Time));
  }
  function finishTimeDrag(cancel=false){
    if(!dragState)return;
    const state=dragState;dragState=null;stopDragScroll();
    if(cancel){slots=cloneSlots(state.before);setDirty(state.wasDirty)}
    const scroller=$('nadoTimeScroll');scroller?.classList.remove('dragging');
    try{if(scroller?.hasPointerCapture(state.pointerId))scroller.releasePointerCapture(state.pointerId)}catch(_error){}
    // A cancelled gesture can still dispatch a click after its eventual pointerup.
    suppressTimeClick=true;if(!cancel)window.setTimeout(()=>{suppressTimeClick=false},0);
    syncTimeButtons();renderStatus();
  }
  function endTimeDrag(event){if(!dragState||event.pointerId!==dragState.pointerId)return;event.preventDefault();finishTimeDrag(event.type==='pointercancel')}
  function renderPicker(){renderTimes();renderStatus()}
  async function loadSchedule(){
    finishTimeDrag(true);scheduleReady=false;
    const area=activeDescriptor();
    if(!user||!area){reset();renderPicker();setDirty(false);return}
    let q=areaQuery(client.from('availability').select('day_of_week,start_time,end_time').eq('teacher_id',user.id).eq('location',area.location),area);
    const {data,error}=await q.order('day_of_week').order('start_time');
    if(error){reset();renderPicker();return toast('스케줄을 불러오지 못했습니다. 페이지를 새로고침해주세요.','Could not load schedule. Please refresh the page.','error')}
    reset();
    (data||[]).forEach(r=>{const d=Number(r.day_of_week),s=Math.max(START,t2m(r.start_time)),e=Math.min(END,t2m(r.end_time));if(!Number.isInteger(d)||d<0||d>6||!Number.isFinite(s)||!Number.isFinite(e)||e<=s)return;for(let m=s;m<e;m+=STEP)slots[d].add(m)});
    scheduleReady=true;renderPicker();setDirty(false);
  }
  function rangesForDay(d){const arr=[...slots[d]].sort((a,b)=>a-b);if(!arr.length)return[];const out=[];let s=arr[0],p=arr[0];for(let i=1;i<arr.length;i++){const c=arr[i];if(c!==p+STEP){out.push({start:s,end:p+STEP});s=c}p=c}out.push({start:s,end:Math.min(END,p+STEP)});return out}
  function payload(){const area=activeDescriptor(),out=[];for(let d=0;d<7;d++)rangesForDay(d).forEach(r=>out.push({teacher_id:user.id,day_of_week:d,start_time:m2t(r.start),end_time:m2t(r.end),location:area.location,service_area:area.code,memo:''}));return out}
  function canDiscard(){return !dirty||confirm(tr('저장하지 않은 시간 변경사항이 있습니다. 변경사항을 버리고 이동할까요?','You have unsaved time changes. Discard them and continue?'))}
  async function save(){
    if(busy||!scheduleReady||!user)return;
    const area=activeDescriptor();if(!area)return toast('먼저 세부 가능 지역을 선택해주세요.','Select a detailed area first.','error');
    finishTimeDrag(false);const rows=payload(),btn=$('saveScheduleButton');setBusy(true);
    if(btn)btn.textContent=tr('저장 중...','Saving...');
    try{
      const del=areaQuery(client.from('availability').delete().eq('teacher_id',user.id).eq('location',area.location),area);
      const {error:e1}=await del;if(e1)throw e1;
      if(rows.length){const {error:e2}=await client.from('availability').insert(rows);if(e2)throw e2}
      setDirty(false);toast('가능 시간이 저장되었습니다.','Availability saved.');notifySaved(area,rows.length);
    }catch(e){console.error(e);toast('저장에 실패했습니다. 다시 저장해주세요.','Failed to save. Please try saving again.','error')}
    finally{setBusy(false);if(btn)btn.textContent=tr('저장','Save')}
  }
  async function activateArea(area){
    if(area.code===null)return;
    const regions=area.sourceRegions.length?area.sourceRegions:[area.region];
    for(const r of regions){
      const {data:existing,error}=await client.from('teacher_service_areas').select('id').eq('teacher_id',user.id).eq('region',r).eq('area',area.code).limit(1);
      if(error)throw error;
      const result=existing?.length?await client.from('teacher_service_areas').update({active:true}).eq('id',existing[0].id):await client.from('teacher_service_areas').insert({teacher_id:user.id,region:r,area:area.code,active:true});
      if(result.error)throw result.error;
    }
  }
  async function toggleArea(input){
    const checked=input.checked,key=input.value,previousArea=activeArea,area=catalog.find(a=>a.key===key);
    if(busy||!user||!area){input.checked=!checked;return}
    const switchesArea=(checked&&key!==activeArea)||(!checked&&key===activeArea);
    if(switchesArea&&!canDiscard()){input.checked=!checked;return}
    setBusy(true);
    try{
      if(checked){
        await activateArea(area);if(activeArea!==key)scheduleReady=false;activeArea=key;
      }else{
        if(area.code!==null)for(const r of area.sourceRegions.length?area.sourceRegions:[area.region]){
          const {error}=await client.from('teacher_service_areas').delete().eq('teacher_id',user.id).eq('region',r).eq('area',area.code);if(error)throw error;
        }
        const {error}=await areaQuery(client.from('availability').delete().eq('teacher_id',user.id).eq('location',area.location),area);if(error)throw error;
        if(activeArea===key){scheduleReady=false;activeArea=''}
      }
      await loadAreas();
      if(activeArea!==previousArea||switchesArea)await loadSchedule();
    }catch(e){input.checked=!checked;toast('가능 지역 변경에 실패했습니다.','Could not update area.','error')}
    finally{setBusy(false)}
  }
  async function addArea(){
    if(busy||!user||!needsArea())return;
    const input=$('nadoCustomAreaInput'),label=String(input?.value||'').trim().replace(/\s+/g,' ');
    if(!label)return;
    if(label.length>30)return toast('장소명은 30자 이내로 입력해주세요.','Location must be 30 characters or fewer.','error');
    const group=STORAGE_GROUPS[activeLocation][0];
    const area=catalog.find(a=>a.code===label)||{key:areaKey(group.location,label),code:label,label,location:group.location,region:group.region,sourceRegions:[]};
    if(area.key!==activeArea&&!canDiscard())return;
    const previousArea=activeArea;setBusy(true);
    try{
      await activateArea(area);
      if(activeArea!==area.key)scheduleReady=false;activeArea=area.key;if(input)input.value='';await loadAreas();
      if(activeArea!==previousArea)await loadSchedule();
      toast('새 가능 장소가 추가되었습니다.','New location added.');
    }catch(e){toast('장소 추가에 실패했습니다.','Could not add location.','error')}
    finally{setBusy(false)}
  }
  function applyLanguage(){
    if($('nadoTimeGrid'))$('nadoTimeGrid').setAttribute('aria-label',tr('요일별 수업 가능 시간','Weekly teaching availability'));
    const intro=document.querySelector('#page-schedule .page-intro > div');
    if(intro){
      const h=intro.querySelector('h2'),p=intro.querySelector('p:not(.section-kicker)');
      if(h)h.textContent=tr('수업 가능 스케줄','Teaching Availability');
      if(p)p.textContent=tr('가능 장소와 수업 가능한 시간대를 등록해주세요.','Choose where and when you are available to teach.');
    }
    const lbl=document.querySelector('label[for="scheduleLocation"]');if(lbl)lbl.textContent=tr('가능 장소','Available Location');
    const sel=$('scheduleLocation');
    if(sel){
      const current=sel.value||activeLocation;
      sel.innerHTML=LOCS.map(([v,ko,e])=>`<option value="${esc(v)}">${esc(tr(ko,e))}</option>`).join('');
      sel.value=current==='서울'?'서울':'송도';
    }
    if($('nadoAreaTitle'))$('nadoAreaTitle').textContent=activeLocation==='서울'?tr('서울 가능 지역','Available Seoul Areas'):tr('송도 가능 지역','Available Songdo Areas');
    if($('nadoAreaCopy'))$('nadoAreaCopy').textContent=tr('수업할 수 있는 지역을 모두 선택해주세요. 직접 장소를 추가할 수도 있습니다.','Select every area where you can teach. You can also add a specific place.');
    if($('nadoAreaLabel'))$('nadoAreaLabel').textContent=tr('시간 설정 지역','Area for Time Setting');
    if($('nadoAreaEmpty'))$('nadoAreaEmpty').textContent=tr('가능한 세부 지역을 먼저 선택해주세요.','Select a detailed area first.');
    if($('nadoCustomAreaInput'))$('nadoCustomAreaInput').placeholder=tr('구체적인 장소 추가','Add a specific place');
    if($('nadoCustomAreaAdd'))$('nadoCustomAreaAdd').textContent=tr('추가','Add');
    if($('nadoTimeTitle'))$('nadoTimeTitle').textContent=tr('가능한 시간대를 선택해주세요','Select your available times');
    if($('nadoTimeCopy'))$('nadoTimeCopy').textContent=tr('월요일부터 일요일까지 한눈에 보고, 원하는 요일과 시간을 가로·세로로 드래그해 선택하세요. 화면 가장자리에서는 자동 스크롤됩니다.','View Monday through Sunday together. Drag across days and times to select a block. The grid scrolls automatically at the edges.');
    if($('clearScheduleButton'))$('clearScheduleButton').textContent=tr('시간 초기화','Clear Times');
    if($('saveScheduleButton')&&!$('saveScheduleButton').disabled)$('saveScheduleButton').textContent=tr('저장','Save');
    renderLocations();renderAreas();renderPicker();
  }
  // Weekly classes deliberately differ from legacy nado-v6 timeline layout overrides.
  function installUI(){const sel=$('scheduleLocation');if(!sel||$('nadoScheduleV6'))return false;const field=sel.closest('.schedule-preference-field'),panel=field?.closest('.schedule-form-panel'),head=panel?.querySelector('.form-section-head');if(!field||!panel||!head)return false;panel.insertBefore(field,head);document.querySelector('#page-schedule .availability-picker')?.setAttribute('hidden','');document.querySelector('#page-schedule .current-slots-panel')?.setAttribute('hidden','');const memo=$('scheduleMemo')?.closest('.field-group');if(memo)memo.hidden=true;const notice=document.querySelector('#page-schedule .location-assignment-notice');if(notice)notice.hidden=true;const ui=document.createElement('div');ui.id='nadoScheduleV6';ui.innerHTML=`<div id="nadoLocationButtons" class="nado-v6-location-buttons"></div><div id="nadoAreaPanel" class="nado-v6-area-panel" hidden><strong id="nadoAreaTitle"></strong><p id="nadoAreaCopy"></p><div id="nadoAreaGrid" class="nado-v6-area-grid"></div><div class="nado-v6-custom"><input id="nadoCustomAreaInput" maxlength="30"><button id="nadoCustomAreaAdd" type="button"></button></div><div class="nado-v6-area-editor"><label id="nadoAreaLabel" for="nadoAreaSelect"></label><select id="nadoAreaSelect"></select><p id="nadoAreaEmpty" hidden></p></div></div>`;field.appendChild(ui);head.innerHTML=`<div><h3 id="nadoTimeTitle"></h3><p id="nadoTimeCopy"></p></div>`;const picker=document.createElement('div');picker.className='nado-weekly-picker';picker.innerHTML=`<div id="nadoTimeScroll" class="nado-weekly-scroll"><div id="nadoTimeGrid" class="nado-weekly-grid" role="group" aria-label="Weekly availability"></div></div><div id="nadoRangeStatus" class="nado-weekly-status" aria-live="polite"></div>`;head.insertAdjacentElement('afterend',picker);const style=document.createElement('style');style.textContent=`#page-schedule .availability-picker[hidden],#page-schedule .current-slots-panel[hidden]{display:none!important}#page-schedule .schedule-layout{display:block!important}#page-schedule #scheduleLocation{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}#page-schedule .nado-v6-location-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px}.nado-v6-location-button{min-height:64px;border:1px solid #d3deeb;border-radius:16px;background:#fff;font-weight:800}.nado-v6-location-button.active{background:#2f6feb;color:#fff;border-color:#2f6feb}.nado-v6-area-panel{margin-top:24px}.nado-v6-area-panel>strong{font-size:1.15rem}.nado-v6-area-panel>p{color:#667085}.nado-v6-area-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.nado-v6-area-chip input{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);opacity:0}.nado-v6-area-chip span{display:grid;place-items:center;min-height:48px;border:1px solid #d4dfed;border-radius:12px;background:#fff;font-weight:750;text-align:center;padding:8px}.nado-v6-area-chip input:checked+span{background:#4a90e2;color:#fff;border-color:#4a90e2}.nado-v6-custom{display:flex;gap:8px;margin-top:12px}.nado-v6-custom input{flex:1;min-width:0;min-height:46px;border:1px solid #d4dfed;border-radius:10px;padding:0 12px;font-size:16px}.nado-v6-custom button{border:0;border-radius:10px;background:#4a90e2;color:#fff;font-weight:800;padding:0 18px}.nado-v6-area-editor{margin-top:16px}.nado-v6-area-editor label{display:block;font-weight:800;margin-bottom:7px}.nado-v6-area-editor select{width:100%;min-height:48px;border:1px solid #d4dfed;border-radius:10px;padding:0 12px;font-size:16px}.nado-weekly-picker{min-width:0}.nado-weekly-scroll{max-height:640px;overflow:auto;overscroll-behavior:contain;border:1px solid #dce5ee;border-radius:10px;background:#fff;scrollbar-gutter:stable}.nado-weekly-scroll.dragging{cursor:crosshair;box-shadow:0 0 0 3px rgba(33,139,78,.14)}#page-schedule .nado-weekly-grid{display:grid;grid-template-columns:48px repeat(7,minmax(36px,1fr));min-width:300px;gap:0;user-select:none}.nado-weekly-corner,.nado-weekly-day{position:sticky;top:0;z-index:3;display:grid;place-items:center;height:38px;background:#f4f8f5;border-bottom:1px solid #ccded1;color:#385342;font-size:.8rem;font-weight:750}.nado-weekly-corner{left:0;z-index:4;font-size:.7rem}.nado-weekly-time-label{position:sticky;left:0;z-index:2;display:flex;align-items:flex-start;justify-content:center;padding-top:3px;background:#f8faf9;color:#64746a;font-size:.65rem;border-bottom:1px solid #e4ece6;border-right:1px solid #d3e0d7;font-variant-numeric:tabular-nums}.nado-weekly-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:24px;padding:0;border:0;border-bottom:1px solid #e4ece6;border-right:1px solid #e4ece6;border-radius:0;background:#fff;color:#fff;touch-action:none;cursor:crosshair;scroll-margin:42px 50px}.nado-weekly-cell.hour,.nado-weekly-time-label.hour{border-top:1px solid #cedcd3}.nado-weekly-cell:hover:not(:disabled){background:#edf7ef}.nado-weekly-cell.selected{background:#36a85e;border-color:#2b9952}.nado-weekly-cell.selected:hover:not(:disabled){background:#2b9852}.nado-weekly-cell:focus-visible{z-index:1;outline:2px solid #16324f;outline-offset:-3px}.nado-weekly-cell:disabled{cursor:wait;opacity:.6}.nado-weekly-status{min-height:3.1em;margin-top:14px;color:#64748b;font-size:.82rem;line-height:1.55}.nado-weekly-status.active{color:#217442;font-weight:650}@media(max-width:700px){#page-schedule .schedule-form-panel{padding:0!important;border:0!important;box-shadow:none!important}.nado-v6-location-buttons{gap:8px}.nado-v6-location-button{min-height:52px;font-size:.88rem}.nado-v6-area-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.nado-weekly-scroll{max-height:480px}.nado-weekly-day{font-size:.72rem}.nado-weekly-cell{min-height:28px}.nado-weekly-status{min-height:4.65em}}`;document.head.appendChild(style);applyLanguage();return true}
  async function switchLoc(v){
    const sel=$('scheduleLocation');
    v=v==='서울'?'서울':'송도';
    if(busy||v===activeLocation){if(sel)sel.value=activeLocation;return}
    if(!canDiscard()){if(sel)sel.value=activeLocation;renderLocations();return}
    finishTimeDrag(true);activeLocation=v;activeArea='';setBusy(true);if(sel)sel.value=v;
    try{await loadAreas();await loadSchedule();applyLanguage()}
    catch(e){scheduleReady=false;toast('가능 장소를 불러오지 못했습니다. 다시 시도해주세요.','Could not load location. Please try again.','error')}
    finally{setBusy(false)}
  }
  async function switchArea(value){
    if(busy||value===activeArea){if($('nadoAreaSelect'))$('nadoAreaSelect').value=activeArea;return}
    if(!canDiscard()){if($('nadoAreaSelect'))$('nadoAreaSelect').value=activeArea;return}
    finishTimeDrag(true);activeArea=value;setBusy(true);
    try{await loadSchedule()}finally{setBusy(false)}
  }
  function focusSlot(day,time){
    focusedCell={day,time};syncTimeButtons();
    const button=document.querySelector(`#nadoTimeGrid [data-v6-day="${day}"][data-v6-time="${time}"]`);
    button?.focus({preventScroll:true});button?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function events(){
    document.addEventListener('pointerdown',e=>{const t=e.target.closest?.('[data-v6-time]');if(t)beginTimeDrag(t,e)},true);
    document.addEventListener('pointermove',moveTimeDrag,{passive:false,capture:true});
    document.addEventListener('pointerup',endTimeDrag,{passive:false,capture:true});
    document.addEventListener('pointercancel',endTimeDrag,{passive:false,capture:true});
    window.addEventListener('blur',()=>finishTimeDrag(true));
    document.addEventListener('click',e=>{
      const l=e.target.closest?.('[data-v6-location]');if(l){e.preventDefault();e.stopImmediatePropagation();switchLoc(l.dataset.v6Location);return}
      const t=e.target.closest?.('[data-v6-time]');
      if(t){
        e.preventDefault();e.stopImmediatePropagation();if(busy||!scheduleReady||(suppressTimeClick&&e.detail!==0))return;
        const d=Number(t.dataset.v6Day),m=Number(t.dataset.v6Time);focusedCell={day:d,time:m};
        if(slots[d].has(m))slots[d].delete(m);else slots[d].add(m);
        setDirty(true);syncTimeButtons();renderStatus();return;
      }
      if(e.target.closest?.('#nadoCustomAreaAdd')){addArea();return}
      if(e.target.closest?.('#saveScheduleButton')){e.preventDefault();e.stopImmediatePropagation();save();return}
      if(e.target.closest?.('#clearScheduleButton')){e.preventDefault();e.stopImmediatePropagation();if(busy||!scheduleReady)return;finishTimeDrag(true);reset();setDirty(true);syncTimeButtons();renderStatus()}
    },true);
    document.addEventListener('change',e=>{
      const a=e.target.closest?.('[data-v6-area]');if(a){e.stopImmediatePropagation();toggleArea(a);return}
      if(e.target?.id==='nadoAreaSelect'){e.stopImmediatePropagation();switchArea(e.target.value);return}
      if(e.target?.id==='scheduleLocation'){e.stopImmediatePropagation();switchLoc(e.target.value)}
    },true);
    document.addEventListener('keydown',e=>{
      if(e.target?.id==='nadoCustomAreaInput'&&e.key==='Enter'){e.preventDefault();addArea();return}
      if(e.key==='Escape'&&dragState){e.preventDefault();finishTimeDrag(true);return}
      const t=e.target.closest?.('[data-v6-time]');if(!t||busy||!scheduleReady)return;
      let column=ORDER.indexOf(Number(t.dataset.v6Day)),time=Number(t.dataset.v6Time);
      if(e.key==='ArrowLeft')column=Math.max(0,column-1);
      else if(e.key==='ArrowRight')column=Math.min(6,column+1);
      else if(e.key==='ArrowUp')time=Math.max(START,time-STEP);
      else if(e.key==='ArrowDown')time=Math.min(END-STEP,time+STEP);
      else if(e.key==='Home'){column=0;if(e.ctrlKey||e.metaKey)time=START}
      else if(e.key==='End'){column=6;if(e.ctrlKey||e.metaKey)time=END-STEP}
      else return;
      e.preventDefault();focusSlot(ORDER[column],time);
    });
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
    document.addEventListener('nado:languagechange',()=>setTimeout(()=>{finishTimeDrag(true);applyLanguage();setDirty(dirty);setBusy(busy)},30));
  }
  async function initializeUser(nextUser){
    if(busy)return;user=nextUser;activeLocation=$('scheduleLocation')?.value==='서울'?'서울':'송도';setBusy(true);
    try{await loadAreas();await loadSchedule();applyLanguage()}
    catch(e){scheduleReady=false;toast('스케줄을 불러오지 못했습니다. 페이지를 새로고침해주세요.','Could not load schedule. Please refresh the page.','error')}
    finally{setBusy(false)}
  }
  async function start(){
    for(let i=0;i<40&&!$('scheduleLocation');i++)await new Promise(r=>setTimeout(r,250));
    if(!installUI())return;events();setBusy(true);
    const {data}=await client.auth.getUser();setBusy(false);
    if(data?.user){await initializeUser(data.user);return}
    client.auth.onAuthStateChange((_e,s)=>{if(s?.user)initializeUser(s.user)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
