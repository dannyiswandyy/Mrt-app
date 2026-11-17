(() => {
  if (window.__spotterScheduleLoaded) return; window.__spotterScheduleLoaded = true;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2,'0');
  const hm = sec => { sec=Math.round(sec); let h=Math.floor(sec/3600)%24,m=Math.floor((sec%3600)/60); return pad(h)+':'+pad(m); };
  const today = () => typeof sgNow === 'function' ? sgNow().iso : new Date().toISOString().slice(0,10);
  const sunday = () => { const d=new Date(today()+'T00:00:00Z'),w=d.getUTCDay(); d.setUTCDate(d.getUTCDate()+((7-w)%7||7)); return d.toISOString().slice(0,10); };
  const lname = c => c==='CG'?'CGL':c;

  const style=document.createElement('style');
  style.textContent=`
#spotterScheduleBtn{
  position:fixed;right:14px;bottom:88px;z-index:9000;border:1px solid var(--rule);
  border-radius:18px;padding:11px 15px;background:var(--fg);color:var(--bg);
  font:800 13px var(--body);box-shadow:0 5px 20px rgba(0,0,0,.25);cursor:pointer
}
#spotterScheduleBtn:hover{filter:brightness(1.08)}
/* on Home it's one of the tiles, like the rest of the app's tools */
.tiles #spotterScheduleBtn{position:relative;right:auto;bottom:auto;z-index:auto;background:var(--panel);color:var(--fg);
  border:1px solid var(--rule);border-radius:16px;padding:12px;font:600 14.5px var(--body);box-shadow:var(--shadow-soft)}
.tiles #spotterScheduleBtn:hover{filter:none;background:var(--soft)}
#spotterScheduleMask{
  position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.42);display:none;
  padding:clamp(8px,3vw,24px);box-sizing:border-box;overflow:auto;
  -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)
}
#spotterSchedule{
  max-width:760px;margin:2vh auto;background:var(--panel);color:var(--fg);
  border:1px solid var(--rule);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.42);
  overflow:hidden;min-height:0
}
#spotterSchedule .ssHead{
  position:sticky;top:0;z-index:2;padding:16px 18px;background:var(--panel);
  border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;gap:12px
}
#spotterSchedule .ssTitle{display:flex;align-items:center;gap:10px;min-width:0}
#spotterSchedule .ssIcon{
  width:38px;height:38px;border-radius:11px;background:var(--soft);display:grid;place-items:center;
  flex:0 0 auto;font-size:20px
}
#spotterSchedule h2{margin:0;font:700 21px/1.1 var(--display);letter-spacing:.01em}
#spotterSchedule .ssSub{margin:3px 0 0;color:var(--muted);font:500 12px var(--body)}
#spotterSchedule .ssClose{
  background:var(--soft);color:var(--fg);border:1px solid var(--rule);width:40px;height:40px;
  border-radius:12px;font-size:22px;line-height:1;cursor:pointer;flex:0 0 auto
}
#spotterSchedule .ssBody{padding:16px 18px 22px}
#spotterSchedule label{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:10px 0 5px}
#spotterSchedule select,#spotterSchedule input{
  width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--rule);border-radius:10px;
  background:var(--bg);color:var(--fg);font:500 14px var(--body);min-height:42px
}
#spotterSchedule select:focus,#spotterSchedule input:focus,#spotterSchedule button:focus-visible{
  outline:2px solid var(--fg);outline-offset:2px
}
#spotterSchedule .ssGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}
#spotterSchedule .ssActions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
#spotterSchedule .ssPrimary{
  border:0;border-radius:11px;padding:11px 15px;font:800 13px var(--body);
  background:var(--fg);color:var(--bg);cursor:pointer
}
#spotterSchedule .ssSecondary{
  border:1px solid var(--rule);border-radius:11px;padding:10px 13px;font:700 13px var(--body);
  background:var(--panel);color:var(--fg);cursor:pointer
}
#spotterSchedule .ssQuick{display:flex;gap:6px;overflow-x:auto;padding:3px 0 1px;scrollbar-width:none}
#spotterSchedule .ssQuick::-webkit-scrollbar{display:none}
#spotterSchedule .ssQuick button{
  flex:0 0 auto;border:1px solid var(--rule);border-radius:999px;padding:7px 10px;
  background:var(--panel);color:var(--fg);font:700 12px var(--body);cursor:pointer
}
#spotterSchedule .ssQuick button[aria-selected="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
#spotterSchedule .ssSummary{
  margin:15px 0 8px;padding:13px;border-radius:13px;background:var(--soft);
  border:1px solid var(--rule);display:grid;gap:2px
}
#spotterSchedule .ssSummary b{font:700 18px var(--display)}
#spotterSchedule .ssSummary .ssSummaryMeta{font-size:12px;color:var(--muted)}
#spotterSchedule .ssCount{
  display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;
  padding:0 7px;border-radius:999px;background:var(--fg);color:var(--bg);font:800 11px var(--mono);margin-left:5px
}
#spotterSchedule .ssRow{
  display:grid;grid-template-columns:62px 28px minmax(0,1fr);gap:9px;align-items:center;
  padding:11px 5px;border-bottom:1px solid var(--rule)
}
#spotterSchedule .ssRow:last-child{border-bottom:0}
#spotterSchedule .ssTime{font:800 16px var(--mono);font-variant-numeric:tabular-nums}
#spotterSchedule .ssDir{font-size:18px;font-weight:900;text-align:center}
#spotterSchedule .ssSlot{font:800 14px var(--body)}
#spotterSchedule .ssMeta{font-size:11px;color:var(--muted);line-height:1.35}
#spotterSchedule .ssEmpty{padding:20px 4px;color:var(--muted);text-align:center}
#spotterSchedule .ssNote{
  margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--warnbg);
  color:var(--warn);font-size:12px;line-height:1.4
}
@media(max-width:560px){
  #spotterScheduleMask{padding:7px}
  #spotterSchedule{margin:0 auto;border-radius:18px}
  #spotterSchedule .ssGrid{grid-template-columns:1fr}
  #spotterSchedule .ssHead{padding:13px 14px}
  #spotterSchedule .ssBody{padding:13px 14px 20px}
  #spotterSchedule .ssRow{grid-template-columns:54px 25px minmax(0,1fr);gap:7px}
  #spotterSchedule .ssTitle h2{font-size:18px}
}
@media(min-width:900px){#spotterSchedule{margin-top:4vh}}
`;
  document.head.appendChild(style);

  const btn=document.createElement('button');
  btn.id='spotterScheduleBtn';btn.type='button';btn.setAttribute('aria-haspopup','dialog');
  const tiles=document.querySelector('#viewHome .tiles');
  if (tiles){
    btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="2"/></svg>Spotter schedule<span>Plan a spotting run</span>';
    tiles.appendChild(btn);
  } else { btn.textContent='📸 Spotter schedule'; document.body.appendChild(btn); }

  const mask=document.createElement('div');
  mask.id='spotterScheduleMask';mask.setAttribute('role','presentation');
  mask.innerHTML=`<section id='spotterSchedule' role='dialog' aria-modal='true' aria-labelledby='ssTitle'>
    <div class='ssHead'>
      <div class='ssTitle'><div class='ssIcon'>📸</div><div><h2 id='ssTitle'>Train Spotter Schedule</h2><div class='ssSub'>Build a spotting run from the LTA timetable</div></div></div>
      <button class='ssClose' id='ssClose' aria-label='Close'>×</button>
    </div>
    <div class='ssBody'>
      <div class='ssGrid'>
        <div><label>Line</label><select id='spotLine'></select></div>
        <div><label>Station</label><select id='spotStation'></select></div>
        <div><label>Date</label><input id='spotDate' type='date'></div>
        <div><label>Time window</label><select id='spotWindow'>
          <option value='0'>All day</option><option value='5'>05:00–09:00</option><option value='9'>09:00–12:00</option>
          <option value='12'>12:00–15:00</option><option value='15'>15:00–18:00</option><option value='18'>18:00–21:00</option><option value='21'>21:00–24:00</option>
        </select></div>
      </div>
      <label>Quick window</label>
      <div class='ssQuick' id='ssQuick' role='tablist' aria-label='Quick time window'>
        <button type='button' data-win='0' aria-selected='true'>All day</button>
        <button type='button' data-win='5'>AM</button>
        <button type='button' data-win='9'>Late morning</button>
        <button type='button' data-win='12'>Non-peak</button>
        <button type='button' data-win='15'>PM</button>
        <button type='button' data-win='18'>Evening</button>
      </div>
      <div class='ssActions'><button class='ssPrimary' id='ssGenerate'>Generate schedule</button><button class='ssSecondary' id='ssToday'>Next Sunday</button></div>
      <div id='ssResult'></div>
    </div>
  </section>`;
  document.body.appendChild(mask);

  const lineSel=mask.querySelector('#spotLine'),stationSel=mask.querySelector('#spotStation'),
    spotDate=mask.querySelector('#spotDate'),winSel=mask.querySelector('#spotWindow'),result=mask.querySelector('#ssResult'),
    quick=mask.querySelector('#ssQuick');

  spotDate.value=sunday();

  function lines(){return Object.keys(LINES||{}).filter(c=>{try{return !!ttTrips(c,spotDate.value)}catch(e){return false}}).sort();}
  function fillLines(keep){
    const old=keep||lineSel.value, ls=lines();
    lineSel.innerHTML=ls.map(c=>'<option value="'+esc(c)+'">'+esc(lname(c))+'</option>').join('');
    if(ls.includes(old)) lineSel.value=old;
  }
  fillLines();

  function stations(){const L=LINES[lineSel.value];return L?activeStations(L,spotDate.value):[];}
  function fillStations(keep){
    const ss=stations(), old=keep!=null?String(keep):stationSel.value;
    stationSel.innerHTML=ss.map((s,i)=>'<option value="'+i+'">'+esc(s[1])+'</option>').join('');
    if([...stationSel.options].some(o=>o.value===old))stationSel.value=old;
  }
  fillStations();

  function setWindow(v){
    winSel.value=String(v);
    quick.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.win===String(v)?'true':'false'));
  }
  quick.addEventListener('click',e=>{const b=e.target.closest('button[data-win]');if(b)setWindow(b.dataset.win)});
  winSel.addEventListener('change',()=>setWindow(winSel.value));

  lineSel.addEventListener('change',()=>{fillStations();});
  spotDate.addEventListener('change',()=>{const old=lineSel.value;fillLines(old);fillStations();setWindow(winSel.value);});

  function slotText(code,r){
    const a=ttSlotOf(r.tid);if(!a)return '';
    const list=ttTrips(code,spotDate.value),n=list?ttLinks(list).next.get(r):null,b=n?ttSlotOf(n.tid):'';
    return b && b !== a ? a+' → '+b : a;
  }

  function generate(){
    const code=lineSel.value,iso=spotDate.value,si=+stationSel.value,runs=ttTrips(code,iso),sts=activeStations(LINES[code],iso),st=sts[si];
    if(!runs||!st){result.innerHTML='<div class="ssEmpty">No timetable is available for this selection.</div>';return;}
    let from=0,to=86400,w=+winSel.value;
    if(w){from=w*3600;to=Math.min(86400,(w+4)*3600);}
    const rows=[];
    for(const r of runs){
      const k=(si-r.p.f)/r.p.d;
      if(!Number.isInteger(k)||k<0||k>=r.p.dep.length)continue;
      const t=r.s+r.p.dep[k];if(t>=from&&t<to)rows.push({t,r,k});
    }
    rows.sort((a,b)=>a.t-b.t);

    let html='<div class="ssSummary"><b>'+esc(lname(code))+' · '+esc(st[1])+' <span class="ssCount">'+rows.length+'</span></b>'+
      '<div class="ssSummaryMeta">'+esc(iso)+' · '+(rows.length?hm(rows[0].t):'—')+'–'+(rows.length?hm(rows[rows.length-1].t):'—')+'</div>'+
      '<div class="ssSummaryMeta">'+(w?('Window '+hm(from)+'–'+hm(to)): 'Full service day')+' · LTA GTFS timetable</div></div>';

    if(!rows.length){result.innerHTML=html+'<div class="ssEmpty">No scheduled departures in this window.</div>';return;}

    html+=rows.map(x=>{
      const idx=x.r.p.f+x.r.p.d*x.k,last=x.r.p.f+x.r.p.d*(x.r.p.arr.length-1),
        arrow=idx===last?'↻':x.r.p.d>0?'→':'←',end=sts[last],
        slot=slotText(code,x.r),plat=typeof platOf==='function'?platOf(code,si,x.r.p.d>0?1:0):'';
      return '<div class="ssRow"><div class="ssTime">'+hm(x.t)+'</div><div class="ssDir">'+arrow+'</div><div>'+
        '<div class="ssSlot">'+esc(slot?'Slot '+slot:'Scheduled trip')+'</div>'+
        '<div class="ssMeta">towards '+esc(end?end[1]:'end station')+(plat?' · Platform '+esc(plat):'')+'</div>'+
        '<div class="ssMeta">'+esc(x.r.tid)+'</div></div></div>';
    }).join('');
    html+='<div class="ssNote">Times are scheduled LTA GTFS movements. Live delays or operational changes may differ.</div>';
    result.innerHTML=html;
  }

  function open(){
    mask.style.display='block';document.body.style.overflow='hidden';generate();
    setTimeout(()=>mask.querySelector('#ssClose').focus(),0);
  }
  function close(){mask.style.display='none';document.body.style.overflow='';btn.focus();}
  btn.onclick=open;mask.querySelector('#ssClose').onclick=close;
  mask.addEventListener('click',e=>{if(e.target===mask)close()});
  mask.querySelector('#ssGenerate').onclick=generate;
  mask.querySelector('#ssToday').onclick=()=>{spotDate.value=sunday();fillLines(lineSel.value);fillStations();generate();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mask.style.display==='block')close()});
})();