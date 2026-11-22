/* Shared future rail overlay v1. Official station codes/known names; all map coordinates
 * below are illustrative corridor estimates, NOT surveyed track geometry.
 * Sources: LTA 2026 rail development factsheet and official JRL/CRL project pages.
 * Production carries this source but never renders its experimental layers.
 */
(function(root){
  "use strict";
  const LTA = "https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/3/news-releases/next-phase-of-rail-development.html";
  // x east / y south of Singapore map centre, in the same approximate metre space as MAP.
  // Existing stations are resolved against the app's surveyed map coordinates when available.
  const P = (code,name,x,y,existing) => ({code,name:name||"Station "+code,x,y,existing});
  const lines = [
    {id:"JRL_W",name:"Jurong Region Line · West",color:"#0099a8",stage:"Announced · opening in phases from 2028",nodes:[
      P("JS1","Choa Chu Kang",-8376,-3610,"NS4"),P("JS2","JS2 (name unconfirmed)",-8900,-3100),P("JS2A","JS2A (future infill)",-9180,-2750),P("JS3","JS3 (name unconfirmed)",-9500,-2300),
      P("JS4","JS4 (name unconfirmed)",-10300,-1550),P("JS5","JS5 (name unconfirmed)",-10900,-750),P("JS6","JS6 (name unconfirmed)",-11400,100),P("JS7","JS7 (name unconfirmed)",-12200,800),
      P("JS8","Boon Lay",-12690,1507,"EW27"),P("JS9","JS9 (name unconfirmed)",-13600,2000),P("JS10","JS10 (name unconfirmed)",-14100,3100),
      P("JS11","JS11 (name unconfirmed)",-14700,4250),P("JS12","JS12 (name unconfirmed)",-15000,5500)
    ]},
    {id:"JRL_E",name:"Jurong Region Line · East",color:"#0099a8",stage:"Announced · opening stages subject to LTA updates",nodes:[
      P("JE1","JE1 (name unconfirmed)",-9500,-2300),P("JE2","JE2 (name unconfirmed)",-8500,-1800),P("JE3","JE3 (name unconfirmed)",-7950,-400),
      P("JE4","JE4 (name unconfirmed)",-8200,900),P("JE5","Jurong East",-8625,2099,"EW24"),P("JE6","Jurong Town Hall",-8300,3800),
      P("JE7","Pandan Reservoir",-7900,5700)
    ]},
    {id:"JRL_N",name:"Jurong Region Line · NTU branch",color:"#0099a8",stage:"Announced JRL branch",nodes:[
      P("JS8","Boon Lay",-12690,1507,"EW27"),P("JW1","JW1 (name unconfirmed)",-13500,700),P("JW2","JW2 (name unconfirmed)",-14500,400),
      P("JW3","JW3 (name unconfirmed)",-15800,-100),P("JW4","JW4 (name unconfirmed)",-16500,-800),P("JW5","JW5 (name unconfirmed)",-17200,-1100)
    ]},
    {id:"CRL",name:"Cross Island Line · Phases 1–3",color:"#82be35",stage:"Announced · opening progressively from 2030",nodes:[
      P("CR23","Gul Circle",-17738,3613,"EW30"),P("CR22","CR22 (name unconfirmed)",-16400,5200),P("CR21","CR21 (name unconfirmed)",-15100,5500),
      P("CR20","CR20 (name unconfirmed)",-13300,4600),P("CR19","CR19 (name unconfirmed)",-10700,4650),P("CR18","West Coast (working name)",-8500,4700),
      P("CR17","Clementi",-6073,4091,"EW23"),P("CR16","CR16 (name unconfirmed)",-5150,2900),
      P("CR15","King Albert Park",-3966,1818,"DT6"),P("CR14","CR14 (name unconfirmed)",-1300,100),
      P("CR13","Bright Hill",1451,-1255,"TE7"),P("CR12","CR12 (name unconfirmed)",2500,-1550),
      P("CR11","Ang Mo Kio",3310,-1985,"NS16"),P("CR10","CR10 (name unconfirmed)",4700,-2300),
      P("CR9","CR9 (name unconfirmed)",6300,-2500),P("CR8","Hougang",8119,-2190,"NE14"),
      P("CR7","CR7 (name unconfirmed)",10200,-2000),P("CR6","CR6 (name unconfirmed)",12400,-1500),
      P("CR5","Pasir Ris",14407,-2314,"EW1"),P("CR4","CR4 (name unconfirmed)",15700,-2300),
      P("CR3","CR3 (name unconfirmed)",17500,-2800),P("CR2","Aviation Park",19500,-3200)
    ]},
    {id:"CPE",name:"Cross Island · Punggol Extension",color:"#82be35",stage:"Announced · targeted 2032",nodes:[
      P("CP1","Pasir Ris",14407,-2314,"EW1"),P("CP2","CP2 (name unconfirmed)",12800,-3500),
      P("CP3","Riviera",10721,-4697,"PE4"),P("CP4","Punggol",9187,-5878,"NE17")
    ]},
    {id:"WCE",name:"West Coast Extension · first phase",color:"#0099a8",stage:"Engineering studies · proposed connection, not final alignment",nodes:[
      P("JE7","Pandan Reservoir",-7900,5700),P("CR18","West Coast (working name)",-8500,4700)
    ]},
    {id:"DTL2E",name:"Downtown Line 2 Extension",color:"#005eb8",stage:"LTA announced DE1 and DE2/NS6 · target 2035 · locations indicative",nodes:[
      P("DT1","Bukit Panjang",-6417,-2897,"DT1"),P("DE1","DE1 (name unconfirmed)",-7050,-4870),
      P("DE2","DE2 / NS6 interchange (name unconfirmed)",-7450,-6480)
    ]},
    {id:"NS6",name:"North-South Line · NS6 infill",color:"#e4272e",stage:"LTA-announced interchange with DTL2e · target 2035 · location indicative",nodes:[
      P("NS5","Yew Tee",-8057,-5016,"NS5"),P("NS6","NS6 / DE2 interchange (name unconfirmed)",-7450,-6480),
      P("NS7","Kranji",-6434,-8085,"NS7")
    ]},
    {id:"TEL5",name:"Thomson-East Coast Line · Stage 5",color:"#9a7049",stage:"Passenger service scheduled 26 December 2026",nodes:[
      P("TE29","Bayshore",13634,4310,"TE29"),P("TE30","Bedok South",14387,3919,"TE30"),
      P("TE31","Sungei Bedok",15258,3509,"TE31")
    ]},
    {id:"DTL3E",name:"Downtown Line · Stage 3 Extension",color:"#005eb8",stage:"Passenger service scheduled 26 December 2026",nodes:[
      P("DT35","Expo",15852,1820,"DT35"),P("DT36","Xilin",16132,2561,"DT36"),
      P("DT37","Sungei Bedok",15258,3509,"DT37")
    ]},
    {id:"TELe",name:"Thomson-East Coast Line · Terminal 5",color:"#9a7049",stage:"Announced corridor · exact alignment not final",nodes:[
      P("TE31","Sungei Bedok",15300,3800),P("TE32","Changi Terminal 5",18500,2800)
    ]},
    {id:"CRL_T5",name:"Cross Island Line · Terminal 5",color:"#82be35",stage:"Announced T5 interchange · approximate alignment",nodes:[
      P("CR1","Changi Terminal 5",18500,2800),P("CR2","Aviation Park",19500,-3200)
    ]},
    {id:"NS3A",name:"North-South · Brickland infill",color:"#e4272e",stage:"Announced infill · illustrative",nodes:[
      P("NS3","Bukit Gombak",-7565,-751,"NS3"),P("NS3A","Brickland",-8050,-1900),P("NS4","Choa Chu Kang",-8376,-3610,"NS4")
    ]},
    {id:"SEL",name:"Seletar Line · conceptual study corridor",color:"#a887d1",stage:"Feasibility only · no confirmed stations or alignment",concept:true,nodes:[
      P("ST-W","Woodlands area",-3200,-14500),P("ST-S","Sembawang area",800,-14800),P("ST-SW","Sengkang West area",6900,-7200),
      P("ST-SN","Serangoon North area",6000,-3500),P("ST-K","Kallang area",4700,4500),P("ST-G","Greater Southern Waterfront",1400,10500)
    ]},
    {id:"TGL",name:"Tengah Line · conceptual study corridor",color:"#c68c53",stage:"Feasibility only · no confirmed stations or alignment",concept:true,nodes:[
      P("TG-T","Tengah area",-9800,-3500),P("TG-B","Bukit Batok area",-7900,-500),P("TG-Q","Queensway area",-6200,5500),
      P("TG-BM","Bukit Merah area",-2400,7800),P("TG-G","Greater Southern Waterfront",1400,10500)
    ]}
  ];
  // Projected routes use the same line/station-code model as RTS, but are deliberately
  // excluded from active GTFS, service planning and simulated passenger movements.
  // Coordinates are corridor estimates except where the build supplies URA candidates.
  const network = Object.freeze(Object.fromEntries(lines.map(line => [line.id, {
    id:line.id, name:line.name, color:line.color, stage:line.stage, future:true,
    concept:!!line.concept, passengerService:false,
    stations:line.nodes.map(n=>({code:n.code,name:n.name,existing:n.existing||null,x:n.x,y:n.y}))
  }])));
  const stationIndex = new Map();
  for(const line of lines) for(const node of line.nodes){
    const ref={line:line.id,route:line,station:node};
    stationIndex.set(line.id+":"+node.code,ref);
  }
  let selected = null, browseLine = "CRL";
  const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const byCode=(line,code)=>stationIndex.get(line+":"+code)||null;
  const coords=(node,map)=>node.existing && map && map[node.existing] || [node.x,node.y];
  const isExisting=(node,map)=>!!(node.existing && map && map[node.existing]);
  let enabled = false;
  let geometry = null;
  let geometryStatus = "pending";
  // URA fragments are indicative and not proof of a final approved alignment.
  // Keep this diagnostic visible to testers so missing source geometry is never
  // accidentally presented as surveyed track geometry.
  function coverage(){
    const matched=geometry&&geometry.matched||{};
    const routes=lines.filter(line=>!line.concept);
    const withURA=routes.filter(line=>Array.isArray(matched[line.id])&&matched[line.id].length>0);
    return {loaded:!!geometry,status:geometryStatus,withURA:withURA.map(line=>line.id),
      estimated:routes.filter(line=>!withURA.includes(line)).map(line=>line.id),total:routes.length};
  }
  function connectionsHTML(name){
    if(!dev() || !enabled) return "";
    const refs=[...stationIndex.values()].filter(x=>x.station.name===name && !x.route.concept);
    if(!refs.length)return "";
    return '<div class="mi-row"><span><b>Future rail connections · NOT IN SERVICE</b><small style="display:block">'+
      refs.map(x=>esc(x.station.code)+" · "+esc(x.route.name)).join(" · ")+'</small></span></div>';
  }
  // Map hit-testing uses the exact same screen projection as the main RTS/MRT map.
  function hitTest(x,y,opts){
    if(!dev() || !enabled || !opts || typeof opts.sx!=="function")return null;
    const map=opts.stations||{}, radius=Math.min(20,Math.max(11,4+(opts.zoom||1)*1.7));
    let best=null,dist=radius;
    for(const [key,ref] of stationIndex){
      const node=ref.station;
      // Existing interchanges retain the normal active station card.
      if(isExisting(node,map))continue;
      const pt=coords(node,map),d=Math.hypot(opts.sx(pt[0])-x,opts.sy(pt[1])-y);
      if(d<dist){dist=d;best={line:ref.line,code:node.code,x:pt[0],y:pt[1],name:node.name};}
    }
    return best;
  }
  function stationHTML(hit){
    if(!dev() || !enabled)return "";
    const entry=byCode(hit.line,hit.code);
    if(!entry)return '<p class="hint">Future station unavailable.</p>';
    const line=entry.route,node=entry.station;
    const shared=[...stationIndex.values()].filter(x=>x.station.code!==node.code &&
      x.station.name===node.name && x.route.id!==line.id);
    const hasURA=coverage().withURA.includes(line.id);
    return '<div class="mi-h"><span class="code" style="background:'+esc(line.color)+'">'+esc(node.code)+
      '</span><b>'+esc(node.name)+'</b><button class="mi-x" type="button" data-act="close" aria-label="Close">×</button></div>'+
      '<div class="mi-row"><span><b>'+esc(line.name)+'</b></span><span class="mi-t">NOT IN SERVICE</span></div>'+
      '<div class="mi-row"><span>'+esc(line.stage)+'</span></div>'+
      (node.existing?'<div class="mi-row"><span>Interchange with existing '+esc(node.existing)+'</span></div>':"")+
      (shared.length?'<div class="mi-row"><span>Planned connections: '+shared.map(x=>esc(x.route.name)).join(", ")+'</span></div>':"")+
      '<div class="mi-row"><small>'+(hasURA?
      "Indicative URA rail corridor segments available; exact station/track alignment is not confirmed.":
      "Map route is an illustrative estimate; final station/track alignment is not confirmed.")+
      '</small></div><div class="mi-row"><small>No passenger timetable, arrivals or live trains are available for this future route.</small></div>';
  }
  function selectStation(line,code){
    if(!dev() || !enabled)return false;
    const ref=byCode(line,code);if(!ref)return false;
    const pt=coords(ref.station,root.mrtFutureStationMap||{});
    selected={line,code,x:pt[0],y:pt[1],name:ref.station.name};
    if(typeof root.selectFutureRailStation==="function")root.selectFutureRailStation(selected);
    if(typeof api.invalidate==="function")api.invalidate();
    return true;
  }
  function renderPanel(){
    if(!dev()||!root.document)return;
    const panel=document.getElementById("futureRailPanel");
    if(!panel)return;
    const line=lines.find(l=>l.id===browseLine)||lines[0], matched=coverage().withURA.includes(line.id);
    panel.innerHTML='<div style="font-weight:750;margin-bottom:8px">Future lines &amp; stations <span style="font-size:11px;font-weight:400">NOT IN SERVICE</span></div>'+
      '<label for="futureRailLine" style="display:block;font-size:12px;margin-bottom:4px">Rail project</label>'+
      '<select id="futureRailLine" style="width:100%;padding:8px;background:#102a37;color:#fff;border:1px solid #718999;border-radius:6px">'+
      lines.map(l=>'<option value="'+esc(l.id)+'" '+(l.id===line.id?"selected":"")+'>'+esc(l.name)+'</option>').join("")+'</select>'+
      '<p style="font-size:12px;margin:8px 0">'+esc(line.stage)+'</p>'+
      '<p style="font-size:11px;margin:6px 0 10px">'+(matched?"URA candidate geometry + estimates":"Indicative alignment only; no URA corridor match")+'</p>'+
      '<div style="display:grid;gap:5px">'+line.nodes.map(n=>
      '<button type="button" data-future-line="'+esc(line.id)+'" data-future-code="'+esc(n.code)+'" style="text-align:left;padding:7px 8px;border:1px solid #597789;border-radius:6px;background:#183847;color:#fff;cursor:pointer">'+
      '<b style="color:'+esc(line.color)+'">'+esc(n.code)+'</b> · '+esc(n.name)+'</button>').join("")+'</div>'+
      '<p style="font-size:11px;margin:9px 0 0">Select a station to view its future-service information on the map. No trains or ETAs are simulated.</p>';
    panel.querySelector("#futureRailLine").addEventListener("change",e=>{browseLine=e.target.value;renderPanel();});
    panel.querySelectorAll("[data-future-code]").forEach(b=>b.addEventListener("click",()=>{
      selectStation(b.dataset.futureLine,b.dataset.futureCode);
      panel.hidden=true;
    }));
  }
  function updateToggleLabel(){
    if (!root.document) return;
    const button=document.getElementById("futureRailToggle");
    if (!button) return;
    const c=coverage();
    button.textContent="Future rail · "+(enabled?"ON":"OFF")+
      (c.loaded?" · URA "+c.withURA.length+"/"+c.total:c.status==="pending"?" · loading":" · estimates only");
    button.title="Experimental and NOT IN SERVICE. Solid segments: indicative URA corridors ("+
      c.withURA.join(", ")+"). Dashed routes: illustrative estimates. Missing URA: "+c.estimated.join(", ");
  }
  // Generated during builds from URA Master Plan GeoJSON; never replace it
  // with invented coordinate chains. The approximations remain only as fallback.
  function loadGeometry(){
    if (!dev() || typeof fetch !== "function") return;
    fetch("future-rail-geometry.json", {cache:"no-store"})
      .then(r=>{if(!r.ok)throw Error("future geometry unavailable");return r.json();})
      .then(d=>{geometry=d&&d.matched?d:null;geometryStatus=geometry?"loaded":"unavailable";
        updateToggleLabel();renderPanel();if(enabled&&typeof api.invalidate==="function")api.invalidate();})
      .catch(()=>{geometry=null;geometryStatus="unavailable";updateToggleLabel();renderPanel();});
  }
  const dev = () => root.MRT_DEV_FEATURES === true && root.MRT_PRODUCTION !== true;
  function attach(){
    if (!dev() || !root.document) return;
    const wrap=document.getElementById("mapWrap");
    if (!wrap || document.getElementById("futureRailToggle")) return;
    const button=document.createElement("button");
    button.id="futureRailToggle";
    button.type="button";
    button.textContent="Future rail · OFF";
    button.setAttribute("aria-pressed","false");
    button.title="Experimental: sourced URA Master Plan geometry where available, dashed estimates elsewhere. Not open for passenger service.";
    button.style.cssText="position:absolute;z-index:24;left:12px;bottom:68px;max-width:185px;padding:9px 12px;border-radius:9px;border:1px solid #7a94a7;background:#17313dcc;color:#fff;font:700 12px system-ui;cursor:pointer";
    wrap.appendChild(button);
    const routes=document.createElement("button");
    routes.id="futureRailRoutes";routes.type="button";routes.hidden=true;
    routes.textContent="Routes & stations";
    routes.style.cssText="position:absolute;z-index:25;left:12px;bottom:113px;padding:8px 11px;border:1px solid #7a94a7;border-radius:9px;background:#17313d;color:white;font:700 12px system-ui;cursor:pointer";
    wrap.appendChild(routes);
    const panel=document.createElement("section");
    panel.id="futureRailPanel";panel.hidden=true;
    panel.style.cssText="position:absolute;z-index:26;left:10px;bottom:157px;width:min(340px,calc(100% - 20px));max-height:min(62vh,480px);overflow:auto;background:#102a37;color:white;padding:13px;border:1px solid #658298;border-radius:11px;box-shadow:0 8px 24px #0006;font:13px system-ui";
    wrap.appendChild(panel);
    routes.addEventListener("click",()=>{panel.hidden=!panel.hidden;if(!panel.hidden)renderPanel();});
    updateToggleLabel();
    button.addEventListener("click",()=>{
      enabled=!enabled;updateToggleLabel();
      button.setAttribute("aria-pressed",String(enabled));
      routes.hidden=!enabled;if(!enabled){panel.hidden=true;selected=null;}
      if (typeof api.invalidate === "function") api.invalidate();
    });
  }
  function draw(ctx, opts) {
    if (!dev() || !enabled || !ctx || !opts || typeof opts.sx!=="function") return;
    const sx=opts.sx, sy=opts.sy, zoom=opts.zoom||1, stationMap=opts.stations||{};
    root.mrtFutureStationMap=stationMap;
    const width=Math.max(1.4,Math.min(4.4,2+(zoom-1)*.3));
    ctx.save();
    ctx.lineJoin="round";ctx.lineCap="round";ctx.globalAlpha=.78;
    for(const line of lines) {
      const pts=line.nodes.map(n=>stationMap[n.existing]||[n.x,n.y]);
      ctx.strokeStyle=line.color;ctx.lineWidth=width*(line.concept?.65:1);
      const sourced=geometry && geometry.matched && geometry.matched[line.id];
      // Approximate chain remains faint, showing where no source match was
      // available; coloured solid fragments follow actual URA feature points.
      ctx.globalAlpha=sourced&&sourced.length?0.23:0.48;
      ctx.setLineDash(line.concept?[2,8]:[8,5]);ctx.beginPath();
      pts.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));
      ctx.stroke();
      if(sourced&&sourced.length){
        ctx.globalAlpha=0.94;ctx.setLineDash([]);ctx.lineWidth=width+0.7;ctx.beginPath();
        for(const part of sourced){if(!Array.isArray(part)||part.length<2)continue;
          part.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));
        }
        ctx.stroke();
      }
      ctx.globalAlpha=0.78;ctx.lineWidth=width;
      if(zoom<1.45)continue;
      const stride=zoom>3?1:3;
      for(let i=0;i<pts.length;i+=stride){
        const p=pts[i], n=line.nodes[i],x=sx(p[0]),y=sy(p[1]);
        ctx.beginPath();ctx.arc(x,y,Math.max(2,width*.85),0,Math.PI*2);
        ctx.fillStyle="#12202b";ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=line.color;ctx.stroke();
        if(zoom<2.1)continue;
        const label=line.concept?n.name:n.code+" · "+n.name;
        ctx.font='600 10px "LTA Identity",system-ui,sans-serif';
        ctx.lineWidth=3;ctx.strokeStyle="#101b25";ctx.strokeText(label,x+7,y-5);
        ctx.fillStyle="#ffffff";ctx.fillText(label,x+7,y-5);
      }
    }
    if(selected){
      const p=coords(byCode(selected.line,selected.code).station,stationMap);
      ctx.setLineDash([]);ctx.globalAlpha=1;ctx.beginPath();
      ctx.arc(sx(p[0]),sy(p[1]),11,0,Math.PI*2);ctx.lineWidth=2.6;ctx.strokeStyle="#fff";ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha=1;
    ctx.font="bold 11px system-ui";ctx.lineWidth=3;
    ctx.strokeStyle="#13242d";ctx.strokeText("FUTURE RAIL · URA indicative geometry + estimates · NOT IN SERVICE",14,22);
    ctx.fillStyle="#ffda82";ctx.fillText("FUTURE RAIL · URA indicative geometry + estimates · NOT IN SERVICE",14,22);
    ctx.restore();
  }
  const api={lines,network,source:LTA,draw,attach,coverage,byCode,hitTest,stationHTML,connectionsHTML,
    selectStation,invalidate:null,get selected(){return selected;},get enabled(){return dev()&&enabled;}};
  root.mrtFutureRail=api;
  if(dev()){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{attach();loadGeometry();});
    else {attach();loadGeometry();}
  }
})(typeof window!=="undefined"?window:this);
