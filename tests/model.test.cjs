const test = require('node:test');
const assert = require('node:assert/strict');
const {build} = require('../src/model.js');

const base = {
  'element-type': 'balcony', shape: 'rectangle', length: 3200, depth: 1600,
  thickness: 180, cut: 300, support: 'isokorf', slope: 1.5,
  drain: true, railing: true, upstand: false, finish: 'anti-slip'
};

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-10),
    label + ': ' + actual + ' vs ' + expected);
}

// Independent solid audit. Edge count and opposite winding detect open shells
// and internal faces. Signed tetrahedra also detect inside-out shells.
function auditMesh(faces) {
  const edges = new Map(), points = new Set();
  let sixVolume = 0;
  for (const face of faces) {
    assert.ok(face.length >= 3);
    const [a, ...rest] = face;
    for (let i=1; i<rest.length; i++) {
      const b = rest[i-1], c = rest[i];
      sixVolume += a[0]*(b[1]*c[2] - b[2]*c[1]) +
        a[1]*(b[2]*c[0] - b[0]*c[2]) +
        a[2]*(b[0]*c[1] - b[1]*c[0]);
    }
    for (let i=0; i<face.length; i++) {
      assert.ok(face[i].every(Number.isFinite));
      const from = face[i].join(','), to = face[(i+1)%face.length].join(',');
      assert.notEqual(from, to);
      points.add(from);
      const key = [from,to].sort().join('|');
      const usage = edges.get(key) || [];
      usage.push(from < to ? 1 : -1);
      edges.set(key,usage);
    }
  }
  for (const [key, usage] of edges) assert.deepEqual(usage.sort(), [-1,1], key);
  assert.equal(points.size - edges.size + faces.length, 2, 'One continuous genus-zero boundary');
  return sixVolume / 6e9;
}

function expectedAreas(s) {
  const {length:l,depth:d,cut:c,upstandWidth:w=80} = s;
  if (s.shape === 'chamfer') {
    const intrusion = Math.max(0, w - (d-c));
    return [l*d - c*c/2, l*w - intrusion*intrusion/2];
  }
  if (s.shape === 'trapezoid') return [(l-c)*d, (l-2*c)*w + c*w*w/d];
  return [l*d,l*w];
}

for (const shape of ['rectangle','chamfer','trapezoid']) {
  for (const upstand of [true,false]) {
    test(shape + ', opstand ' + upstand + ': volume, contour, topologie en massa', () => {
      for (const slope of [0,1.5,5]) {
        for (const sizes of [
          {}, {cut:0}, {depth:400,cut:180,upstandWidth:220},
          {depth:400,cut:180,upstandWidth:300},
          {length:12000,depth:4000,cut:1000,thickness:500,density:2750}
        ]) {
          const s = {...base,shape,slope,upstand,...sizes};
          const result = build(s);
          assert.equal(result.parts.length, 1);
          const [area, strip] = expectedAreas(s);
          const volume = (s.thickness*area + (s.upstand ? (s.upstandHeight ?? 100)*strip : 0))/1e9;
          close(result.areaM2,area/1e6,'Area');
          close(result.volumeM3,volume,'Analytical volume');
          close(auditMesh(result.parts[0].faces),volume,'Solid volume');
          close(result.massKg,volume*(s.density ?? 2450),'Mass');
          close(result.dropMm,slope*s.depth/100,'Drop');
        }
      }
    });
  }
}

test('HWA en hekwerk volgen de vrije rand en voegen geen beton toe', () => {
  const withDetails = build({...base,shape:'chamfer'});
  const withoutDetails = build({...base,shape:'chamfer',drain:false,railing:false});
  assert.deepEqual(withDetails.parts,withoutDetails.parts);
  assert.deepEqual(withoutDetails.reservations,{drain:null,railing:[]});
  for (const [x,y,z] of [withDetails.reservations.drain,...withDetails.reservations.railing]) {
    assert.ok(x >= base.cut && x <= base.length);
    assert.equal(y, base.depth);
    assert.equal(z,-24);
  }
});

test('Invoercontroles weigeren ongeldige waarden, ook op de verkorte contour', () => {
  for (const params of [
    {length:NaN}, {depth:'1600'}, {thickness:39}, {freeThickness:501}, {slope:Infinity}, {cut:1001},
    {'element-type':'x'}, {shape:'x'}, {finish:'x'}, {support:'x'},
    {drain:1}, {upstand:'true'}, {railing:null}, {density:-10},
    {upstandWidth:0}, {upstandHeight:-20}, {shape:'chamfer',length:400,cut:200},
    {thicknessMode:'curved'}, {edgeProfile:'x'}, {edgeSide:'x'}, {edgeWidth:9}, {edgeDrop:0},
    {edgeProfile:'step',edgeWidth:400,depth:400}, {thicknessMode:'reference'}
  ]) assert.throws(() => build({...base,...params}), Error);
});

function closeHeights(measured, expected, label) {
  const levels = measured.sort((a,b) => a-b).filter((z,i,all) => !i || Math.abs(z-all[i-1]) > 1e-7);
  assert.equal(levels.length, expected.length, label + ' number of intersections');
  expected.forEach((value,i) => close(levels[i],value,label));
}

function sampleSection(ring, atY) {
  const hits = [];
  ring.forEach(([y,z],i) => {
    const [toY,toZ] = ring[(i+1)%ring.length];
    if (atY >= Math.min(y,toY) && atY < Math.max(y,toY)) {
      hits.push(z+(toZ-z)*(atY-y)/(toY-y));
    }
  });
  return hits;
}

// Intersect an independent vertical ray with the exported boundary triangles.
function sampleMesh(faces, x, y) {
  const hits = [];
  for (const face of faces) {
    const [a] = face;
    for (let i=1; i+1<face.length; i++) {
      const b=face[i], c=face[i+1];
      const den = (b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
      if (!den) continue;
      const wb = ((x-a[0])*(c[1]-a[1])-(c[0]-a[0])*(y-a[1]))/den;
      const wc = ((b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]))/den;
      if (wb>=-1e-11 && wc>=-1e-11 && wb+wc<=1+1e-11) {
        hits.push(a[2]+wb*(b[2]-a[2])+wc*(c[2]-a[2]));
      }
    }
  }
  return hits;
}

// Independent antiderivatives of the footprint width and its first moment.
// These give exact volumes for arbitrary linear heights a + b*y on [u,v].
function integral(state, u, v, intercept, gradient) {
  const {length,depth,cut,shape} = state;
  function primitive(y) {
    const a = shape==='trapezoid' ? length-2*cut : length;
    const b = shape==='trapezoid' ? 2*cut/depth : 0;
    let area = a*y + b*y*y/2;
    let moment = a*y*y/2 + b*y*y*y/3;
    if (shape==='chamfer') {
      const kink = depth-cut;
      const beyond = Math.max(0,y-kink);
      area -= beyond*beyond/2;
      moment -= kink*beyond*beyond/2 + beyond*beyond*beyond/3;
    }
    return intercept*area + gradient*moment;
  }
  return (primitive(v)-primitive(u))/1e9;
}

test('variabele dikte met rechthoekige en schuine rand: snede, mesh, integralen en massa', () => {
  for (const shape of ['rectangle','trapezoid','chamfer'])
  for (const [thickness, freeThickness] of [[65,115],[130,65],[100,100]])
  for (const edgeProfile of ['none','step','bevel'])
  for (const edgeSide of ['free','facade'])
  for (const edgeWidth of [80,213.7,300]) {
    const depth = 400, upstandWidth = 80, upstandHeight = 42, edgeDrop = 15;
    const state = {...base, thicknessMode:'linear', thickness,freeThickness,shape, edgeProfile,edgeSide,
      cut:100,depth,upstand:true, upstandWidth,upstandHeight,edgeWidth,edgeDrop};
    const model = build(state);
    const sideAtFacade = edgeSide==='facade';
    const u = sideAtFacade ? 0 : depth-edgeWidth;
    const v = sideAtFacade ? edgeWidth : depth;
    const gradient = (freeThickness-thickness)/depth;
    const strip = integral(state,0,upstandWidth,upstandHeight,0);
    let extra = 0;
    if (edgeProfile==='bevel') {
      const ratio = (sideAtFacade ? -1 : 1)*edgeDrop/edgeWidth;
      extra = integral(state,u,v,sideAtFacade ? edgeDrop : -u*ratio,ratio);
    } else if (edgeProfile==='step') {
      extra = integral(state,u,v,edgeDrop,0);
    }
    const expected = integral(state,0,depth,thickness,gradient)+strip+extra;
    close(model.upstandVolumeM3,strip,'Opstand');
    close(model.edgeVolumeM3,extra,'Randvolume');
    close(model.volumeM3,expected,'Volume uit integralen');
    close(model.massKg,expected*2450,'Massa');
    close(auditMesh(model.parts[0].faces),expected,'Volume uit mesh');
    const edgeAddition = edgeProfile==='none' ? 0 : edgeDrop;
    close(model.endThicknessMm[0],thickness+upstandHeight+(sideAtFacade ? edgeAddition : 0),'Geveldikte');
    close(model.endThicknessMm[1],freeThickness+(sideAtFacade ? 0 : edgeAddition),'Vrije randdikte');
    for (const atY of [.001,52.534,79.999,80.001,190.617,213.699,213.701,350.438,399.999]) {
      const walk = -state.slope*atY/100;
      const top = walk+(atY<upstandWidth ? upstandHeight : 0);
      const inset = sideAtFacade ? atY : depth-atY;
      const offset = inset < edgeWidth ? edgeAddition*(edgeProfile==='bevel' ? 1-inset/edgeWidth : 1) : 0;
      const bottom = walk-thickness-gradient*atY-offset;
      const intersections = [bottom,top];
      closeHeights(sampleSection(model.sectionRing,atY),intersections,'Snede A–A');
      closeHeights(sampleMesh(model.parts[0].faces,state.length/2,atY),intersections,'Mesh A–A');
    }
  }
});

test('samenvallende decimale profielsprongen vormen één snijlijn in model en IFC', () => {
  require('../src/ifc.js');
  for (const [depth,edgeWidth,upstandWidth] of [[600.2,517.8,82.4], [600.3,502.1,98.2]]) {
    for (const edgeProfile of ['step','bevel']) {
      const state = {...base,depth,upstand:true,upstandWidth,upstandHeight:100,edgeProfile,
        edgeSide:'free',edgeWidth,edgeDrop:35};
      const model = build(state);
      const expected = state.length*(depth*state.thickness + upstandWidth*state.upstandHeight +
        edgeWidth*state.edgeDrop*(edgeProfile === 'step' ? 1 : 0.5))/1e9;
      const stations = [...new Set(model.sectionRing.map(([y]) => y))].sort((a,b) => a-b);
      assert.equal(stations.length,3);
      close(stations[1],upstandWidth,'Samenvallende profielovergang');
      close(model.volumeM3,expected,'Analytisch volume');
      close(auditMesh(model.parts[0].faces),expected,'Gesloten mesh');
      for (const offset of [-0.01,0.01]) {
        const y = upstandWidth+offset;
        const walk = -state.slope*y/100;
        const drop = offset < 0 ? 0 : state.edgeDrop*(edgeProfile === 'step' ? 1 : offset/edgeWidth);
        closeHeights(sampleSection(model.sectionRing,y),
          [walk-state.thickness-drop,walk+(offset < 0 ? state.upstandHeight : 0)],'Snede naast overgang');
      }
      const ifc = PrecastIFC.export(model.state,model,'c27020f4-b0d2-4e7e-aa0d-01b790adc137');
      const faces = [...ifc.matchAll(/IFCINDEXEDPOLYGONALFACE\(\(([\d,]+)\)\)/g)];
      assert.equal(faces.length,model.parts[0].faces.length);
      for (const [,list] of faces) {
        const indices = list.split(',');
        assert.equal(new Set(indices).size,indices.length,'Ieder IFC-vlak heeft unieke hoekpunten');
      }
      const separate = build({...state,upstandWidth:upstandWidth+0.001});
      assert.equal(new Set(separate.sectionRing.map(([y]) => y)).size,4);
    }
  }
});

test('gemeten Hi-Con hoofdlichaam: broncoördinaten, doorsnede, gesloten mesh en volume', () => {
  const state = {...base,length:2200, depth:2210, thicknessMode:'reference',slope:1};
  const model = build(state);
  // Measured local IFC coordinates at X=1000, before the editor's Y reversal.
  const sourceRing = [[0,317.1],[2143.53535,338.53535],[2165,360],[2210,360],[2210,230],
    [44.99975,251.65],[42.54317,256.00491],[37.54342,256.05491],[35.00025,251.75],[0,252.1]];
  const sourceArea = Math.abs(sourceRing.reduce((s,[y,z],i) => {
    const next = sourceRing[(i+1)%sourceRing.length];
    return s+y*next[1]-z*next[0];
  },0))/2;
  close(sourceArea,193632.7098315913,'Bronoppervlak');
  close(model.volumeM3,sourceArea*state.length/1e9,'Hoofdprofiel × extrusielengte');
  close(auditMesh(model.parts[0].faces),model.volumeM3,'Gesloten grensvlakken');
  close(model.endThicknessMm[0],130,'Geveldetail');
  close(model.endThicknessMm[1],65,'Vrije rand');
  for (const [sourceY,sourceZ] of sourceRing) {
    assert.ok(model.sectionRing.some(([y,z]) => Math.abs(y-(2210-sourceY)) < 1e-7 && Math.abs(z-(sourceZ-339.2)) < 1e-7),
      'Bronhoekpunt ontbreekt: ' + sourceY + ', ' + sourceZ);
  }
  for (const sourceY of [0.01,35.823,37.582,40.495,43.123,44.998,58,1012.3,2149.9,2164.8,2190]) {
    const zValues = sampleSection(sourceRing,sourceY).map(z => z-339.2).sort((a,b) => a-b);
    const editorY = 2210-sourceY;
    closeHeights(sampleSection(model.sectionRing,editorY),zValues,'Onafhankelijke bronsectie');
    closeHeights(sampleMesh(model.parts[0].faces,state.length/2,editorY),zValues,'Bron tegen mesh');
  }
  for (const shape of ['chamfer','trapezoid']) {
    const variant = build({...state,shape});
    close(auditMesh(variant.parts[0].faces),variant.volumeM3,'Meshvolume aangepaste contour');
  }
  for (const change of [{slope:2},{depth:2200},{upstand:true},{edgeProfile:'step'}]) {
    assert.throws(() => build({...state,...change}),/referentieprofiel/);
  }
});
