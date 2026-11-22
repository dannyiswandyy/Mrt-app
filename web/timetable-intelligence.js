/* All-line LTA timetable intelligence. Scheduled trips are not GPS positions or physical trainset IDs.
 * MRT: group trip_id by (service_id, run number). LRT: trip_id is a trip sequence, NOT a run.
 * Keeps a small local per-device baseline so feed updates can be compared without uploading data.
 */
(function () {
  "use strict";
  if (window.mrtTimetableIntelligence) return;
  var LRT = new Set(["BP", "SE", "SW", "PE", "PW"]);
  var KEY = "mrt.timetable-intelligence.v1";
  var ROSTER_KEY = "mrt.timetable-roster-observations.v1";
  var lastTable = null;
  var memory = null;
  var mask = null;
  var selected = "CCL";
  var selectedDate = "";
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
  var fromStore = function (key, def) { try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (_) { return def; } };
  var toStore = function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  var timetable = function () { try { return TT; } catch (_) { return null; } };
  var lineDefs = function () { try { return LINES; } catch (_) { return {}; } };
  var today = function () { return new Date(Date.now() + 28800000).toISOString().slice(0,10); };
  var hhmm = function (sec) {
    sec = Math.max(0, Number(sec) || 0);
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  };
  var nameOf = function (line, idx) {
    var defs = lineDefs(), st = defs[line] && defs[line].stations;
    return st && st[idx] ? String(st[idx][1]) : "Stop " + String(idx);
  };
  function activeServices(T, date) {
    if (!T || !Array.isArray(T.services) || !/^\d{4}-\d\d-\d\d$/.test(date)) return new Set();
    var stamp = date.replace(/-/g, ""), dow = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    var out = new Set();
    T.services.forEach(function (v, i) {
      if (v && String(v[1] || "").charAt(dow) === "1" && stamp >= String(v[2]) && stamp <= String(v[3])) out.add(i);
    });
    (T.except && T.except[stamp] || []).forEach(function (x) {
      if (Number(x[1]) === 1) out.add(Number(x[0]));
      else if (Number(x[1]) === 2) out.delete(Number(x[0]));
    });
    return out;
  }
  function slotOf(code, tripId) {
    if (LRT.has(code)) return null;
    var parts = String(tripId || "").split("_");
    if (parts.length < 4 || !/^\d+$/.test(parts[parts.length-1]) || !/^\d+$/.test(parts[parts.length-2])) return null;
    return String(Number(parts[parts.length-2])).padStart(3, "0");
  }
  function scheduledTrips(T, code, date) {
    if (!T || !T.lines || !T.lines[code]) return [];
    var line = T.lines[code], services = activeServices(T, date), pats = line.pats || [];
    return (line.trips || []).filter(function (x) { return services.has(x[2]); }).map(function (x) {
      var p = pats[x[1]];
      if (!p || !p[2] || !p[2].length) return null;
      var from = Number(p[0]), end = from + Number(p[1]) * (p[2].length - 1);
      var origin = nameOf(code, from), dest = nameOf(code, end);
      var routeKey = origin + " → " + dest; // preserve direction: reversals are operational changes
      var tid = String(x[3] || "");
      // LRT final numeric suffix is a trip index, not a duty/run number.
      var pattern = LRT.has(code) ? tid.replace(/_(?:WD|WE|PH)(?:_SPECIAL)?_\d+$/, "").replace(/^(?:BPLRT|SKLRT|PGLRT)_/, "") : "";
      return {time: Number(x[0]), endTime: Number(x[0]) + Number(p[2][p[2].length-1]),
        origin: origin, dest: dest, route: routeKey, service: x[2], id: tid,
        slot: slotOf(code, tid), pattern: pattern, direction: Number(p[1])};
    }).filter(Boolean).sort(function (a, b) { return a.time - b.time; });
  }
  function inspectDay(T, code, date) {
    var trips = scheduledTrips(T, code, date), bySlot = new Map(), paths = new Map(), patterns = new Map();
    trips.forEach(function (t) {
      paths.set(t.route, (paths.get(t.route) || 0) + 1);
      if (LRT.has(code)) {
        var p = t.pattern || "Unclassified trip";
        patterns.set(p, (patterns.get(p) || 0) + 1);
      } else if (t.slot) {
        var key = t.service + ":" + t.slot;
        if (!bySlot.has(key)) bySlot.set(key, {slot: t.slot, service: t.service, trips: []});
        bySlot.get(key).trips.push(t);
      }
    });
    var varied = [];
    bySlot.forEach(function (g) {
      var paths = [], seen = new Set(), transitionTimes = [];
      g.trips.forEach(function (t) {
        if (!seen.has(t.route)) { seen.add(t.route); paths.push(t.route); }
        if (g.trips[0] !== t && t.route !== g.trips[g.trips.indexOf(t)-1].route) transitionTimes.push(hhmm(t.time));
      });
      if (paths.length > 1) varied.push({slot:g.slot, service:g.service, trips:g.trips.length,
        routes:paths, times:transitionTimes.slice(0,6), first:hhmm(g.trips[0].time), last:hhmm(g.trips[g.trips.length-1].endTime),
        timeline:g.trips.map(function(t){return {time:hhmm(t.time),end:hhmm(t.endTime),origin:t.origin,dest:t.dest,direction:t.direction,id:t.id};})});
    });
    varied.sort(function (a, b) { return Number(a.slot) - Number(b.slot) || a.service - b.service; });
    return {line:code, date:date, trips:trips.length, runs:bySlot.size, varied:varied,
      first:trips.length ? hhmm(trips[0].time) : null,
      last:trips.length ? hhmm(Math.max.apply(null, trips.map(function (t) { return t.endTime; }))) : null,
      routes:[].concat(Array.from(paths, function (x) { return {route:x[0], count:x[1]}; })).sort(function (a,b) { return b.count-a.count; }),
      patterns:Array.from(patterns, function (x) { return {pattern:x[0], count:x[1]}; }).sort(function (a,b) { return b.count-a.count; }),
      isLrt:LRT.has(code), evidence:"LTA scheduled trips; not real-time train movements or an official duty roster"};
  }
  function fingerprint(T) {
    if (!T || !T.lines) return null;
    var lines = {};
    Object.keys(T.lines).forEach(function (code) {
      var line = T.lines[code], pats = line.pats || [], h = 2166136261;
      (line.trips || []).forEach(function (t) {
        var p = pats[t[1]] || [], a = p[2] || [], b = p[3] || [];
        var sig = [t[0],t[1],t[2],t[3],p[0],p[1],p[4],a.join(","),b.join(",")].join("|");
        for (var i=0; i<sig.length; i++) h=Math.imul(h ^ sig.charCodeAt(i), 16777619) >>> 0;
      });
      lines[code] = {hash:h.toString(16), trips:(line.trips || []).length, patterns:pats.length};
    });
    // A calendar change affects the displayed day, even if all trips remain identical.
    var calendar = JSON.stringify([T.services || [], T.except || {}]), h = 2166136261;
    for (var j=0; j<calendar.length; j++) h=Math.imul(h ^ calendar.charCodeAt(j),16777619)>>>0;
    return {built:String(T.feed && T.feed.built || "unknown"), lines:lines, calendar:h.toString(16)};
  }
  function compare(prev, next) {
    if (!prev || !next) return [];
    var changes = [];
    Object.keys(next.lines).forEach(function (code) {
      var a = prev.lines && prev.lines[code], b = next.lines[code];
      if (!a) changes.push({line:code, detail:"New line in timetable"});
      else if (a.hash !== b.hash || a.trips !== b.trips || a.patterns !== b.patterns)
        changes.push({line:code, detail:"Schedule or route pattern changed ("+a.trips+" → "+b.trips+" total trips)"});
    });
    Object.keys(prev.lines || {}).forEach(function (code) {
      if (!next.lines[code]) changes.push({line:code, detail:"Line no longer present in new timetable"});
    });
    if (prev.calendar !== next.calendar) changes.push({line:"Calendar", detail:"Service dates or day applicability changed"});
    return changes;
  }
  function checkFeed(force) {
    var T = timetable();
    if (!T || !T.lines) return [];
    if (!force && lastTable === T) return memory && memory.history || [];
    lastTable = T;
    var next = fingerprint(T), state = fromStore(KEY, {baseline:null,history:[]});
    if (!state || typeof state !== "object") state = {baseline:null,history:[]};
    if (state.baseline) {
      var changes = compare(state.baseline, next);
      if (changes.length) {
        state.history = [{from:state.baseline.built,to:next.built,at:Date.now(),changes:changes}]
          .concat(Array.isArray(state.history) ? state.history : []).slice(0,8);
      }
    }
    state.baseline = next;
    state.history = Array.isArray(state.history) ? state.history : [];
    toStore(KEY, state);
    memory = state;
    return state.history;
  }
  var ROSTER_SNAPSHOT = {line:"CCL",date:"2026-11-22",source:"User-supplied Sunday short-trip roster screenshot (not verified by LTA)",
    entries:[{slot:"029",routes:["DBG-SDM"]},{slot:"030",routes:["DBG-SDM","PYL-CDT"]},
      {slot:"031",routes:["DBG-SDM"]},{slot:"032",routes:["DBG-SDM"]},
      {slot:"033",routes:["DBG-SDM"]},{slot:"034",routes:["DBG-SDM"]},
      {slot:"035",routes:["PYL-CDT"]},{slot:"036",routes:["PYL-CDT"]},
      {slot:"037",routes:["PYL-CDT"]},{slot:"042",routes:["DBG-SDM"]},
      {slot:"045",routes:["ONH-DBG","DBG-SDM"]},{slot:"056",routes:["PYL-CDT"]}]};
  var ALIASES = {DBG:"Dhoby Ghaut",SDM:"Stadium",PYL:"Paya Lebar",CDT:"Caldecott",ONH:"one-north"};
  function routeNorm(s) {
    var parts = String(s || "").split(/\s*(?:-|→|↔|>)\s*/).filter(Boolean);
    return parts.map(function (x) { var key = x.toUpperCase(); return (ALIASES[key] || x).trim().toLowerCase(); }).sort().join("|");
  }
  function rosterFor(code,date) {
    var k=code+":"+date, saved=fromStore(ROSTER_KEY,{});
    return saved && saved[k] || (code===ROSTER_SNAPSHOT.line && date===ROSTER_SNAPSHOT.date ? ROSTER_SNAPSHOT : null);
  }
  function setRoster(input) {
    if (!input || !/^\d{4}-\d\d-\d\d$/.test(String(input.date)) || !input.line || !Array.isArray(input.entries)) return false;
    var T=timetable(); if (!T || !T.lines || !T.lines[input.line]) return false;
    // An external observation is evidence to cross-check, never a replacement for LTA's schedule.
    var key=input.line+":"+input.date, r=fromStore(ROSTER_KEY,{});
    r[key]={line:input.line,date:input.date,source:String(input.source||"User-supplied observation").slice(0,200),
      entries:input.entries.slice(0,250).map(function (e) {
        return {slot:String(e.slot||"").slice(0,15),routes:(Array.isArray(e.routes)?e.routes:[]).slice(0,10).map(function(x){return String(x).slice(0,90);}),
          pattern:String(e.pattern||"").slice(0,80)};
      })};
    toStore(ROSTER_KEY,r);
    return true;
  }
  function compareRoster(T,code,date) {
    var roster=rosterFor(code,date);
    if (!roster) return {source:null,checked:0,missing:[],note:"No independent roster supplied for this line and date."};
    var trips=scheduledTrips(T,code,date), missing=[];
    roster.entries.forEach(function (item) {
      var subset=LRT.has(code) ? trips.filter(function(t){return item.pattern && t.pattern===item.pattern;})
        : trips.filter(function(t){return t.slot===String(Number(item.slot)).padStart(3,"0");});
      if (!subset.length) {
        missing.push({slot:item.slot||item.pattern,reason:"Not found in LTA's selected date service"});
        return;
      }
      var routes=new Set(subset.map(function (t) { return routeNorm(t.origin+"-"+t.dest); }));
      (item.routes||[]).forEach(function (route) {
        if (!routes.has(routeNorm(route))) missing.push({slot:item.slot||item.pattern,reason:route+" not found among scheduled trip endpoints"});
      });
    });
    return {source:roster.source,checked:roster.entries.length,missing:missing,
      note:"Differences are observations to investigate, not proof that either source is incorrect."};
  }
  var drawQueued=false;
  function render() {
    if (!mask || mask.hidden) return;
    var T=timetable(), body=mask.querySelector("#ttiBody");
    if (!T || !T.lines) { body.innerHTML="<p>Waiting for an LTA timetable. This view does not invent trains when data is missing.</p>"; return; }
    var keys=Object.keys(T.lines);
    if (!keys.includes(selected)) selected=keys[0];
    var data=inspectDay(T,selected,selectedDate);
    var roster=compareRoster(T,selected,selectedDate);
    var changes=checkFeed(false);
    var perLine=keys.map(function (code) {
      var d=inspectDay(T,code,selectedDate);
      return '<button type="button" class="tti-line" data-line="'+esc(code)+'" aria-pressed="'+(code===selected)+'"><b>'+esc(code)+'</b><span>'+d.trips+' trips'+(d.isLrt?" · trip patterns":(" · "+d.runs+" duties"))+'</span></button>';
    }).join("");
    var variations=data.isLrt ? data.patterns.map(function(p){
      return '<li><b>'+esc(p.pattern)+'</b> · '+p.count+' timetable trips</li>';
    }).join("") : data.varied.slice(0,80).map(function(r){
      return '<li><details><summary><b>Slot '+esc(r.slot)+'</b> · '+r.trips+' trips · '+esc(r.routes.join(" | "))+'</summary><small>Route changes near '+esc(r.times.join(", ")||"not available")+'</small><ol>'+r.timeline.map(function(t){return '<li>'+esc(t.time)+'–'+esc(t.end)+' · '+esc(t.origin)+' → '+esc(t.dest)+'</li>';}).join("")+'</ol></details></li>';
    }).join("");
    var history=changes.slice(0,3).map(function(c){
      return '<p>'+esc(c.from)+' → '+esc(c.to)+': '+c.changes.map(function(x){return esc(x.line+" — "+x.detail);}).join("; ")+'</p>';
    }).join("") || "<p>No changed timetable detected since this device first stored its baseline.</p>";
    body.innerHTML='<p class="tti-note">LTA GTFS '+esc(T.feed && T.feed.built)+' · Scheduled movements, not live train locations.</p>'+
      '<div class="tti-lines">'+perLine+'</div>'+
      '<h3>'+esc(selected)+' · '+esc(selectedDate)+'</h3>'+
      '<p><b>'+data.trips+'</b> scheduled trips · <b>'+data.first+'–'+data.last+'</b>'+
      (data.isLrt?' · LRT patterns cannot be assigned to physical trains or duties from GTFS trip numbers.':' · <b>'+data.runs+'</b> scheduled duty groups')+'</p>'+
      '<h4>'+(data.isLrt?'LRT loop / direction patterns':'Duty routes with different scheduled endpoints')+'</h4>'+
      '<ul class="tti-items">'+(variations || '<li>No multiple-route duties identified on this date.</li>')+'</ul>'+
      '<details><summary>All scheduled route pairs</summary><ul class="tti-items">'+data.routes.map(function(r){return '<li>'+esc(r.route)+' · '+r.count+' trip(s)</li>';}).join("")+'</ul></details>'+
      '<h4>Independent roster cross-check</h4>'+
      (roster.source?'<p class="tti-note">Source: '+esc(roster.source)+' · '+roster.checked+' entries checked.</p>'+
        (roster.missing.length?'<ul class="tti-items">'+roster.missing.slice(0,50).map(function(r){return '<li><b>'+esc(r.slot)+'</b> · '+esc(r.reason)+'</li>';}).join("")+'</ul>':'<p>No differences found among the supplied route expectations.</p>')
        :'<p>No independent roster supplied for this line and date. LTA trip data alone cannot confirm operator duty classifications.</p>')+
      '<p class="tti-note">'+esc(roster.note)+'</p>'+
      '<h4>Changes since previous GTFS download</h4>'+history+
      '<p class="tti-note">The first timetable seen on this device becomes the baseline. A new download is compared by line and calendar; a changed feed date alone does not imply altered services. This view does not automatically treat enthusiast rosters as official data.</p>';
  }
  function open() {
    if (!mask) setup();
    selectedDate=today();
    mask.hidden=false;
    document.body.style.overflow="hidden";
    checkFeed(true);
    var picker=mask.querySelector("#ttiDate"), line=mask.querySelector("#ttiChooseLine");
    picker.value=selectedDate;
    var T=timetable(), keys=T && T.lines ? Object.keys(T.lines) : [];
    line.innerHTML=keys.map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>';}).join("");
    if (!keys.includes(selected)) selected=keys[0]||"CCL";
    line.value=selected;
    render();
  }
  function close() { if (!mask || mask.hidden) return false; mask.hidden=true; document.body.style.overflow=""; return true; }
  function setup() {
    if (mask || !document.body) return;
    var style=document.createElement("style");
    style.textContent="#ttiMask{position:fixed;inset:0;background:#0009;z-index:10500;display:grid;place-items:center;padding:12px}#ttiMask[hidden]{display:none}#ttiPanel{max-width:810px;width:100%;max-height:92dvh;overflow:auto;background:var(--panel,#171b23);color:var(--fg,#fff);border:1px solid var(--rule,#556);border-radius:16px;padding:18px;font:14px var(--body,system-ui)}#ttiPanel h2{font-size:20px;margin:0}#ttiPanel h3{margin:18px 0 6px;font-size:17px}#ttiPanel h4{margin:16px 0 6px;font-size:14px}#ttiPanel p{line-height:1.5}#ttiPanel .tti-note,#ttiPanel small{color:var(--muted,#aaa);font-size:12px;display:block}#ttiPanel .tti-head{display:flex;justify-content:space-between;align-items:center;gap:10px}#ttiPanel button,#ttiPanel select,#ttiPanel input{font:inherit;border:1px solid var(--rule,#667);border-radius:9px;padding:8px;background:var(--bg,#222);color:inherit}#ttiPanel .tti-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}#ttiPanel .tti-lines{display:flex;gap:5px;flex-wrap:wrap}#ttiPanel .tti-line{display:flex;flex-direction:column;font-size:11px;gap:2px;cursor:pointer}#ttiPanel .tti-line[aria-pressed=true]{outline:2px solid var(--DTL,#168abd)}#ttiPanel .tti-items{padding-left:20px;max-height:260px;overflow:auto}#ttiPanel li{margin:6px 0;line-height:1.45}#ttiPanel details{margin:12px 0}#ttiHome{font-size:13px;text-align:left;display:flex;flex-direction:column;gap:5px;cursor:pointer}";
    document.head.appendChild(style);
    mask=document.createElement("div"); mask.id="ttiMask"; mask.hidden=true;
    mask.innerHTML='<section id="ttiPanel" role="dialog" aria-modal="true" aria-label="All-line timetable intelligence"><div class="tti-head"><h2>Timetable intelligence</h2><button type="button" data-close="1" aria-label="Close">×</button></div><div class="tti-controls"><select id="ttiChooseLine" aria-label="Line"></select><input id="ttiDate" type="date" aria-label="Service date"><button type="button" data-refresh="1">Check timetable</button></div><div id="ttiBody"></div></section>';
    document.body.appendChild(mask);
    mask.addEventListener("click",function(e){
      if(e.target===mask || e.target.closest("[data-close]")) {close();return;}
      var line=e.target.closest("[data-line]");
      if(line){selected=line.dataset.line;mask.querySelector("#ttiChooseLine").value=selected;render();}
      if(e.target.closest("[data-refresh]")){lastTable=null;checkFeed(true);render();}
    });
    mask.addEventListener("change",function(e){
      if(e.target.id==="ttiChooseLine")selected=e.target.value;
      if(e.target.id==="ttiDate")selectedDate=e.target.value;
      render();
    });
    document.addEventListener("keydown",function(e){if(e.key==="Escape")close();});
  }
  function mount() {
    setup();
    var home=document.querySelector("#viewHome .tiles"), old=document.querySelector("#ttiHome");
    if(home&&!old){
      var btn=document.createElement("button");btn.type="button";btn.id="ttiHome";btn.className="planner-quick";
      btn.innerHTML='<b>Timetable intelligence</b><span>All MRT &amp; LRT routes, duty changes and schedule checks</span>';
      btn.addEventListener("click",open);home.appendChild(btn);
    } else if(old)old.onclick=open;
    checkFeed(false);
  }
  window.mrtTimetableIntelligence={open:open,close:close,inspectDay:function(code,date){return inspectDay(timetable(),code,date||today());},
    fingerprint:fingerprint,compare:compare,check:checkFeed,setRoster:setRoster,
    compareRoster:function(code,date){return compareRoster(timetable(),code,date||today());},
    coverage:["NSL","EWL","CG","NEL","CCL","DTL","TEL","BP","SE","SW","PE","PW"]};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
  document.addEventListener("visibilitychange",function(){if(!document.hidden){checkFeed(false);if(mask&&!mask.hidden)render();}});
  window.addEventListener("focus",function(){checkFeed(false);if(mask&&!mask.hidden)render();});
  setInterval(function(){checkFeed(false);},120000);
})();