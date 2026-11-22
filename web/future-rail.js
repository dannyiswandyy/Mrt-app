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
    {id:"DTL2E",name:"Downtown Line 2 Extension",color:"#005eb8",stage:"Announced extension · intermediate stations unconfirmed",nodes:[
      P("DT1","Bukit Panjang",-6417,-2897,"DT1"),P("DTX","Towards Sungei Kadut · conceptual",-11600,-5000)
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
  let enabled = false;
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
    button.title="Experimental future line overlay: dashed, illustrative geometry only. Not open for passenger service.";
    button.style.cssText="position:absolute;z-index:24;left:12px;bottom:68px;max-width:185px;padding:9px 12px;border-radius:9px;border:1px solid #7a94a7;background:#17313dcc;color:#fff;font:700 12px system-ui;cursor:pointer";
    wrap.appendChild(button);
    button.addEventListener("click",()=>{
      enabled=!enabled; button.textContent="Future rail · "+(enabled?"ON":"OFF");
      button.setAttribute("aria-pressed",String(enabled));
      if (typeof api.invalidate === "function") api.invalidate();
    });
  }
  function draw(ctx, opts) {
    if (!dev() || !enabled || !ctx || !opts || typeof opts.sx!=="function") return;
    const sx=opts.sx, sy=opts.sy, zoom=opts.zoom||1, stationMap=opts.stations||{};
    const width=Math.max(1.4,Math.min(4.4,2+(zoom-1)*.3));
    ctx.save();
    ctx.lineJoin="round";ctx.lineCap="round";ctx.globalAlpha=.78;
    for(const line of lines) {
      const pts=line.nodes.map(n=>stationMap[n.existing]||[n.x,n.y]);
      ctx.strokeStyle=line.color;ctx.lineWidth=width*(line.concept?.65:1);
      ctx.setLineDash(line.concept?[2,8]:[8,5]);ctx.beginPath();
      pts.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));
      ctx.stroke();
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
    ctx.setLineDash([]);
    ctx.globalAlpha=1;
    ctx.font="bold 11px system-ui";ctx.lineWidth=3;
    ctx.strokeStyle="#13242d";ctx.strokeText("FUTURE RAIL · conceptual alignment · NOT IN SERVICE",14,22);
    ctx.fillStyle="#ffda82";ctx.fillText("FUTURE RAIL · conceptual alignment · NOT IN SERVICE",14,22);
    ctx.restore();
  }
  const api={lines,source:LTA,draw,attach,invalidate:null,get enabled(){return dev()&&enabled;}};
  root.mrtFutureRail=api;
  if(dev()){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach);
    else attach();
  }
})(typeof window!=="undefined"?window:this);
