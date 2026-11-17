/* Production copy of the experimental Changi Airport Skytrain implementation.\n * Kept in the production source for engine parity, but deliberately not initialized by the production build. */\n(()=>{\n  if (window.MRT_PRODUCTION) return;\n})();\n\n/* Changi Airport Skytrain card on Home. The Skytrain itself is part of the page's lines (SKY_SERVICES in
   index.html): on the map with its trains, and in the Line Board with estimated next-train times. */
(function(){
"use strict";
if (typeof SKY_CODES === "undefined") return;
var codes = SKY_CODES.slice();

function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

function css(){
  if (document.getElementById("skytrain-style")) return;
  var s = document.createElement("style"); s.id = "skytrain-style";
  s.textContent =
    ".sky-card{background:var(--panel);border:1px solid var(--rule);border-radius:16px;padding:14px;box-shadow:var(--shadow-soft);display:grid;gap:10px}" +
    ".sky-head{display:flex;align-items:center;justify-content:space-between;gap:10px}" +
    ".sky-title{font:600 17px/1.15 var(--display)}" +
    ".sky-badge{font:600 10px/1 var(--body);letter-spacing:.06em;text-transform:uppercase;padding:5px 7px;border-radius:999px;background:var(--soft);color:var(--muted)}" +
    ".sky-routes{display:grid;gap:7px}" +
    ".sky-route{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:9px 11px;border-radius:11px;background:var(--soft);border:0;color:var(--fg);text-align:left;font:inherit;cursor:pointer;width:100%}" +
    ".sky-route i{width:9px;height:9px;border-radius:50%}" +
    ".sky-route b{font-size:13px;font-weight:600}.sky-route small{display:block;color:var(--muted);font-size:12px;margin-top:2px}" +
    ".sky-route em{font:600 12px var(--mono);font-style:normal;color:var(--muted);white-space:nowrap}" +
    ".sky-note{font-size:12px;line-height:1.45;color:var(--muted)}";
  document.head.appendChild(s);
}

function next(c){
  try {
    var now = sgNow(), m = nextArrivals(c, 0, 0, now, 1);
    return m && m.length ? (m[0] < 1 ? "Now" : Math.round(m[0]) + " min") : "No service";
  } catch(e){ return ""; }
}

function rows(){
  return codes.map(function(c){
    var L = LINES[c], st = L.stations;
    return "<button type='button' class='sky-route' data-sky='" + c + "'><i style='background:var(--" + c + ")'></i><div><b>" + esc(st[0][1]) + " → " + esc(st[st.length - 1][1]) + "</b><small>" + (L.transit ? "Transit area only" : "Public and transit areas") + "</small></div><em data-skyn='" + c + "'>" + esc(next(c)) + "</em></button>";
  }).join("");
}

function open(c){
  try { select(c); } catch(e){}
  try { document.getElementById("mbMap").click(); } catch(e){}
  try { document.getElementById("tvLine").click(); } catch(e){}
}

function panel(){
  var host = document.querySelector("#viewHome .home");
  if (!host || !codes.length || document.getElementById("skyPanel")) return;
  var c = document.createElement("section"); c.className = "sky-card"; c.id = "skyPanel";
  c.innerHTML =
    "<div class='sky-head'><div class='sky-title'>Changi Airport Skytrain</div><span class='sky-badge'>Free</span></div>" +
    "<div class='sky-routes'>" + rows() + "</div>" +
    "<div class='sky-note'>Next train from the first stop, estimated. Changi Airport doesn't publish a Skytrain timetable, so the app estimates a train every 3 minutes (trains come every 1 to 4 minutes), 5am to 2am. Track and stops from OpenStreetMap" + (SKY && SKY.at ? " (" + esc(SKY.at) + ")" : "") + ".</div>";
  host.appendChild(c);
  c.onclick = function(e){ var b = e.target.closest("[data-sky]"); if (b) open(b.getAttribute("data-sky")); };
}

function tick(){
  codes.forEach(function(c){ var e = document.querySelector("[data-skyn='" + c + "']"); if (e) e.textContent = next(c); });
}

css(); panel();
setInterval(tick, 30000);
})();
