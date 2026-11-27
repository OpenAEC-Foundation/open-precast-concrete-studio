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

test('langsgoot en waterhol volgen de contour en minderen correct in snede, mesh en volume', () => {
  // Both features cross a change in footprint or soffit. The reference
  // volumes integrate the known footprint width against each cut separately.
  for (const shape of ['rectangle','chamfer','trapezoid'])
  for (const channelProfile of ['none','rect','v'])
  for (const dripGroove of [false,true])
  for (const edgeProfile of ['none','step','bevel']) {
    const s = {...base, shape, thicknessMode:'linear', length:3000, depth:1500, thickness:180, freeThickness:100,
      cut:150, upstand:true, edgeProfile, edgeWidth:120, edgeDrop:40, channelProfile, channelWidth:160,
      channelInset:40, channelDepth:30, dripGroove, dripWidth:60, dripDepth:12, dripInset:90, drainPosition:28};
    const plain = build({...s,channelProfile:'none',dripGroove:false});
    const m = build(s);
    function vVolume(inner, outer, depth) {
      const centre = (inner+outer)/2;
      const gradient = 2*depth/(outer-inner);
      return integral(s,inner,centre,-inner*gradient,gradient) + integral(s,centre,outer,outer*gradient,-gradient);
    }
    const channel = channelProfile === 'none' ? 0 : channelProfile === 'rect' ?
      integral(s,1300,1460,30,0) : vVolume(1300,1460,30);
    const drip = dripGroove ? vVolume(1350,1410,12) : 0;
    close(m.channelVolumeM3,channel,'Gootuitsparing');
    close(m.dripVolumeM3,drip,'Waterholuitsparing');
    close(m.areaM2,plain.areaM2,'Projectieoppervlak');
    const net = plain.volumeM3-channel-drip;
    close(m.volumeM3,net,'Netto betonvolume');
    close(m.massKg,net*2450,'Massa');
    close(auditMesh(m.parts[0].faces),net,'Gesloten mesh en gemeten inhoud');
    for (const [polygon, exists, ymin, ymax] of [[m.channelOutline,!!channel,1300,1460],[m.dripOutline,dripGroove,1350,1410]]) {
      if (!exists) { assert.deepEqual(polygon,[]); continue; }
      assert.equal(Math.min(...polygon.map(p=>p[1])),ymin);
      assert.equal(Math.max(...polygon.map(p=>p[1])),ymax);
      for (const [x,y] of polygon) {
        const inset = shape === 'trapezoid' ? (1-y/1500)*150 : 0;
        const left = shape === 'chamfer' ? Math.max(0,y-1350) : inset;
        assert.ok(Math.abs(left-x)<1e-9 || Math.abs(3000-inset-x)<1e-9);
      }
    }
    for (const y of [1,300,1299.9,1300.1,1349.9,1350.1,1379.9,1380.1,1409.9,1410.1,1459.9,1460.1]) {
      const ramp = (centre,half) => Math.max(0,1-Math.abs(y-centre)/half);
      const drop = channelProfile === 'rect' ? (y>1300 && y<1460 ? 30 : 0) : channelProfile === 'v' ? 30*ramp(1380,80) : 0;
      const lift = dripGroove ? 12*ramp(1380,30) : 0;
      const [bottom,top] = sampleSection(plain.sectionRing,y).sort((a,b) => a-b);
      const levels = [bottom+lift,top-drop];
      closeHeights(sampleSection(m.sectionRing,y),levels,'Tekendoorsnede');
      closeHeights(sampleMesh(m.parts[0].faces,1500,y),levels,'Werkelijke 3D-doorsnede');
    }
    const y = channelProfile === 'none' ? 1500 : 1380;
    const inset = shape === 'trapezoid' ? (1-y/1500)*150 : 0;
    const left = shape === 'chamfer' ? Math.max(0,y-1350) : inset;
    const right = 3000-inset;
    const hwa = m.reservations.drain;
    close(hwa[0],left+.28*(right-left),'X vanaf plaatselijke linkerrand');
    close(hwa[1],y,'Y');
    close(hwa[2],-s.slope*y/100-(channelProfile === 'none' ? 0 : 30),'HWA op oppervlak');
  }
});

test('waterdetails aan randen, decimale schouders en handmatige HWA-posities', () => {
  const s = {...base, length:2400, depth:600.2, thickness:140, channelProfile:'rect', channelInset:0,
    channelWidth:517.8, channelDepth:40, dripGroove:true, dripWidth:40, dripDepth:15, dripInset:0,
    upstand:true, upstandWidth:82.4};
  const m = build(s);
  const expected = 2.4*(.6002*.140+.0824*.100-.5178*.040-.040*.015/2);
  close(m.volumeM3,expected,'Volume bij aansluitende sprongen');
  close(auditMesh(m.parts[0].faces),expected,'Mesh bij aansluitende sprongen');
  close(m.endThicknessMm[1],100,'Open goot tot vrije rand');
  for (const [position,x] of [[0,0],[100,2400]]) {
    const result = build({...s,drainPosition:position});
    close(result.reservations.drain[0],x,'HWA uiterste links/rechts');
    assert.deepEqual(result.parts,m.parts);
  }
  const unmarked = build({...s,drain:false});
  assert.equal(unmarked.reservations.drain,null);
  assert.deepEqual(unmarked.parts,m.parts);
});

test('nabije gootlippen en HWA-stations respecteren de IFC-contextprecisie', () => {
  require('../src/ifc.js');
  const state = {...base, channelProfile:'rect',channelWidth:100,channelDepth:15,channelInset:50,
    dripGroove:true,dripInset:50.00001,dripWidth:15,dripDepth:8,edgeProfile:'step',
    edgeSide:'free',edgeWidth:100.00008,edgeDrop:35,drainPosition:25};
  const model = build(state);
  const stations = new Set(model.sectionRing.map(p => p[0]));
  assert.ok(stations.has(1550) && !stations.has(state.depth-state.dripInset));
  assert.ok(!stations.has(1500));
  assert.equal(model.reservations.drain[1],state.depth-state.edgeWidth);
  const [x,y,z] = model.reservations.drain;
  assert.equal(x,800);
  close(z,-state.slope*y/100-state.channelDepth,'HWA op werkelijke gootbodem');
  close(auditMesh(model.parts[0].faces),model.volumeM3,'Netto-inhoud na samenvallende snijlijnen');

  const ifc = PrecastIFC.export(state,model,'c27020f4-b0d2-4e7e-aa0d-01b790adc137');
  const precision = Number(ifc.match(/'Model',3,([^,]+),#/)[1]);
  const list = ifc.match(/IFCCARTESIANPOINTLIST3D\(\((.*?)\)\);/)[1];
  const points = [...list.matchAll(/\(([^()]*)\)/g)].map(match => match[1].split(',').map(Number));
  assert.ok(points.length > 8);
  for (let i=0; i<points.length; i++) {
    for (const q of points.slice(i+1)) {
      assert.ok(Math.hypot(...q.map((v,k) => v-points[i][k])) > precision);
    }
  }
  assert.throws(() => build({...base,channelProfile:'rect',channelDepth:179.99995}), /doorsnede/);
  assert.throws(() => build({...base,dripGroove:true,dripDepth:179.99995}), /doorsnede/);
});

test('smalle strook tussen gootlip en randsprong behoudt meetbare IFC-zijvlakken', () => {
  const model = build({...base, channelProfile:'rect',channelInset:50,channelWidth:100,channelDepth:1,
    edgeSide:'free',edgeProfile:'step',edgeWidth:50.001,edgeDrop:1});
  close(auditMesh(model.parts[0].faces),model.volumeM3,'Gesloten smalle strook');
  for (const wall of model.parts[0].faces.filter(face => face.every(([x]) => x === 0))) {
    const [,y0,z0] = wall[0];
    let doubleArea = 0, longest = 0;
    for (let i=0; i<wall.length; i++) {
      const [,y,z] = wall[i], [,nextY,nextZ] = wall[(i+1)%wall.length];
      doubleArea += (y-y0)*(nextZ-z0)-(nextY-y0)*(z-z0);
      longest = Math.max(longest,Math.hypot(nextY-y,nextZ-z));
    }
    assert.ok(Math.abs(doubleArea) > longest*0.0001,'Zijvlak dient oplosbaar te zijn op de IFC-precisie');
  }
});

test('waarschuwing vergelijkt de buitenlip van de goot met het HWA-punt', () => {
  const shallow = {...base, depth:1800, slope:2, channelWidth:300, channelDepth:2, channelInset:50};
  for (const shape of ['rectangle','chamfer','trapezoid']) {
    for (const channelProfile of ['v','rect']) {
      const state = {...shallow, shape, channelProfile};
      const model = build(state);
      close(model.reservations.drain[2], -34, 'HWA op de gootbodem');
      const lipTop = Math.max(...model.sectionRing.filter(([y]) => y === 1750).map(([,z]) => z));
      close(lipTop, -35, 'Bovenzijde buitenlip');
      close(model.lowLipWarningMm, 1, 'Buitenlip lager dan HWA');
      for (const change of [{channelDepth:3}, {channelDepth:3.1}, {slope:0}, {drain:false},
                             {channelProfile:'none'}, {channelDepth:2.99995}]) {
        assert.equal(build({...state,...change}).lowLipWarningMm, null);
      }
      close(build({...state,drainPosition:0,upstand:true}).lowLipWarningMm, 1, 'HWA links');
      close(build({...state,drainPosition:100}).lowLipWarningMm, 1, 'HWA rechts');
    }
  }
  // At zero inset the rectangular cut opens out at the free edge. A 10 mm
  // deep channel then retains the full 3 mm centre-to-edge fall of its floor.
  close(build({...shallow,channelProfile:'rect',channelDepth:10,channelInset:0}).lowLipWarningMm, 3, 'Open uiteinde');
  assert.equal(build({...shallow,channelProfile:'rect',channelDepth:10}).lowLipWarningMm, null);
});

test('ongeldige waterdetails en onderbroken doorsneden worden geweigerd', () => {
  for (const patch of [
    {channelProfile:'round'}, {dripGroove:'yes'}, {channelWidth:0},{channelDepth:-1},
    {dripDepth:Infinity},{dripInset:-1},{drainPosition:NaN},{drainPosition:101},
    {channelProfile:'v',channelWidth:1500,channelInset:101},
    {dripGroove:true,dripWidth:200,dripInset:1401},
    {channelProfile:'rect',upstand:true,channelWidth:1500,channelInset:30},
    {channelProfile:'v',channelDepth:180},
    {dripGroove:true,dripDepth:180},
    {thickness:100,channelProfile:'rect',channelDepth:70,dripGroove:true,dripInset:62,dripDepth:31},
    // Each side retains material but the two vertical intervals at the step are disjoint.
    {thickness:60,edgeSide:'free',edgeProfile:'step',edgeWidth:120,edgeDrop:30,
      channelProfile:'rect',channelInset:0,channelWidth:120,channelDepth:75},
    {thicknessMode:'reference',slope:1,depth:2210,dripGroove:true},
    {thicknessMode:'reference',slope:1,depth:2210,channelProfile:'rect'}
  ]) assert.throws(() => build({...base,...patch}), Error);
});
