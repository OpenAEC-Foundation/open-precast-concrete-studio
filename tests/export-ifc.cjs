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
