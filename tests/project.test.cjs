const {test} = require('node:test');
const assert = require('node:assert/strict');
const project = require('../src/project.js');
const profiles = require('../src/profiles.js');
require('../src/ifc.js');
const id = 'c27020f4-b0d2-4e7e-aa0d-01b790adc137';

test('both reference profiles, exact and exceeded boundaries and gallery scope', () => {
  const state = {...project.defaults, supplier:'olbecon', length:10000, depth:3000, thickness:200};
  const check = state => profiles.assess(state, project.validate(state));
  assert.deepEqual(check(state).checks.map(v => v.warning), [false,false,false]);
  assert.deepEqual(check({...state,length:10001,depth:3001,thickness:500}).checks.map(v => v.warning), [true,true,true]);
  assert.equal(check({...state,'element-type':'gallery'}).checks.length, 0);
  assert.deepEqual(check({...state,supplier:'vebo',slope:0}).checks.map(v => v.warning), [false,true]);
  assert.deepEqual(check({...state,supplier:'vebo',slope:1}).checks.map(v => v.warning), [true,true]);
});

test('OMG compares general production dimensions and shows coordination for the drain', () => {
  const gallery = {...project.defaults,supplier:'omg','element-type':'gallery',length:10000,depth:4500,thickness:120};
  const compare = state => profiles.assess(state,project.validate(state)).checks.map(check => check.warning);
  assert.deepEqual(compare(gallery),[false,false,false,true]);
  assert.deepEqual(compare({...gallery,channelProfile:'v'}),[false,false,false,false]);
  assert.deepEqual(compare({...gallery,length:10001,depth:4501,thickness:220,channelProfile:'rect',drain:false}),[true,true,true,true]);
});

test('current project format preserves state and identity after revisions', () => {
  const state = {...project.defaults, shape:'trapezoid', upstand:true, mark:"BP 'Zuid'"};
  const json = project.encode(state, id, 'Project Zuid');
  assert.deepEqual(project.decode(json), {state, identity:id, name:'Project Zuid'});
  for (const patch of [{unit:'m'}, {schema:'future'}, {identity:42},{element:{...state,upstand:'false'}},{element:{...state,length:null}}, {element:{...state,mark:' '}}]) {
    assert.throws(() => project.decode(JSON.stringify({...JSON.parse(json),...patch})));
  }
});

test('a saved 0.2 element keeps its identity and original constant cross-section', () => {
  const record = {schema:'open-precast-concrete-studio/0.2', unit:'mm', identity:id, name:'Galerij zuid',
    element:{'element-type':'gallery', mark:'GP-Z01', storey:'02 Verdieping', supplier:'generic',
      length:4600, depth:1800, thickness:200, shape:'chamfer', cut:450, slope:1.5,
      drain:true, railing:true, upstand:true, support:'console', finish:'waffle', density:2450,
      upstandWidth:80, upstandHeight:140}};
  const loaded = project.decode(JSON.stringify(record));
  assert.equal(loaded.identity, record.identity);
  assert.equal(loaded.state.freeThickness, record.element.thickness);
  assert.equal(loaded.state.thicknessMode, 'constant');
  assert.equal(loaded.state.edgeProfile, 'none');
  assert.ok(Math.abs(project.validate(loaded.state).volumeM3 - 1.68727) < 1e-10);
});

test('every accepted project UUID remains usable as the IFC slab identity', () => {
  const identity = '8f441653-984f-565a-9893-897db827c2ba';
  const saved = project.decode(project.encode(project.defaults, identity, 'Revisie'));
  const text = globalThis.PrecastIFC.export(saved.state, project.validate(saved.state), saved.identity);
  const guid = text.match(/IFCSLAB\('([^']+)'/)[1];
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const parsed = [...guid].reduce((result, c) => result * 64n + BigInt(alphabet.indexOf(c)), 0n);
  assert.equal(parsed.toString(16), identity.replaceAll('-', ''));
});

test('the 0.4.1 Windows example retains its measured waterhol and identity on upgrade', () => {
  const record = require('../examples/BP-P01.opc.json');
  assert.equal(record.schema,'open-precast-concrete-studio/0.3');
  const restored = project.decode(JSON.stringify(record));
  assert.equal(restored.identity,record.identity);
  assert.equal(restored.state.thicknessMode,'reference');
  assert.equal(restored.state.channelProfile,'none');
  assert.equal(restored.state.dripGroove,false);
  assert.equal(restored.state.drainPosition,66);
  assert.ok(Math.abs(project.validate(restored.state).volumeM3 - 0.42599196163) < 1e-10);
  const encoded = project.encode(restored.state,restored.identity,restored.name);
  assert.equal(JSON.parse(encoded).schema,'open-precast-concrete-studio/0.5');
  assert.deepEqual(project.decode(encoded),restored);
});

test('0.4 retains its drainage geometry and a 0.5 rebate round-trips without changing the IFC identity', () => {
  const old = structuredClone(require('../examples/GP-A01.opc.json'));
  assert.equal(old.schema,'open-precast-concrete-studio/0.4');
  const {state, identity, name} = project.decode(JSON.stringify(old));
  assert.equal(state.facadeRebate,false);
  assert.deepEqual({...old.element,facadeRebate:false,rebateWidth:120,rebateDepth:30},state);
  const revised = {...state,upstand:false,facadeRebate:true,rebateWidth:95,rebateDepth:17};
  assert.deepEqual(project.decode(project.encode(revised,identity,name)),{state:revised,identity,name});
});

test('existing concept 0.1 stays editable and gains a stable ID on first save', () => {
  const old = {type:'gallery',shape:'chamfer',length:4600,depth:2000,thickness:185,contour:325, support:'console',
    slopePercent:1.2, drain:false, railingProvision:true,wallUpstand:true,surfaceFinish:'waffle'};
  const json = JSON.stringify({schema:'open-precast-concrete-studio/concept-0.1',unit:'mm',name:'Oud ontwerp',element:old});
  const out = project.decode(json,() => id);
  assert.equal(out.state.mark,'GP-01');
  assert.equal(out.state.cut,325);
  assert.equal(out.state.finish,'waffle');
  assert.equal(out.state.density,2450);
  assert.deepEqual(project.decode(project.encode(out.state,out.identity,out.name)),out);
});
