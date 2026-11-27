// Fixtures for the independent IFC reader. Called by verify-ifc.py.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {build} = require('../src/model.js');
require('../src/ifc.js');

const directory = process.argv[2];
const projectId = PrecastIFC.newIdentity();
const initial = {
  'element-type':'balcony', shape:'rectangle', length:3200, depth:1600, thickness:180,
  cut:300, support:'isokorf', slope:1.5, drain:true, railing:true,
  finish:'anti-slip', upstand:false, mark:"BP-01 'één'", storey:'Étage \\ west', density:2450,
  supplier:'generic', upstandWidth:80, upstandHeight:100
};
const cases = {
  base:initial,
  revision:{...initial, shape:'chamfer', upstand:true, length:4100, slope:2.3, density:2390, mark:'BP-02'},
  gallery:{...initial, 'element-type':'gallery', shape:'trapezoid', upstand:true, density:2510,
    supplier:'vebo', finish:'blasted', support:'steel', mark:'GP-01', storey:'Galerij',
    drain:false, railing:false},
  wedge:{...initial, thicknessMode:'linear', thickness:115, freeThickness:65,
    edgeProfile:'bevel', edgeSide:'free', edgeWidth:220, edgeDrop:65,
    length:2200, depth:2000, slope:1.0, mark:'BP-W'},
  step:{...initial, thicknessMode:'linear', thickness:65, freeThickness:130,
    edgeProfile:'step', edgeSide:'facade', edgeWidth:175, edgeDrop:28,
    upstand:true, upstandWidth:75, shape:'trapezoid', mark:'BP-S'},
  diagonal:{...initial, thicknessMode:'linear', thickness:130, freeThickness:65,
    edgeProfile:'step', edgeSide:'free', edgeWidth:245, edgeDrop:45,
    shape:'chamfer', cut:357, slope:0, mark:'BP-D'},
  coincident:{...initial, thicknessMode:'constant', edgeProfile:'bevel', edgeSide:'facade',
    edgeWidth:100, edgeDrop:40, upstand:true, upstandWidth:100, mark:'BP-C'},
  decimal:{...initial, depth:600.2, upstand:true, upstandWidth:82.4, edgeProfile:'step',
    edgeSide:'free', edgeWidth:517.8, edgeDrop:45, mark:'BP-F'},
  gutter:{...initial, channelProfile:'rect', channelInset:50, channelWidth:100, channelDepth:15,
    dripGroove:true, dripWidth:15, dripDepth:8, dripInset:25, drainPosition:30, mark:'BP-G'},
  vchannel:{...initial, shape:'trapezoid', cut:240, thicknessMode:'linear', freeThickness:120,
    channelProfile:'v', channelInset:62.5, channelWidth:125, channelDepth:30,
    edgeProfile:'step', edgeSide:'free', edgeWidth:125, edgeDrop:15, dripGroove:true,
    dripWidth:30, dripDepth:10, dripInset:110, drainPosition:0, mark:'BP-V'},
  cornerChannel:{...initial, 'element-type':'gallery', supplier:'omg', shape:'chamfer', cut:320, upstand:true,
    channelProfile:'rect', channelInset:0, channelWidth:320, channelDepth:23,
    dripGroove:true, dripInset:50, dripWidth:20, dripDepth:8, drainPosition:100, mark:'GP-G'},
  rebate:{...initial, length:3200, depth:1800, thicknessMode:'linear', freeThickness:120,
    edgeProfile:'bevel', edgeSide:'facade', edgeWidth:500, edgeDrop:60,
    facadeRebate:true, rebateWidth:120, rebateDepth:30, mark:'BP-S01'},
  rebateGallery:{...initial, 'element-type':'gallery', shape:'trapezoid', cut:450,
    facadeRebate:true, rebateWidth:400, rebateDepth:40, channelProfile:'rect',
    channelInset:1100, channelWidth:100, channelDepth:25,
    dripGroove:true, dripInset:1250, dripWidth:16, dripDepth:12, mark:'GP-S02'},
  reference:{...initial, thicknessMode:'reference', thickness:109.2, freeThickness:65,
    length:2200, depth:2210, slope:1, edgeProfile:'none', upstand:false, mark:'BP-R'}
};
for (const [name, state] of Object.entries(cases)) {
  const identity = name === 'gallery' ? PrecastIFC.newIdentity() : projectId;
  const model = build(state);
  const text = PrecastIFC.export(state, model, identity);
  fs.writeFileSync(path.join(directory, name + '.ifc'), text);
  fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify(state));
}
assert.throws(() => PrecastIFC.export(initial, build(initial), 'not-an-identity'), /identiteit/);
