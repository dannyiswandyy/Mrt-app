(()=>{"use strict";
/*
 * Where a train enters and leaves published passenger service, for train details and the engineering card.
 * Built on the run graph (run-graph.js, via gtfs-lab.js): trips are chained by LTA's run number, because
 * GTFS block_id is empty on almost every trip. It names no depots: GTFS doesn't prove where a train goes
 * before its first or after its last published trip, so it says only what the timetable shows.
 * Kept API: mrtDepotTransferFor(line, train) → {type: "depot_departure" | "depot_return", kind, station,
 * gapSec, confidence (number, for older callers), label, evidence} or null.
 */
const NUM={"CONFIRMED BY DATA":95,"STRONG INFERENCE":85,"POSSIBLE":60,"NOT SUPPORTED":0};
function lookup(line,tid){
  try{
    const g=window.mrtGtfsLab&&window.mrtGtfsLab.lineGraph(line); if(!g)return null;
    const t=g.trips.find(x=>x.tid===tid); if(!t||!t.run)return null;
    const r=t.run;
    if(t===r.last){
      const x=r.leaves, later=/Another run/.test(x.inference)?(x.evidence[1]||""):"";
      const m=/at .+ (\d\d):(\d\d):(\d\d)\.$/.exec(later);
      const gap=m?((+m[1]*3600+ +m[2]*60+ +m[3])-r.end):null;
      return {type:"depot_return",kind:"Leaves published service",station:r.last.dest,gapSec:gap,confidence:NUM[x.label],label:x.label,evidence:x.evidence,inference:x.inference,run:r.run};
    }
    if(t===r.first){
      const x=r.enters;
      return {type:"depot_departure",kind:"Enters published service",station:r.first.origin,gapSec:null,confidence:NUM[x.label],label:x.label,evidence:x.evidence,inference:x.inference,run:r.run};
    }
    return null;
  }catch(e){return null}
}
window.mrtDepotTransferFor=(line,t)=>lookup(line,String(t?.ref?.tid||t?.tid||""));
window.mrtDepotTransferSnapshot=()=>{
  const out={};
  try{for(const l of ["NSL","EWL","CG","NEL","CCL","DTL","TEL"]){const g=window.mrtGtfsLab&&window.mrtGtfsLab.lineGraph(l); out[l]=g?g.runs.length:0}}catch(e){}
  return {lines:out,source:"run graph (service_id + run number)"};
};
})();
