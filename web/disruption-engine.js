/* Disruption engine: converts LTA alerts + GTFS-Realtime + observed train behaviour into persistent operational state. */
(function(){
  const KEY="mrt.disruption.timeline.v2",MAX_EVENTS=600,MAX_SNAPSHOTS=240,MAX_INCIDENTS=30;
  const clean=v=>String(v==null?"":v).replace(/[<>]/g,"").slice(0,500);
  // Sentences about one platform ("Do not board at Platform B") describe that platform, not the whole line.
  const sentences=text=>String(text||"").split(/(?<=[.!?;])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  const PLATFORM_RE=/\bplatforms?\s*(?:[AB]|[12])\b|\bplatforms?\b/i;
  const classify=(text,effect)=>{
    const all=sentences(text),rest=all.filter(x=>!PLATFORM_RE.test(x));
    if(all.length&&!rest.length)return"PARTIAL_SERVICE";   // only platform-level notices: the station still has service
    const t=rest.join(" ").toLowerCase()
      .replace(/(?:no )?(?:free )?(?:regular |bridging |shuttle )?bus(?:es)?(?: services?)?(?: (?:are|is))?(?: (?:not|no longer|still))? (?:available|unavailable|running|operating)/g,"")
      .replace(/no (?:free )?(?:regular |bridging )?bus(?:es)? services?/g,"");
    if(/no (?:train )?service|no trains?|suspend|not available|unavailable|not running|not operating/.test(t))return"NO_SERVICE";
    if(/(?:end(?:s|ing)?|terminat\w*|short[- ]?turn\w*|turn(?:s|ing|ed)? back|turnback)(?:\s+\w+){0,3}\s+(?:early|at|before|back)/.test(t)||/terminat\w*\s+early/.test(t)||/end(?:s|ing)?\s+early/.test(t))return"EARLY_TERMINATION";
    if(/shuttle|bridging bus/.test(t)&&/train/.test(t)&&/no service|suspend/.test(t))return"SHUTTLE_OPERATION";
    if(/reduced frequency|reduced service/.test(t))return"REDUCED_FREQUENCY";
    if(/slow|slower|additional (?:travel|travelling) time|delay|delayed|significant|longer waiting/.test(t))return"DELAYED";
    if(/resum|normal/.test(t))return"RECOVERY";
    if(effect===2||effect===3)return"DELAYED";
    return"PARTIAL_SERVICE";
  };
  // Platform-level operational observations are additive to LTA alerts/timetable data.
  // Yishun from LTA's timetable: Platform A is used by trains towards Jurong East, Platform B by trains towards Marina South Pier.
  const YIS={A:{direction:"towards Jurong East",destination:"Jurong East"},B:{direction:"towards Marina South Pier",destination:"Marina South Pier"}};
  const PLATFORM_META={YIS,NS13:YIS,YISHUN:YIS};
  // Other stations: read the platform letters from the packed LTA timetable when the page has it.
  const ttPlatformMeta=code=>{
    try{
      if(typeof TT==="undefined"||!TT||typeof LINES==="undefined")return null;
      const out={};
      for(const ln of Object.keys(LINES)){
        const st=LINES[ln].stations||[],P=TT.lines&&TT.lines[ln]&&TT.lines[ln].plat;if(!P)continue;
        st.forEach((s,i)=>{if(s[0]!==code||!P[i])return;
          [[0,st[st.length-1]],[1,st[0]]].forEach(([d,end])=>{const k=P[i][d];if(k&&!out[k])out[k]={direction:"towards "+end[1],destination:end[1]}})});
      }
      return Object.keys(out).length?out:null;
    }catch(e){return null}
  };
  const platformNorm=x=>String(x==null?"":x).toUpperCase().replace(/\s+/g,"").replace(/^PLATFORM/,"");
  const platformState=x=>{const t=String(x==null?"":x).toUpperCase();if(/DO.?NOT.?BOARD|NOT.?TO.?BOARD|CLOSED|UNAVAILABLE|NOT.?IN.?USE|NOT.?IN.?SERVICE|NO.?BOARD|NO.?(?:TRAIN.?)?SERVICE|SUSPENDED/.test(t))return"DO_NOT_BOARD";if(/BOARD|OPEN|AVAILABLE|IN.?USE|IN.?SERVICE|OPERATING|OPERATIONAL|RUNNING|CONTINU/.test(t))return"OPEN";return String(x||"").toUpperCase()||"UNKNOWN"};
  // Platform notices inside LTA's wording: "Do not board at Yishun Platform B", "Platform A remains open".
  const messagePlatforms=(s,msgs)=>{
    const out=[],codes=s.codes||[];
    for(const m of (msgs||[]))for(const sen of sentences(m&&m.text))for(const cl of sen.split(/,(?!\s*[AB12]\b)|\s+(?:while|but|whereas)\s+/i)){
      const re=/platforms?\s*([AB12])\b(?:\s*(?:and|&|,)\s*([AB12])\b)?/ig;let q;
      while((q=re.exec(cl))){
        let state=platformState(cl);if(state!=="DO_NOT_BOARD"&&state!=="OPEN")state=platformState(sen);if(state!=="DO_NOT_BOARD"&&state!=="OPEN")continue;
        const low=sen.toLowerCase(),at=codes.find(c=>typeof NAME_OF!=="undefined"&&NAME_OF[c]&&low.indexOf(String(NAME_OF[c]).toLowerCase())>=0)||(/yishun/.test(low)?"NS13":codes[0]||s.line);
        for(const p of [q[1],q[2]].filter(Boolean))out.push({station:at,platform:p,state,source:"LTA message",text:sen});
      }
    }
    return out;
  };
  const platformStates=(s,msgs,rt)=>{
    const codes=new Set((s.codes||[]).map(x=>String(x).toUpperCase()));
    const names=(typeof NAME_OF!=="undefined"?(s.codes||[]).map(c=>NAME_OF[c]).filter(Boolean):[]).map(x=>String(x).toUpperCase());
    let raw=[];
    if(Array.isArray(s.platforms))raw.push(...s.platforms);
    if(Array.isArray(rt&&rt.platforms))raw.push(...rt.platforms);
    else if(rt&&rt.platforms&&typeof rt.platforms==="object")Object.values(rt.platforms).forEach(v=>Array.isArray(v)?raw.push(...v):raw.push(v));
    raw.push(...messagePlatforms(s,msgs));
    const out=[];
    for(const p of raw){
      if(!p||typeof p!=="object")continue;
      const st=String(p.station||p.stop||p.code||"").toUpperCase();
      if(st&&st!==String(s.line||"").toUpperCase()&&!codes.has(st)&&!names.includes(st)&&!names.some(n=>st.includes(n)))continue;
      const k=platformNorm(p.platform||p.platformId||p.name);if(!k)continue;
      const meta=(PLATFORM_META[st]||ttPlatformMeta(st)||(!st&&(PLATFORM_META[String((s.codes||[])[0]||"").toUpperCase()]||ttPlatformMeta(String((s.codes||[])[0]||"").toUpperCase())))||{})[k]||{};
      out.push({platform:k,state:platformState(p.state||p.status||p.text),direction:String(p.direction||meta.direction||""),destination:String(p.destination||meta.destination||""),source:String(p.source||"observation")});
    }
    const seen=new Set();
    return out.filter(x=>{const k=x.platform;if(seen.has(k))return false;seen.add(k);return true}).slice(0,8);
  };
  const lineMessages=(s,alert)=>{
    const msgs=(alert&&alert.messages)||[],names=(s.codes||[]).map(c=>typeof NAME_OF!=="undefined"&&NAME_OF[c]||c);
    const line=String(s.ltaLine||"").toLowerCase();
    return msgs.filter(m=>{
      const t=String(m.text||"").toLowerCase();
      return !line&&!names.length||line&&t.indexOf(line)>=0||names.some(n=>n&&t.indexOf(String(n).toLowerCase())>=0);
    });
  };
  const baseState=(s,alert,rt)=>{
    const msgs=lineMessages(s,alert), texts=(msgs.length?msgs:(alert&&alert.messages||[])).map(x=>x.text);
    const states=texts.map(x=>classify(x,0));
    if(s.noService||states.includes("NO_SERVICE"))return"NO_SERVICE";
    if(states.includes("EARLY_TERMINATION"))return"EARLY_TERMINATION";
    if(states.includes("SHUTTLE_OPERATION"))return"SHUTTLE_OPERATION";
    if(s.running||states.includes("DELAYED")||states.includes("REDUCED_FREQUENCY"))return states.includes("REDUCED_FREQUENCY")?"REDUCED_FREQUENCY":"DELAYED";
    const routes=(rt&&rt.alerts)||[], code=String(s.ltaLine||s.line||"").toUpperCase();
    const rr=routes.filter(a=>(a.routes||[]).some(r=>String(r).toUpperCase().includes(code)));
    if(rr.some(a=>/no service|suspended|not available/i.test((a.head||"")+" "+(a.text||""))))return"NO_SERVICE";
    if(rr.length)return"DELAYED";
    return texts.length?classify(texts.join(" "),0):"PARTIAL_SERVICE";
  };
  // Platform states refine the section: one platform still boarding keeps a limited (partial) service,
  // every known platform closed at a one-station section means no service there.
  const platformService=plats=>{
    const open=plats.filter(p=>p.state==="OPEN"),shut=plats.filter(p=>p.state==="DO_NOT_BOARD");
    if(open.length&&shut.length)return"ONE_PLATFORM_OPEN";
    if(shut.length>=2&&!open.length)return"ALL_PLATFORMS_CLOSED";
    if(shut.length)return"PLATFORM_CLOSED";
    return"";
  };
  const sectionState=(s,alert,rt,plats)=>{
    const base=baseState(s,alert,rt),ps=platformService(plats||[]),stretch=(s.codes||[]).length>1;
    if(base==="NO_SERVICE"&&ps==="ONE_PLATFORM_OPEN"&&!(s.noService&&stretch))return"PARTIAL_SERVICE";
    if(base==="PARTIAL_SERVICE"&&ps==="ALL_PLATFORMS_CLOSED"&&!stretch)return"NO_SERVICE";
    return base;
  };
  const summarize=(alert,rt)=>{
    const segs=(alert&&alert.segments)||[],alerts=(rt&&rt.alerts)||[],lines=new Set(),sections=[];
    for(const s of segs){
      for(const l of (s.lines||[s.line]).filter(Boolean))lines.add(l);
      const msgs=lineMessages(s,alert),bus=[].concat(s.busText||[],s.bus||[],s.shuttle||[]).filter(Boolean),plats=platformStates(s,msgs.length?msgs:((alert&&alert.messages)||[]),rt);   // same messages the state is read from
      sections.push({line:s.line||(s.lines||[])[0]||"",lines:s.lines||[],codes:(s.codes||[]).slice(0,40),direction:clean(s.direction),state:sectionState(s,alert,rt,plats),platforms:plats,platformService:platformService(plats),bus:bus.slice(0,20),message:clean(msgs[0]&&msgs[0].text||"")});
    }
    for(const a of alerts)for(const l of(a.routes||[]))lines.add(String(l).toUpperCase());
    const trips=Object.values((rt&&rt.trips)||{});
    const counts={cancelled:trips.filter(x=>x.x).length,added:trips.filter(x=>x.add).length,
      early:trips.filter(x=>(x.s||[]).some(q=>q[4]===1)).length,delayed:trips.filter(x=>!x.x&&Math.abs(x.d||0)>=30).length,
      liveTrips:trips.length,liveMatched:0,live:trips.length,turnbacks:0,turning:0,trains:0};
    const observed={};
    for(const s of sections){
      if(!s.line||typeof trainsOn!=="function")continue;
      let ts=[];try{ts=trainsOn(s.line,sgNow(),true)||[]}catch(e){}
      const m={trains:ts.length,turnbacks:0,turning:0,extra:0,early:0};
      for(const t of ts){
        if(t.turned!=null||t.cut!=null)m.turnbacks++;if(t.turning)m.turning++;if(t.added)m.extra++;if(t.cutLTA)m.early++;
        try{
          const fresh=rt&&rt.at&&Date.now()-rt.at<=10*60e3,tid=t.ref&&t.ref.tid!=null?String(t.ref.tid):"";
          if(fresh&&tid&&rt.trips&&rt.trips[tid])counts.liveMatched++;
        }catch(e){}
      }
      observed[s.line]=m;counts.trains+=m.trains;counts.turnbacks+=m.turnbacks;counts.turning+=m.turning;counts.added=Math.max(counts.added,m.extra);counts.early=Math.max(counts.early,m.early);
    }
    return {lines:[...lines].filter(Boolean),sections,counts,observed,at:Date.now()};
  };
  const signature=s=>JSON.stringify({lines:s.lines,sections:s.sections,counts:s.counts});
  const read=()=>{try{return store.get(KEY,{day:"",events:[],snapshots:[],incidents:[]})||{day:"",events:[],snapshots:[],incidents:[]}}catch(e){return{day:"",events:[],snapshots:[],incidents:[]}}};
  const write=x=>{try{store.set(KEY,x)}catch(e){}};
  function observe(reason){
    try{
      const day=typeof sgNow==="function"?sgNow().iso:new Date().toISOString().slice(0,10);
      const alert=typeof alertState!=="undefined"?alertState:null,rt=typeof rtState!=="undefined"?rtState:null;
      const snap=summarize(alert,rt),data=read();
      if(data.day!==day){data.day=day;data.events=[];data.snapshots=[];data.incidents=[]}
      const sig=signature(snap),last=data.snapshots[0];
      if(!last||last.sig!==sig){
        const state=snap.sections.length?snap.sections.map(x=>x.state).join(","):"NORMAL";
        const ev={at:snap.at,day,reason:clean(reason||"refresh"),state,lines:snap.lines,sections:snap.sections,counts:snap.counts,observed:snap.observed,sig};
        try{const prev=last&&last.summary&&last.summary.state||"NORMAL";if(prev!==state&&window.__mrtDiag)window.__mrtDiag.push(state==="NORMAL"?"info":"warn","disruption","Disruption state: "+prev+" → "+state,{reason:clean(reason||"refresh"),lines:snap.lines,platforms:snap.sections.flatMap(x=>(x.platforms||[]).map(p=>(x.codes||[])[0]+" "+p.platform+" "+p.state))})}catch(x){}
        data.events.unshift(ev);data.snapshots.unshift({at:snap.at,sig,summary:ev});
        data.events=data.events.slice(0,MAX_EVENTS);data.snapshots=data.snapshots.slice(0,MAX_SNAPSHOTS);
        const active=state!=="NORMAL";
        if(active&&(!data.incidents.length||data.incidents[0].state==="RESOLVED")){
          data.incidents.unshift({id:"d"+snap.at.toString(36),day,startedAt:snap.at,state:"ACTIVE",events:[ev],lastAt:snap.at});
        }else if(active&&data.incidents[0]){
          data.incidents[0].events.unshift(ev);data.incidents[0].lastAt=snap.at;data.incidents[0].sections=snap.sections;
        }else if(!active&&data.incidents[0]&&data.incidents[0].state==="ACTIVE"){
          data.incidents[0].state="RESOLVED";data.incidents[0].endedAt=snap.at;data.incidents[0].durationMin=Math.round((snap.at-data.incidents[0].startedAt)/60000);
        }
        data.incidents=data.incidents.slice(0,MAX_INCIDENTS);
        write(data);
      }
      return snap;
    }catch(e){try{window.__mrtDiag&&window.__mrtDiag.push("error","disruption","Disruption engine failed: "+(e&&e.message||e),{reason:String(reason||""),stack:String(e&&e.stack||"").slice(0,2000)})}catch(x){}return null}
  }
  function snapshot(){const d=read();return{day:d.day||"",events:d.events||[],snapshots:d.snapshots||[],incidents:d.incidents||[]}}
  function stats(){const d=read(),ev=d.events||[],peak=k=>ev.reduce((n,x)=>Math.max(n,(x.counts&&x.counts[k])||0),0);
    return{day:d.day||"",events:ev.length,states:[...new Set(ev.map(x=>x.state).filter(Boolean))],changes:ev.filter(x=>x.state!=="NORMAL").length,added:peak("added"),cancelled:peak("cancelled"),early:peak("early"),turnbacks:peak("turnbacks"),trains:peak("trains"),liveTrips:peak("liveTrips"),liveMatched:peak("liveMatched")}}
  function replay(){const d=read();return{day:d.day||"",version:2,events:(d.events||[]).map(x=>({at:x.at,state:x.state,lines:x.lines||[],sections:x.sections||[],counts:x.counts||{},observed:x.observed||{}})),incidents:d.incidents||[]}}
  function html(){
    const s=stats(),d=read();if(!s.events)return"";
    const active=d.incidents&&d.incidents[0]&&d.incidents[0].state==="ACTIVE",states=s.states.filter(x=>x!=="NORMAL");
    const recent=(d.events||[]).slice(0,6).map(x=>{const pp=(x.sections||[]).flatMap(s=>(s.platforms||[]).map(p=>(s.codes||[])[0]+" "+p.platform+" "+p.state));return '<div class="rt-dis"><b>'+esc(new Date(x.at).toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"}))+" · "+esc(x.state||"NORMAL")+'</b><span>'+esc((x.lines||[]).join(", ")||"No affected line")+(pp.length?" · "+esc(pp.join(", ")):"")+(x.counts&&x.counts.turnbacks?" · "+x.counts.turnbacks+" turnbacks":"")+'</span></div>'}).join("");
    return'<div class="rt-dis-wrap"><div class="hsub">Disruption intelligence '+(active?'<span class="hstat warn">LIVE</span>':'<span class="hstat old">REPLAY SAVED</span>')+'</div><div class="rt-dis"><b>'+
      esc(states.join(" · ")||"Normal service")+'</b><span>'+s.changes+" operational state change"+(s.changes===1?"":"s")+" recorded today · peak "+s.trains+" timetable/inferred trains · peak "+s.liveMatched+" GTFS-RT-matched trains · "+s.liveTrips+" GTFS-RT trip updates · "+s.turnbacks+" turnbacks · "+s.early+" early-ending observations</span></div>"+
      '<details><summary>Incident timeline & replay</summary>'+recent+'<div style="margin-top:8px"><button class="btn ghost" type="button" id="disReplayCopy">Copy replay JSON</button></div></details></div>';
  }
  document.addEventListener("click",e=>{const b=e.target.closest("#disReplayCopy");if(!b)return;b.textContent=(()=>{try{navigator.clipboard.writeText(JSON.stringify(replay(),null,2));return"Replay copied"}catch(x){return"Copy failed"}})();setTimeout(()=>{if(b.isConnected)b.textContent="Copy replay JSON"},1500)});
  window.mrtDisruptionObserve=observe;window.mrtDisruptionEngineSnapshot=snapshot;window.mrtDisruptionStats=stats;
  window.mrtDisruptionClassify=classify;window.mrtDisruptionPlatformStates=platformStates;window.mrtDisruptionSummarize=summarize;window.mrtDisruptionReplay=replay;window.mrtDisruptionEngineHTML=html;window.mrtDisruptionPlatformService=platformService;
})();