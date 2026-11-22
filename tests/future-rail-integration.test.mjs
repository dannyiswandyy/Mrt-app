import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const page=fs.readFileSync(new URL("../web/index.html",import.meta.url),"utf8");
const source=fs.readFileSync(new URL("../web/future-rail.js",import.meta.url),"utf8");
const moduleFor=(dev)=>{
  const document={readyState:"loading",addEventListener(){}};
  const window={MRT_DEV_FEATURES:dev,MRT_PRODUCTION:!dev,document};
  vm.runInNewContext(source,{window,document,console},{timeout:2500});
  return window.mrtFutureRail;
};

test("future projects use shared RTS-like route and station data",()=>{
  const api=moduleFor(true);
  for(const id of ["JRL_W","JRL_E","JRL_N","CRL","CPE","DTL2E","DTL3E","TEL5","TELe","CRL_T5","NS6","NS3A"]){
    assert.ok(api.network[id],id);
    assert.equal(api.network[id].future,true,id);
    assert.equal(api.network[id].passengerService,false,id);
    assert.ok(api.network[id].stations.length>=2,id);
    for(const station of api.network[id].stations)
      assert.ok(api.byCode(id,station.code),id+":"+station.code);
  }
});

test("main map can select future stations and display information in the normal card",()=>{
  assert.match(page,/window\.selectFutureRailStation = hit =>/);
  assert.match(page,/mrtFutureRail\.hitTest\(x,y/);
  assert.match(page,/mrtFutureRail\.stationHTML\(mSel\)/);
  assert.match(page,/mrtFutureRail\.connectionsHTML\(e\.name\)/);
  assert.match(page,/window\.hxOpen\(\{type:"future-station",line:hit\.line,code:hit\.code,name:hit\.name\}, false\)/,
    "future stations must use the native phone/tablet station drawer");
});

test("Dev-only routes join the native RTS-style line registry without entering operational ORDER",()=>{
  const children=[],registry={NSL:{name:"North-South Line"}};
  const tabs={appendChild(item){children.push(item);}};
  const document={
    readyState:"loading",addEventListener(){},
    documentElement:{style:{setProperty(){}}},
    getElementById:id=>id==="tabs"?tabs:null,
    createElement:()=>({dataset:{},style:{setProperty(){}},setAttribute(){}})
  };
  const window={MRT_DEV_FEATURES:true,MRT_PRODUCTION:false,document};
  vm.runInNewContext(source,{window,document,LINES:registry,console},{timeout:2500});
  window.mrtFutureRail.registerCore();
  for(const id of ["CRL","CPE","JRL_W","DTL2E","DTL3E","TEL5","NS6"]){
    assert.equal(registry[id].future,true,id);
    assert.ok(registry[id].stations.every(st=>st[2]==="9999-12-31"),id);
    assert.ok(children.some(child=>child.id==="tab-"+id),id);
  }
  assert.ok(!registry.SEL && !registry.TGL,"concept corridors stay outside operational line tabs");
});

test("public channel cannot hit or display future station data",()=>{
  const api=moduleFor(false);
  const screen={sx:x=>x,sy:y=>y,stations:{},zoom:3};
  assert.equal(api.enabled,false);
  assert.equal(api.hitTest(-8050,-1900,screen),null);
  assert.equal(api.stationHTML({line:"NS3A",code:"NS3A"}),"");
  assert.equal(api.connectionsHTML("Choa Chu Kang"),"");
  assert.equal(api.selectStation("CRL","CR17"),false);
});

const geometry=JSON.parse(fs.readFileSync(new URL("../web/future-rail-geometry.json",import.meta.url),"utf8"));

test("bundled shapes reference published features and stay on adjacent station pairs",()=>{
  const api=moduleFor(true);
  for(const [id,sections] of Object.entries(geometry.sections)){
    const codes=api.network[id].stations.map(s=>s.code);
    for(const section of sections){
      assert.equal(codes[codes.indexOf(section.from)+1],section.to,id);
      assert.ok(geometry.sources[section.source||"ura"]);
      for(const part of section.parts){
        assert.ok(Number.isInteger(part.id));
        assert.ok(part.xy.length>=2 && part.xy.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
      }
    }
  }
  for(const id of ["JRL_W","JRL_E","JRL_N","CRL","CPE","DTL2E","TELe","TEL5","DTL3E","NS6","NS3A","TE10","TE21","TE22A","CC18","CRL_T5"]){
    assert.equal(geometry.sections[id].length,api.network[id].stations.length-1,id);
  }
  assert.equal(geometry.sections.CRL.filter(s=>s.source==="osm").length,4);
  assert.equal(geometry.sections.WCE.length,0);
  assert.equal(api.network.SEL.stations.length+api.network.TGL.stations.length,0);
  assert.equal(api.network.JRL_E.stations[0].code,"JS3");
  assert.equal(api.network.JRL_N.stations[0].code,"JS7");
  assert.equal(api.network.TELe.stations.at(-1).code,"TE35");
});

test("Dev draws real parts independently and never connects missing geometry",async()=>{
  let ready;
  const document={readyState:"loading",addEventListener(_,callback){ready=callback;},getElementById(){return null;}};
  const window={MRT_DEV_FEATURES:true,MRT_PRODUCTION:false,document};
  const marker=geometry.sections.JRL_W[0].parts[0].xy[0];
  const moves=[],dashes=[];
  const ctx=new Proxy({}, {get(_,name){
    if(name==="moveTo")return (x,y)=>moves.push([x,y]);
    if(name==="setLineDash")return values=>dashes.push(values.join(","));
    return ()=>{};
  }});
  vm.runInNewContext(source,{window,document,console,fetch:async()=>({ok:true,json:async()=>geometry})});
  ready();
  await new Promise(resolve=>setImmediate(resolve));
  const api=window.mrtFutureRail;
  api.draw(ctx,{sx:x=>x,sy:y=>y,zoom:1});
  assert.equal(moves.length,Object.values(geometry.sections).flat().reduce((n,s)=>n+s.parts.length,0));
  assert.ok(moves.some(([x,y])=>x===marker[0]&&y===marker[1]));
  assert.ok(dashes.includes("6,5"));
  const station=api.byCode("JRL_E","JE1").station;
  assert.equal(api.hitTest(station.x,station.y,{sx:x=>x,sy:y=>y,zoom:6}).code,"JE1");
  assert.match(api.stationHTML({line:"CRL",code:"CR22"}),/OpenStreetMap/);
});
