/* Future MRT network. Coordinates use the tracker’s local metre projection.
 * Station locations derive from the URA Master Plan 2025 station footprints,
 * compiled in elliotwutingfeng/singapore_train_station_coordinates (Singapore
 * Open Data Licence). JS2A uses LTA's location plan. CR20 and CR22 use
 * OpenStreetMap station outlines 1546902345 and 1546945488 (ODbL).
 * The line asset records the source feature/way IDs for each station pair.
 */
(function(root){
  "use strict";
  const LTA = "https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/3/news-releases/next-phase-of-rail-development.html";
  const uraUrl = "https://data.gov.sg/datasets/d_6615da031916f656152eafa013748d73/view";
  const osmUrl = "https://www.openstreetmap.org/copyright";
  // [name, east, south, existing station code, naming note]
  const stations = {
    JS1: ["Choa Chu Kang",-8397,-3652,"NS4"],
    JS2: ["Choa Chu Kang West",-8879,-2999,null,"Working name"],
    JS2A: ["JS2A station",-9728,-2284,null,"Tengah infill · station name pending"],
    JS3: ["Tengah",-9993,-1576,null,"Working name"],
    JS4: ["Hong Kah",-10428,-654,null,"Working name"],
    JS5: ["Corporation",-11795,-96,null,"Working name"],
    JS6: ["Jurong West",-12414,322,null,"Working name"],
    JS7: ["Bahar Junction",-12995,653,null,"Working name"],
    JS8: ["Boon Lay",-12823,1547,"EW27"],
    JS9: ["Enterprise",-12378,2142,null,"Working name"],
    JS10: ["Tukang",-12304,2951,null,"Working name"],
    JS11: ["Jurong Hill",-12205,3702,null,"Working name"],
    JS12: ["Jurong Pier",-12175,4309,null,"Working name"],
    JE1: ["Tengah Plantation",-9609,-579,null,"Working name"],
    JE2: ["Tengah Park",-9239,-25,null,"Working name"],
    JE3: ["Bukit Batok West",-8936,711,null,"Working name"],
    JE4: ["Toh Guan",-8603,1348,null,"Working name"],
    JE5: ["Jurong East",-8668,2116,"EW24"],
    JE6: ["Jurong Town Hall",-8301,2844,null,"Working name"],
    JE7: ["Pandan Reservoir",-8347,3499,null,"Working name"],
    JW1: ["Gek Poh",-13542,415,null,"Working name"],
    JW2: ["Tawas",-14235,159,null,"Working name"],
    JW3: ["Nanyang Gateway",-14823,-176,null,"Working name"],
    JW4: ["Nanyang Crescent",-15469,408,null,"Working name"],
    JW5: ["Peng Kang Hill",-15719,982,null,"Working name"],
    CR23: ["Gul Circle",-17702,3582,"EW30"],
    CR22: ["CR22 station",-16341,4405,null,"Gul Circle near Gul Way · station name pending"],
    CR21: ["Jurong Pier",-12175,4309,null,"Working name"],
    CR20: ["CR20 station",-10471,3150,null,"Jalan Terusan · station name pending"],
    CR19: ["Jurong Lake District",-8902,2758,null,"Working name"],
    CR18: ["West Coast",-6848,4593,null,"Working name"],
    CR17: ["Clementi",-6031,3999,"EW23"],
    CR16: ["Maju",-4772,2648,null,"Working name"],
    CR15: ["King Albert Park",-4165,2021,"DT6"],
    CR14: ["Turf City",-2824,1237,null,"Working name"],
    CR13: ["Bright Hill",1815,-1247,"TE7"],
    CR12: ["Teck Ghee",2649,-1486,null,"Working name"],
    CR11: ["Ang Mo Kio",3460,-1913,"NS16"],
    CR10: ["Tavistock",4839,-2001,null,"Working name"],
    CR9: ["Serangoon North",6024,-2042,null,"Working name"],
    CR8: ["Hougang",8007,-2114,"NE14"],
    CR7: ["Defu",8814,-1132,null,"Working name"],
    CR6: ["Tampines North",13166,-1918,null,"Working name"],
    CR5: ["Pasir Ris",14420,-2079,"EW1"],
    CR4: ["Pasir Ris East",15664,-1653,null,"Working name"],
    CR3: ["Loyang",16963,-2135,null,"Working name"],
    CR2: ["Aviation Park",20445,-2003,null,"Working name"],
    CP1: ["Pasir Ris",14420,-2079,"EW1"],
    CP2: ["Elias",13262,-3468,null,"Working name"],
    CP3: ["Riviera",10666,-4863,"PE4"],
    CP4: ["Punggol",9193,-5868,"NE17"],
    NS3: ["Bukit Gombak",-7555,-727,"NS3"],
    NS3A: ["Brickland",-7804,-1802],
    NS4: ["Choa Chu Kang",-8397,-3652,"NS4"],
    NS5: ["Yew Tee",-8057,-5026,"NS5"],
    NS6: ["Sungei Kadut",-7903,-6775,null,"Working name"],
    NS7: ["Kranji",-6426,-8082,"NS7"],
    DT1: ["Bukit Panjang",-6393,-2918,"DT1"],
    DE1: ["DE1 station",-7384,-5367,null,"Sungei Kadut Avenue area · station name pending"],
    DE2: ["Sungei Kadut",-7873,-6779,null,"Working name"],
    TE29: ["Bayshore",13582,4330,"TE29"],
    TE30: ["Bedok South",14404,3920],
    TE31: ["Sungei Bedok",15292,3506],
    DT35: ["Expo",15821,1902,"DT35"],
    DT36: ["Xilin",16144,2584],
    DT37: ["Sungei Bedok",15292,3506],
    TE32: ["Changi Terminal 5",19160,3063,null,"Working name"],
    TE33: ["Changi Airport",18758,-577,"CG2"],
    TE34: ["Expo",15821,1902,"CG1"],
    TE35: ["Tanah Merah",14106,2747,"EW4"],
    CR1: ["Changi Terminal 5",19160,3063,null,"Working name"],
    CC24: ["Kent Ridge",-3929,6491,"CC24"],
    TE9: ["Caldecott",2233,1610,"TE9"],
    TE10: ["Mount Pleasant",1698,2604],
    TE11: ["Stevens",671,3560,"TE11"],
    TE20: ["Marina Bay",3915,8436,"TE20"],
    TE21: ["Marina South",4820,8613],
    TE22: ["Gardens by the Bay",5359,8061,"TE22"],
    TE22A: ["Founders' Memorial",5468,6759],
    TE23: ["Tanjong Rhu",5971,6066,"TE23"],
    CC17: ["Caldecott",2233,1610,"CC17"],
    CC18: ["Bukit Brown",1214,2031],
    CC19: ["Botanic Gardens",-465,3300,"CC19"]
  };
  function route(id,name,color,stage,sequence){
    const nodes=sequence ? sequence.split(" ").map(code=>{
      const [name,x,y,existing,note]=stations[code];
      return {code,name,x,y,existing,note};
    }) : [];
    return {id,name,color,stage,nodes,concept:!nodes.length};
  }
  const lines = [
    route("JRL_W", "Jurong Region Line · West", "#0099a8", "Stages 1 and 3. JS2A is a later infill station targeted for the mid-2030s.", "JS1 JS2 JS2A JS3 JS4 JS5 JS6 JS7 JS8 JS9 JS10 JS11 JS12"),
    route("JRL_E", "Jurong Region Line · East", "#0099a8", "Stage 2 · Tengah to Pandan Reservoir via Jurong East.", "JS3 JE1 JE2 JE3 JE4 JE5 JE6 JE7"),
    route("JRL_N", "Jurong Region Line · NTU branch", "#0099a8", "Stages 1 and 3 · Bahar Junction to NTU via Gek Poh and Tawas.", "JS7 JW1 JW2 JW3 JW4 JW5"),
    route("CRL", "Cross Island Line · Phases 1–3", "#82be35", "Phase 1 targets 2030, Phase 2 targets 2032 and Phase 3 targets the late 2030s.", "CR23 CR22 CR21 CR20 CR19 CR18 CR17 CR16 CR15 CR14 CR13 CR12 CR11 CR10 CR9 CR8 CR7 CR6 CR5 CR4 CR3 CR2"),
    route("CPE", "Cross Island Line · Punggol Extension", "#82be35", "Target 2032 · Pasir Ris to Punggol via Elias and Riviera.", "CP1 CP2 CP3 CP4"),
    route("DTL2E", "Downtown Line · Stage 2 Extension", "#005eb8", "Target 2035 · Bukit Panjang to the new NS6 interchange via DE1.", "DT1 DE1 DE2"),
    route("NS6", "North-South Line · NS6 infill", "#e4272e", "Target 2035 · new interchange with DE2 between Yew Tee and Kranji.", "NS5 NS6 NS7"),
    route("TEL5", "Thomson-East Coast Line · Stage 5", "#9a7049", "Passenger service scheduled for 26 December 2026.", "TE29 TE30 TE31"),
    route("DTL3E", "Downtown Line · Stage 3 Extension", "#005eb8", "Passenger service scheduled for 26 December 2026.", "DT35 DT36 DT37"),
    route("TELe", "Thomson-East Coast Line · Changi Airport extension", "#9a7049", "Sungei Bedok to Terminal 5, followed by the connection to Changi Airport and conversion of the existing branch to Tanah Merah.", "TE31 TE32 TE33 TE34 TE35"),
    route("CRL_T5", "Cross Island Line · Terminal 5", "#82be35", "Terminal 5 interchange with the Thomson-East Coast Line.", "CR1 CR2"),
    route("NS3A", "North-South Line · Brickland infill", "#e4272e", "Target 2034 · between Bukit Gombak and Choa Chu Kang.", "NS3 NS3A NS4"),
    route("TE10", "Thomson-East Coast Line · Mount Pleasant", "#9a7049", "Station opening depends on surrounding developments.", "TE9 TE10 TE11"),
    route("TE21", "Thomson-East Coast Line · Marina South", "#9a7049", "Station opening depends on surrounding developments.", "TE20 TE21 TE22"),
    route("TE22A", "Thomson-East Coast Line · Founders’ Memorial", "#9a7049", "Opening planned in tandem with Founders’ Memorial.", "TE22 TE22A TE23"),
    route("CC18", "Circle Line · Bukit Brown provision", "#fa9e0d", "Station provision between Caldecott and Botanic Gardens. No opening date has been announced.", "CC17 CC18 CC19"),
    route("WCE", "Jurong Region Line · West Coast Extension", "#0099a8", "Studies cover Pandan Reservoir to West Coast, with a further connection to Kent Ridge under study.", "JE7 CR18 CC24"),
    route("SEL", "Seletar Line", "#a887d1", "Engineering study. LTA is exploring a corridor serving Sengkang West and Serangoon North.", ""),
    route("TGL", "Tengah Line", "#c68c53", "Engineering study. Station names and a georeferenced alignment are pending.", "")
  ];
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
  // Co-located future interchanges get one symbol and one combined code label.
  const markerIndex=new Map();
  for(const line of lines) for(const node of line.nodes){
    const key=node.x+","+node.y;
    if(!markerIndex.has(key))markerIndex.set(key,{node,color:line.color,codes:new Set()});
    markerIndex.get(key).codes.add(node.code);
  }
  const markers=Array.from(markerIndex.values());
  let selected = null, browseLine = "CRL";
  const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const byCode=(line,code)=>stationIndex.get(line+":"+code)||null;
  const coords=node=>[node.x,node.y];
  let enabled = true;
  let geometry = null;
  let geometryStatus = "pending";
  function coverage(){
    const routes=lines.filter(line=>!line.concept);
    const withURA=routes.filter(line=>(geometry?.sections[line.id]||[]).some(s=>s.source!=="osm"));
    return {loaded:!!geometry,status:geometryStatus,withURA:withURA.map(l=>l.id),
      estimated:routes.filter(l=>!(geometry?.sections[l.id]?.length)).map(l=>l.id),total:routes.length};
  }
  function coverageText(line){
    if(line.concept)return "Station locations and alignment are under study.";
    if(!geometry)return geometryStatus==="pending"?"Loading bundled map geometry…":"Track geometry unavailable. Station locations are shown.";
    const sections=geometry.sections[line.id]||[];
    const count=sections.length, total=line.nodes.length-1;
    if(!count)return "Station locations only. A georeferenced alignment is pending.";
    const osm=sections.filter(s=>s.source==="osm").length;
    return (count-osm)+" of "+total+" station pairs have URA planning geometry."+
      (osm?" "+osm+" more have a provisional OpenStreetMap alignment.":"");
  }
  function connectionsHTML(name){
    if(!dev() || !enabled) return "";
    const refs=[...stationIndex.values()].filter(x=>x.station.name===name && !x.route.concept);
    if(!refs.length)return "";
    return '<div class="mi-row"><span><b>Future rail connections · NOT IN SERVICE</b><small style="display:block">'+
      refs.map(x=>esc(x.station.code)+" · "+esc(x.route.name)).join(" · ")+'</small></span></div>';
  }
  // Map hit-testing uses the exact same screen projection as the main RTS/MRT map.
  function projectPoint(opts,x,y){
    return opts.project ? opts.project(x,y) : [opts.sx(x),opts.sy(y)];
  }
  function trace(ctx,points,opts){
    let start=true;
    for(const [x,y] of points){
      const screen=projectPoint(opts,x,y);
      if(!screen){start=true;continue;}
      if(start)ctx.moveTo(screen[0],screen[1]);
      else ctx.lineTo(screen[0],screen[1]);
      start=false;
    }
  }
  function hitTest(x,y,opts){
    if(!dev() || !enabled || !opts || (!opts.project && typeof opts.sx!=="function"))return null;
    const radius=Math.min(20,Math.max(11,4+(opts.zoom||1)*1.7));
    let best=null,dist=radius;
    for(const ref of stationIndex.values()){
      const node=ref.station;
      const pt=coords(node),screen=projectPoint(opts,pt[0],pt[1]);
      if(!screen)continue;
      const d=Math.hypot(screen[0]-x,screen[1]-y);
      if(d<dist){dist=d;best={line:ref.line,code:node.code,x:pt[0],y:pt[1],name:node.name};}
    }
    return best;
  }
  function stationHTML(hit,showHeading=true){
    if(!dev() || !enabled)return "";
    const entry=byCode(hit.line,hit.code);
    if(!entry)return '<p class="hint">Future station unavailable.</p>';
    const line=entry.route,node=entry.station;
    const shared=[...stationIndex.values()].filter(x=>x.station.name===node.name && x.route.id!==line.id);
    const sections=(geometry?.sections[line.id]||[]).filter(s=>s.from===node.code||s.to===node.code);
    const hasURA=sections.some(s=>s.source!=="osm"), hasOSM=sections.some(s=>s.source==="osm");
    const sourceNote=hasURA?"Adjacent track follows URA’s indicative planning alignment.":"";
    const osmNote=hasOSM?"Dashed track follows the provisional OpenStreetMap alignment.":"";
    const positionNote=["CR20","CR22"].includes(node.code)?"Station location from the mapped OpenStreetMap footprint.":
      node.code==="JS2A"?"Station location from LTA’s JS2A plan.":"Station location from URA’s planning footprint.";
    const heading='<div class="mi-h"><span class="code" style="background:'+esc(line.color)+'">'+esc(node.code)+
      '</span><b>'+esc(node.name)+'</b><button class="mi-x" type="button" data-act="close" aria-label="Close">×</button></div>';
    return (showHeading?heading:"")+
      '<div class="mi-row"><span><b>'+esc(line.name)+'</b></span><span class="mi-t">NOT IN SERVICE</span></div>'+
      '<div class="mi-row"><span>'+esc(line.stage)+'</span></div>'+
      (node.existing?'<div class="mi-row"><span>Interchange with existing '+esc(node.existing)+'</span></div>':"")+
      (shared.length?'<div class="mi-row"><span>Planned connections: '+shared.map(x=>esc(x.route.name)).join(", ")+'</span></div>':"")+
      (node.note?'<div class="mi-row"><small>'+esc(node.note)+'</small></div>':"")+
      '<div class="mi-row"><small>'+esc([positionNote,sourceNote,osmNote].filter(Boolean).join(" "))+'</small></div>'+
      '<div class="mi-row"><small>Passenger service on this project has yet to start.</small></div>';
  }
  function activate(){
    if(!dev())return false;
    if(enabled)return true;
    enabled=true;updateToggleLabel();
    const toggle=document.getElementById("futureRailToggle");
    if(toggle)toggle.setAttribute("aria-pressed","true");
    const routes=document.getElementById("futureRailRoutes");
    if(routes)routes.hidden=false;
    if(typeof api.invalidate==="function")api.invalidate();
    return true;
  }
  function selectStation(line,code){
    if(!dev())return false;
    if(!enabled)activate();
    const ref=byCode(line,code);if(!ref)return false;
    const pt=coords(ref.station);
    selected={line,code,x:pt[0],y:pt[1],name:ref.station.name};
    if(typeof root.selectFutureRailStation==="function")root.selectFutureRailStation(selected);
    if(typeof api.invalidate==="function")api.invalidate();
    return true;
  }
  function renderPanel(){
    if(!dev()||!root.document)return;
    const panel=document.getElementById("futureRailPanel");
    if(!panel)return;
    const line=lines.find(l=>l.id===browseLine)||lines[0];
    panel.innerHTML='<div style="font-weight:750;margin-bottom:8px">Future lines &amp; stations <span style="font-size:11px;font-weight:400">NOT IN SERVICE</span></div>'+
      '<label for="futureRailLine" style="display:block;font-size:12px;margin-bottom:4px">Rail project</label>'+
      '<select id="futureRailLine" style="width:100%;padding:8px;background:#102a37;color:#fff;border:1px solid #718999;border-radius:6px">'+
      lines.map(l=>'<option value="'+esc(l.id)+'" '+(l.id===line.id?"selected":"")+'>'+esc(l.name)+'</option>').join("")+'</select>'+
      '<p style="font-size:12px;margin:8px 0">'+esc(line.stage)+'</p>'+
      '<p style="font-size:11px;margin:6px 0 10px">'+esc(coverageText(line))+'</p>'+
      '<div style="display:grid;gap:5px">'+line.nodes.map(n=>
      '<button type="button" data-future-line="'+esc(line.id)+'" data-future-code="'+esc(n.code)+'" style="text-align:left;padding:7px 8px;border:1px solid #597789;border-radius:6px;background:#183847;color:#fff;cursor:pointer">'+
      '<b style="color:'+esc(line.color)+'">'+esc(n.code)+'</b> · '+esc(n.name)+'</button>').join("")+'</div>'+
      '<p style="font-size:11px;margin:9px 0 0"><a style="color:#a9dcff" href="'+uraUrl+'">URA Master Plan 2025</a> · '+
      '<a style="color:#a9dcff" href="'+osmUrl+'">© OpenStreetMap contributors (ODbL)</a></p>';
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
    button.textContent="Future rail · "+(enabled?"ON":"OFF");
    button.setAttribute("aria-pressed",String(enabled));
    button.title=c.loaded?"Solid: URA planning alignment. Dashed: provisional community alignment.":"Show future stations and their bundled alignments.";
  }
  // Only the private channel loads the bundled, offline alignment snapshot.
  function loadGeometry(){
    if (!dev() || typeof fetch !== "function") return;
    fetch("future-rail-geometry.json", {cache:"no-store"})
      .then(r=>{if(!r.ok)throw Error("future geometry unavailable");return r.json();})
      .then(d=>{geometry=d?.schema===2&&d.sections?d:null;geometryStatus=geometry?"loaded":"unavailable";
        updateToggleLabel();renderPanel();if(enabled&&typeof api.invalidate==="function")api.invalidate();})
      .catch(()=>{geometry=null;geometryStatus="unavailable";updateToggleLabel();renderPanel();});
  }
  const dev = () => root.MRT_DEV_FEATURES === true && root.MRT_PRODUCTION !== true;
  // Register with the app's existing line-board registry like RTS, without
  // appending to ORDER (which is intentionally reserved for operating trains).
  // Future routes are selectable, but have no passenger service or departures.
  function registerCore(){
    if(!dev()||!root.document||typeof LINES==="undefined")return;
    const tabs=document.getElementById("tabs");
    if(!tabs)return;
    const names={JRL_W:"JRL West",JRL_E:"JRL East",JRL_N:"JRL NTU",
      CRL:"CRL",CPE:"CRL Punggol",WCE:"West Coast",
      DTL2E:"DTL2e",DTL3E:"DTL3e",TEL5:"TEL5",TELe:"TEL T5",
      CRL_T5:"CRL T5",NS6:"NS6",NS3A:"Brickland",TE10:"Mount Pleasant",TE21:"Marina South",TE22A:"Founders’ Memorial",CC18:"Bukit Brown"};
    const available=lines.filter(line=>!line.concept);
    for(const line of available){
      if(!LINES[line.id]){
        LINES[line.id]={name:line.name,tab:names[line.id]||line.id,
          future:true,expect:line.stage,stage:line.stage,
          stations:line.nodes.map(n=>[n.code,n.name,"9999-12-31"])};
      }
      document.documentElement.style.setProperty("--"+line.id,line.color);
    }
    if(document.getElementById("tab-"+available[0].id))return;
    const heading=document.createElement("span");
    heading.className="tabsep";heading.textContent="Future · not in service";
    tabs.appendChild(heading);
    for(const line of available){
      const tab=document.createElement("button");
      tab.type="button";tab.className="tab";tab.id="tab-"+line.id;
      tab.setAttribute("role","tab");tab.setAttribute("aria-selected","false");
      tab.dataset.c=line.id;tab.style.setProperty("--c",line.color);
      tab.textContent=names[line.id]||line.id;
      tabs.appendChild(tab);
    }
  }
  function attach(){
    if (!dev() || !root.document) return;
    registerCore();
    const wrap=document.getElementById("mapWrap");
    if (!wrap || document.getElementById("futureRailToggle")) return;
    const button=document.createElement("button");
    button.id="futureRailToggle";
    button.type="button";
    button.textContent="Future rail";
    button.setAttribute("aria-pressed","false");
    button.title="Future stations and published planning alignments.";
    button.style.cssText="position:absolute;z-index:24;left:12px;bottom:68px;max-width:185px;padding:9px 12px;border-radius:9px;border:1px solid #7a94a7;background:#17313dcc;color:#fff;font:700 12px system-ui;cursor:pointer";
    wrap.appendChild(button);
    const routes=document.createElement("button");
    routes.id="futureRailRoutes";routes.type="button";routes.hidden=!enabled;
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
      routes.hidden=!enabled;if(!enabled){panel.hidden=true;selected=null;root.clearFutureRailSelection?.();}
      if (typeof api.invalidate === "function") api.invalidate();
    });
  }
  function draw(ctx, opts) {
    if (!dev() || !enabled || !ctx || !opts || (!opts.project && typeof opts.sx!=="function")) return;
    const zoom=opts.zoom||1;
    const width=Math.max(1.4,Math.min(4.4,2+(zoom-1)*.3));
    ctx.save();
    ctx.lineJoin="round";ctx.lineCap="round";ctx.globalAlpha=.78;
    for(const line of lines) {
      ctx.strokeStyle=line.color;
      for(const section of geometry?.sections[line.id]||[]){
        ctx.globalAlpha=section.source==="osm" ? .72 : .91;
        ctx.setLineDash(section.source==="osm"?[6,5]:[]);
        ctx.lineWidth=width+.5;
        ctx.beginPath();
        for(const part of section.parts){
          trace(ctx,part.xy,opts);
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    if(zoom>=3 && geometry?.footprints){
      ctx.fillStyle="#8bdddc";ctx.strokeStyle="#5fa8a9";ctx.lineWidth=1;
      for(const rings of Object.values(geometry.footprints)){
        ctx.beginPath();
        for(const ring of rings){
          if(opts.project && ring.some(([x,y])=>!opts.project(x,y)))continue;
          trace(ctx,ring,opts);
          ctx.closePath();
        }
        ctx.globalAlpha=.22;ctx.fill();ctx.globalAlpha=.65;ctx.stroke();
      }
    }
    if(zoom>=1.45){
      ctx.globalAlpha=.95;
      for(const [i,marker] of markers.entries()){
        if(zoom<=3 && i%3!==0)continue;
        const n=marker.node,screen=projectPoint(opts,n.x,n.y);
        if(!screen)continue;
        const [x,y]=screen;
        ctx.beginPath();ctx.arc(x,y,Math.max(2.5,width),0,Math.PI*2);
        ctx.fillStyle="#12202b";ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=marker.color;ctx.stroke();
        if(zoom<2.1)continue;
        const codes=Array.from(marker.codes).join("/");
        const label=n.name===n.code+" station"?codes:codes+" · "+n.name;
        ctx.font='600 10px "LTA Identity",system-ui,sans-serif';
        ctx.lineWidth=3;ctx.strokeStyle="#101b25";ctx.strokeText(label,x+7,y-5);
        ctx.fillStyle="#fff";ctx.fillText(label,x+7,y-5);
      }
    }
    if(selected){
      const n=byCode(selected.line,selected.code).station;
      const p=projectPoint(opts,n.x,n.y);
      if(p){
      ctx.setLineDash([]);ctx.globalAlpha=1;ctx.beginPath();
      ctx.arc(p[0],p[1],11,0,Math.PI*2);ctx.lineWidth=2.6;ctx.strokeStyle="#fff";ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha=1;
    ctx.font="bold 11px system-ui";ctx.lineWidth=3;
    ctx.strokeStyle="#13242d";ctx.strokeText("Future rail · URA plans / © OpenStreetMap contributors",14,22);
    ctx.fillStyle="#ffda82";ctx.fillText("Future rail · URA plans / © OpenStreetMap contributors",14,22);
    ctx.restore();
  }
  const api={lines,network,source:LTA,draw,attach,registerCore,activate,coverage,byCode,hitTest,stationHTML,connectionsHTML,
    selectStation,invalidate:null,get selected(){return selected;},get enabled(){return dev()&&enabled;}};
  root.mrtFutureRail=api;
  if(dev()){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{attach();loadGeometry();});
    else {attach();loadGeometry();}
  }
})(typeof window!=="undefined"?window:this);
