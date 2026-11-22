import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/taxi-availability.js", import.meta.url), "utf8");
const make = (dev = true) => {
  let requests = 0;
  const window = {
    MRT_PRODUCTION: !dev,
    MRT_DEV_FEATURES: dev,
    document: {hidden:false},
    nativeGet: async (url, withKey) => {
      requests++;
      assert.equal(url, "https://api.data.gov.sg/v1/transport/taxi-availability");
      assert.equal(withKey, false, "a public endpoint needs no LTA API key");
      return {code:200, body:JSON.stringify({
        type:"FeatureCollection",
        features:[{geometry:{type:"MultiPoint",coordinates:[
          [103.819,1.352], [103.825,1.352], [103.838,1.352]]},
          properties:{timestamp:new Date().toISOString(),taxi_count:3}}]
      })};
    }
  };
  const context = {window, Date, JSON, Promise, Map, Math, Error, Number, String};
  vm.createContext(context);
  vm.runInContext(source,context);
  return {api:window.mrtTaxiAvailability,requests:()=>requests};
};

test("taxi GeoJSON points have [longitude, latitude] and use accurate radial counts", () => {
  const {api}=make();
  const point={x:0,y:0,name:"Central"};
  const data=api.parseGeoJSON({
    type:"FeatureCollection",
    features:[{geometry:{type:"MultiPoint",coordinates:[
      [103.819,1.352],[103.825,1.352],[103.838,1.352],[1.352,103.819]
    ]},properties:{timestamp:new Date().toISOString()}}]
  });
  assert.equal(data.points.length,3,"discard swapped or out-of-Singapore coordinates");
  const nearby=api.countNearby(point,data.points);
  assert.equal(nearby.within500,1);
  assert.equal(nearby.within1000,2);
  assert.throws(()=>api.parseGeoJSON({features:[]}),/timestamp/);
});

test("public releases never expose or poll the Dev-only taxi feature", async () => {
  const {api,requests}=make(false);
  assert.equal(api.enabled(),false);
  assert.equal(api.stationHTML({x:0,y:0,name:"City"}),"");
  assert.equal(await api.refresh(true),false);
  assert.equal(requests(),0);
  const html=fs.readFileSync(new URL("../web/index.html",import.meta.url),"utf8");
  assert.match(html,/MRT_DEV_FEATURES=false/);
  assert.doesNotMatch(html,/mrtTaxiAvailability\.stationHTML\(e\)/);
});

test("Dev station card shows 500m and 1km counts, caches for one minute",async()=>{
  const {api,requests}=make(true);
  assert.equal(api.enabled(),true);
  const st={name:"City",x:0,y:0};
  assert.match(api.stationHTML(st),/Available taxis nearby/);
  await api.refresh();
  const card=api.stationHTML(st);
  assert.match(card,/<b>1<\/b> within 500 m/);
  assert.match(card,/<b>2<\/b> within 1 km/);
  assert.match(card,/straight-line distance; not a pickup guarantee/);
  assert.equal(requests(),1);
  await api.refresh();
  assert.equal(requests(),1,"enforce minimum one-minute polling");
  await api.refresh(true);
  assert.equal(requests(),2,"explicit refresh may bypass cache");
});
