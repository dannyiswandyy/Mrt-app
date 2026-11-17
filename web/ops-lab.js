/* MRT Ops Lab — developer-only live operations cockpit.
 * The production app and website ship this module for code parity, but MRT_PRODUCTION keeps it inert.
 * It builds on the existing LTA timetable/live model and local operating-history records; it does not invent
 * official train positions or claim access to signalling/control systems.
 */
(()=>{"use strict";
if(window.MRT_PRODUCTION || window.MRT_DEV_FEATURES===false)return;
if(window.__MRT_OPS_LAB__)return; window.__MRT_OPS_LAB__=1;

const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const now=()=>typeof sgNow==="function"?sgNow():{iso:new Date().toISOString().slice(0,10),mins:new Date().getHours()*60+new Date().getMinutes()};
const lines=["NSL","EWL","CG","NEL","CCL","DTL","TEL","BP","SE","SW","PE","PW","RTS","SEN"];
const lineName=c=>({NSL:"North-South Line",EWL:"East-West Line",CG:"Changi Airport Branch",NEL:"North East Line",CCL:"Circle Line",DTL:"Downtown Line",TEL:"Thomson-East Coast Line",BP:"Bukit Panjang LRT",SE:"Sengkang LRT",SW:"Sengkang LRT",PE:"Punggol LRT",PW:"Punggol LRT",RTS:"RTS Link",SEN:"Sentosa Express"})[c]||c;
const colour=c=>getComputedStyle(document.documentElement).getPropertyValue("--"+c).trim()||"#c2410c";
const hm=ts=>{const d=new Date(Number(ts)||Date.now());return d.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})};
const minsAgo=ts=>Math.max(0,Math.round((Date.now()-Number(ts||Date.now()))/60000));
const liveTrains=()=>{
 const out=[];
 if(typeof trainsOn!=="function")return out;
 const n=now();
 for(const c of lines){
   try{for(const t of (trainsOn(c,n,true)||[]))out.push({...t,code:c})}catch(_){}
 }
 return out;
};
const stateFor=t=>{
 const age=t._age||0;
 const live=!!(window.rtState&&window.rtState.lastUpdate);
 const confidence=live?Math.min(98,Math.max(72,96-age/10)):75;
 let state=t.layover?"TURNBACK / LAYOVER":t.atStation?"DWELLING":"RUNNING";
 if(t.to!=null&&t.to!==t.next)state="TURNING / SHORT TRIP";
 return {state,confidence:Math.round(confidence)};
};
const history=()=>{
 try{
  const x=JSON.parse(localStorage.getItem("mrt.operating.history.v1")||"null");
  return x&&Array.isArray(x.events)?x:{day:"",events:[]};
 }catch(_){return {day:"",events:[]}}
};

const style=document.createElement("style");
style.textContent=`
#opsLabBtn{position:fixed;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:75;border:0;border-radius:999px;background:#c2410c;color:#fff;font:700 12px var(--body);letter-spacing:.04em;padding:10px 14px;box-shadow:0 5px 18px rgba(0,0,0,.28);cursor:pointer}
#opsLabBtn b{font:800 9px var(--mono);opacity:.8;margin-left:5px}
#opsLab{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.5);display:none}
#opsLab.open{display:block}
#opsSheet{position:absolute;inset:auto 0 0;max-height:92vh;overflow:auto;background:var(--panel);color:var(--fg);border-radius:18px 18px 0 0;border-top:5px solid #c2410c;padding:14px 14px calc(22px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 34px rgba(0,0,0,.3)}
.opsHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.opsHead h2{margin:0;font:800 21px var(--display);text-transform:uppercase}.opsClose{border:0;background:var(--soft);color:var(--fg);border-radius:50%;width:38px;height:38px;font-size:20px}
.opsTabs{display:flex;gap:5px;overflow:auto;margin:10px 0}.opsTabs button{border:1px solid var(--rule);background:var(--panel);color:var(--muted);border-radius:8px;padding:7px 10px;font:600 12px var(--body);white-space:nowrap}.opsTabs button.on{background:var(--fg);color:var(--bg)}
.opsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.opsCard{border:1px solid var(--rule);border-radius:10px;padding:9px;background:var(--panel)}.opsCard b{font:800 20px var(--mono)}.opsCard small{display:block;color:var(--muted);margin-top:2px}
.opsNote{font-size:12px;color:var(--muted);margin:9px 0}.opsRow{display:flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:9px;padding:8px;margin:5px 0;background:var(--panel)}.opsDot{width:9px;height:9px;border-radius:50%;background:var(--c);flex:0 0 auto}.opsRow main{min-width:0;flex:1}.opsRow strong{display:block}.opsRow span{font-size:11px;color:var(--muted)}.opsRow em{font:600 10px var(--mono);font-style:normal;color:var(--muted)}
.opsPill{display:inline-block;padding:2px 6px;border-radius:5px;background:var(--soft);font:700 10px var(--mono);margin-right:4px}.opsHigh{color:var(--good)}.opsMed{color:var(--warn)}.opsLow{color:var(--bad)}
.opsScenario{border:1px solid var(--rule);border-radius:10px;padding:10px;margin:7px 0}.opsScenario h3{margin:0 0 4px;font-size:14px}.opsScenario p{margin:0;color:var(--muted);font-size:12px}.opsScenario button{margin-top:8px;border:1px solid #c2410c;background:transparent;color:#c2410c;border-radius:7px;padding:6px 9px;font:700 11px var(--body)}
.opsTimeline{border-left:2px solid var(--rule);margin:8px 0 8px 7px;padding-left:12px}.opsEvent{position:relative;margin:0 0 9px;font-size:12px}.opsEvent:before{content:"";position:absolute;left:-18px;top:4px;width:7px;height:7px;border-radius:50%;background:#c2410c}.opsEvent small{display:block;color:var(--muted);font:10px var(--mono)}
.opsReplay{display:flex;align-items:center;gap:7px}.opsReplay input{flex:1}.opsReplay output{font:700 12px var(--mono);min-width:48px;text-align:right}
`;
document.head.appendChild(style);

const btn=document.createElement("button");btn.id="opsLabBtn";btn.innerHTML="OPS LAB <b>DEV</b>";document.body.appendChild(btn);
const root=document.createElement("div");root.id="opsLab";root.innerHTML=`
 <section id="opsSheet" role="dialog" aria-modal="true" aria-label="MRT operations lab">
  <div class="opsHead"><h2>Live Operations Lab</h2><button class="opsClose" aria-label="Close">×</button></div>
  <div class="opsTabs"><button data-tab="live" class="on">Live Engine</button><button data-tab="ops">Operations</button><button data-tab="train">Train Inspector</button><button data-tab="history">Replay</button><button data-tab="test">Testing</button></div>
  <div id="opsBody"></div>
 </section>`;
document.body.appendChild(root);
const body=root.querySelector("#opsBody");let tab="live",selected=null;

function renderLive(){
 const ts=liveTrains(), counts={};ts.forEach(t=>counts[t.code]=(counts[t.code]||0)+1);
 const high=ts.filter(t=>stateFor(t).confidence>=85).length;
 body.innerHTML=`<div class="opsGrid">
 <div class="opsCard"><b>${ts.length}</b><small>estimated active trains</small></div>
 <div class="opsCard"><b>${high}</b><small>high-confidence states</small></div>
 <div class="opsCard"><b>${Object.keys(counts).length}</b><small>active rail lines</small></div>
 <div class="opsCard"><b>${hm(Date.now())}</b><small>Singapore time</small></div></div>
 <p class="opsNote">This is the experimental state engine. Positions remain estimates unless supported by live LTA data or an explicit observation. Confidence is an app-derived score, not an official railway signal.</p>
 ${Object.entries(counts).sort().map(([c,n])=>`<div class="opsRow" style="--c:${colour(c)}"><i class="opsDot"></i><main><strong>${c==="CG"?"CGL":c} · ${lineName(c)}</strong><span>${n} active train${n===1?"":"s"}</span></main><em>${Math.round(n/(ts.length||1)*100)}%</em></div>`).join("")}`;
}
function renderOps(){
 const ts=liveTrains();const rows=[];
 for(const t of ts){const s=stateFor(t);if(t.layover||t.atStation||t.to!=null)rows.push({t,s})}
 body.innerHTML=`<p class="opsNote">Operational states are inferred from the timetable/live overlay. They are deliberately labelled as inference rather than official control-system data.</p>
 ${rows.length?rows.slice(0,60).map(({t,s})=>`<div class="opsRow" style="--c:${colour(t.code)}"><i class="opsDot"></i><main><strong>${esc(t.code)} · ${esc(t.id||"train")}</strong><span>${esc(s.state)} · ${Number.isFinite(t.next)?"next stop index "+t.next:"terminal state"}</span></main><em>${s.confidence}%</em></div>`).join(""):"<p class='opsNote'>No unusual operational states are currently inferred.</p>"}
 <div class="opsScenario"><h3>Operational categories</h3><p>Running · Dwelling · Turnback/Layover · Short trip · Depot/engineering inference · Testing movement.</p></div>`;
}
function renderTrain(){
 const ts=liveTrains();const t=selected?ts.find(x=>x.code+"|"+x.id===selected):null;
 if(!t){body.innerHTML=`<p class="opsNote">Choose a train below. Tap a row to inspect its current state, run identity and confidence.</p>${ts.slice(0,80).map(t=>`<button class="opsRow" data-train="${esc(t.code+"|"+t.id)}" style="--c:${colour(t.code)};width:100%;text-align:left"><i class="opsDot"></i><main><strong>${esc(t.code)} · ${esc(t.id||"train")}</strong><span>${t.atStation?"Dwelling":"Running"} · next ${Number.isFinite(t.next)?t.next:"—"}</span></main><em>${stateFor(t).confidence}%</em></button>`).join("")}`;return}
 const s=stateFor(t);const tid=t.ref&&t.ref.tid||"";const slot=(tid.match(/^[^_]+_[^_]+_[^_]+_(\\d+)/)||[])[1]||"—";
 body.innerHTML=`<button class="opsPill" data-back>← all trains</button>
 <div class="opsGrid" style="margin-top:8px"><div class="opsCard"><b>${esc(t.id||"—")}</b><small>${esc(lineName(t.code))}</small></div><div class="opsCard"><b>${esc(slot)}</b><small>scheduled run / slot</small></div><div class="opsCard"><b>${s.confidence}%</b><small>derived confidence</small></div><div class="opsCard"><b>${esc(s.state)}</b><small>current state</small></div></div>
 <div class="opsRow" style="--c:${colour(t.code)}"><i class="opsDot"></i><main><strong>Movement</strong><span>station index ${Number.isFinite(t.idx)?t.idx:"—"} · next ${Number.isFinite(t.next)?t.next:"—"} · ETA ${Number.isFinite(t.eta)?Math.round(t.eta)+" min":"—"}</span></main></div>
 <p class="opsNote">Train identity and slot are derived from the existing timetable model. The slot is a scheduled duty identifier, not proof of the physical trainset.</p>`;
}
function renderHistory(){
 const h=history(), ev=h.events||[], last=ev.slice(-80).reverse();
 body.innerHTML=`<div class="opsReplay"><span>Recent history</span><input id="opsRange" type="range" min="0" max="${Math.max(0,last.length-1)}" value="${Math.max(0,last.length-1)}"><output id="opsOut">${last.length?hm(last[0].ts):"—"}</output></div>
 <p class="opsNote">${esc(h.day||"No operating-history day recorded")} · ${ev.length} local observations. Replay is reconstructed from this device's operating history.</p>
 <div id="opsTimeline" class="opsTimeline">${last.slice(0,20).map(e=>`<div class="opsEvent"><small>${hm(e.ts)} · ${esc(e.code)}</small><b>${esc(e.id||"train")}</b> · ${esc(e.station||"track")} · ${e.lay?"layover":e.at?"dwell":"running"}</div>`).join("")||"<p class='opsNote'>Open the app and let the live engine run to collect history.</p>"}</div>`;
 const range=root.querySelector("#opsRange"),out=root.querySelector("#opsOut"); if(range)range.oninput=()=>{const e=last[+range.value];out.textContent=e?hm(e.ts):"—";};
}
function renderTest(){
 body.innerHTML=`<p class="opsNote"><b>DEV ONLY.</b> These are operational test scenarios. They never alter production timetable data and never appear in the production UI.</p>
 <div class="opsScenario"><h3>New-station testing</h3><p>Model a train running beyond the passenger-service boundary to an unopened station. Passenger boarding remains disabled.</p><button data-scenario="testing">Arm test scenario</button></div>
 <div class="opsScenario"><h3>Extended turnaround</h3><p>Exercise a terminal turnaround longer than the scheduled passenger-service turnaround, such as the extended turn observed during infrastructure testing.</p><button data-scenario="turnback">Arm test scenario</button></div>
 <div class="opsScenario"><h3>Engineering / non-revenue</h3><p>Mark a movement as non-revenue and keep it visible on the operational map without counting it as passenger service.</p><button data-scenario="engineering">Arm test scenario</button></div>
 <p id="opsScenarioMsg" class="opsNote"></p>`;
}
function render(){if(tab==="live")renderLive();else if(tab==="ops")renderOps();else if(tab==="train")renderTrain();else if(tab==="history")renderHistory();else renderTest();}
root.addEventListener("click",e=>{
 const b=e.target.closest("[data-tab]");if(b){tab=b.dataset.tab;root.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("on",x===b));selected=null;render();return}
 const tr=e.target.closest("[data-train]");if(tr){selected=tr.dataset.train;render();return}
 if(e.target.closest("[data-back]")){selected=null;render();return}
 const sc=e.target.closest("[data-scenario]");if(sc){const m=root.querySelector("#opsScenarioMsg");window.mrtDevScenario={type:sc.dataset.scenario,armedAt:typeof simNow==="function"?simNow():Date.now(),passengerService:false};if(m)m.textContent="Armed in DEV memory only. The live timetable is unchanged; use the map/sandbox to exercise the movement.";return}
});
btn.onclick=()=>{root.classList.add("open");render()};root.querySelector(".opsClose").onclick=()=>root.classList.remove("open");root.addEventListener("click",e=>{if(e.target===root)root.classList.remove("open")});
setInterval(()=>{if(root.classList.contains("open"))render()},5000);
window.mrtOpsLab={open:()=>{root.classList.add("open");render()},liveTrains,history,stateFor};
})();