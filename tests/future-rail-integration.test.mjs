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
