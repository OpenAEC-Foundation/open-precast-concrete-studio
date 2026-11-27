// Millimetres. +X follows the facade, +Y points outwards and +Z points up.
(function (global) {
  'use strict';

  const choices = {
    'element-type': ['balcony', 'gallery'],
    shape: ['rectangle', 'chamfer', 'trapezoid'],
    support: ['isokorf', 'console', 'columns', 'steel', 'nokken'],
    finish: ['anti-slip', 'smooth', 'waffle', 'blasted'],
    thicknessMode: ['constant', 'linear', 'reference'],
    edgeProfile: ['none', 'step', 'bevel'],
    edgeSide: ['free', 'facade'],
    channelProfile: ['none', 'rect', 'v']
  };
  const names = {
    'element-type': 'elementtype', shape: 'plaatcontour', support: 'oplegging',
    finish: 'afwerking', drain: 'HWA', railing: 'hekwerk', upstand: 'opstand',
    thicknessMode: 'dikteverloop', edgeProfile: 'randprofiel', edgeSide: 'profielzijde',
    channelProfile: 'langsgoot', dripGroove: 'waterhol', facadeRebate: 'gevelsponning'
  };

  function checkRange(value, label, min, max) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(label + ' moet tussen ' + min + ' en ' + max + ' liggen.');
    }
  }

  function readState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('De elementgegevens ontbreken.');
    }
    const state = {density: 2450, upstandHeight: 100, upstandWidth: 80,
      thicknessMode:'constant', freeThickness:180, edgeProfile:'none',
      edgeSide:'free', edgeWidth:120, edgeDrop:35, facadeRebate:false, rebateWidth:120, rebateDepth:30,
      channelProfile:'none', channelWidth:100, channelDepth:15, channelInset:50,
      dripGroove:false, dripWidth:15, dripDepth:8, dripInset:25, drainPosition:66, ...input};
    for (const [key, values] of Object.entries(choices)) {
      if (!values.includes(state[key])) throw new Error('Onbekende waarde voor ' + names[key] + '.');
    }
    for (const key of ['drain', 'railing', 'upstand', 'dripGroove', 'facadeRebate']) {
      if (typeof state[key] !== 'boolean') throw new Error('Ongeldige keuze voor ' + names[key] + '.');
    }
    checkRange(state.length, 'Lengte (mm)', 400, 12000);
    checkRange(state.depth, 'Diepte (mm)', 400, 5000);
    checkRange(state.thickness, 'Plaatdikte aan gevel (mm)', 40, 500);
    checkRange(state.freeThickness, 'Plaatdikte aan vrije rand (mm)', 40, 500);
    checkRange(state.edgeWidth, 'Profielbreedte (mm)', 10, 1000);
    checkRange(state.edgeDrop, 'Profielverdikking (mm)', 1, 300);
    checkRange(state.drainPosition, 'HWA-positie (%)', 0, 100);
    checkRange(state.channelWidth, 'Gootbreedte (mm)', 1, 4000);
    checkRange(state.channelDepth, 'Gootdiepte (mm)', 1, 800);
    checkRange(state.channelInset, 'Afstand goot tot vrije rand (mm)', 0, 4000);
    checkRange(state.dripWidth, 'Waterholbreedte (mm)', 1, 4000);
    checkRange(state.dripDepth, 'Waterholdiepte (mm)', 1, 800);
    checkRange(state.dripInset, 'Afstand waterhol tot vrije rand (mm)', 0, 4000);
    checkRange(state.rebateWidth, 'Sponningbreedte (mm)', 1, 5000);
    checkRange(state.rebateDepth, 'Sponningdiepte (mm)', 1, 800);
    if (state.facadeRebate && state.rebateWidth >= state.depth - geometryTolerance) {
      throw new Error('De sponningbreedte moet kleiner zijn dan de plaatdiepte.');
    }
    if (state.facadeRebate && state.upstand) {
      throw new Error('De gevelopstand en gevelsponning bezetten dezelfde rand. Kies één van beide.');
    }
    if (state.edgeProfile !== 'none' && state.edgeWidth >= state.depth) {
      throw new Error('De profielbreedte moet kleiner zijn dan de plaatdiepte.');
    }
    if (state.thicknessMode === 'reference' &&
        (state.depth !== 2210 || state.slope !== 1 || state.upstand || state.edgeProfile !== 'none' ||
         state.channelProfile !== 'none' || state.dripGroove || state.facadeRebate)) {
      throw new Error('Het gemeten referentieprofiel heeft vaste randdetails, 2210 mm diepte en 1% afschot.');
    }
    checkRange(state.slope, 'Afschot (%)', 0, 5);
    const cutLimit = state.shape === 'rectangle' ? 1000 : Math.floor(Math.min(1000, state.depth * 0.45, state.length * 0.3));
    checkRange(state.cut, 'Contourmaat (mm)', 0, cutLimit);
    checkRange(state.density, 'Volumieke massa (kg/m³)', 1000, 3500);
    checkRange(state.upstandHeight, 'Opstandhoogte (mm)', 20, 500);
    checkRange(state.upstandWidth, 'Opstandbreedte (mm)', 20, 300);
    return state;
  }

  function outlineOf({shape, length, depth, cut}) {
    if (shape === 'chamfer' && cut > 0) {
      return [[0,0], [length,0], [length,depth], [cut,depth], [0,depth-cut]];
    }
    if (shape === 'trapezoid' && cut > 0) {
      return [[cut,0], [length-cut,0], [length,depth], [0,depth]];
    }
    return [[0,0], [length,0], [length,depth], [0,depth]];
  }

  function limitsAt(state, y) {
    const {shape, length, depth, cut} = state;
    if (shape === 'chamfer') return [Math.max(0, y - (depth-cut)), length];
    if (shape === 'trapezoid') {
      const inset = cut * (1 - y/depth);
      return [inset, length - inset];
    }
    return [0, length];
  }

  function planArea(ring) {
    let cross = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i];
      const [nextX, nextY] = ring[(i+1) % ring.length];
      cross += x * nextY - y * nextX;
    }
    return cross / 2;
  }

  // A–A crosses the centreline of the measured concrete body (#14918). Y runs
  // outwards and Z=0 is the extrapolated walking surface at the facade. These
  // y/z stations are in mm, converted from the manufacturer's local coordinates.
  const referenceTop = [[0,20.8], [45,20.8], [66.46465,-0.66465], [2210,-22.1]];
  const referenceBottom = [
    [0,-109.2], [2165.00025,-87.55], [2167.45683,-83.19509],
    [2172.45658,-83.14509], [2174.99975,-87.45], [2210,-87.1]
  ];
  const referenceFeatures = [
    {id:'facade-lip', startY:0, endY:66.46465},
    {id:'drip-groove', startY:2165.00025, endY:2174.99975}
  ];

  // IFC model context is 1e-7 m. Allow one last written coordinate digit
  // (1e-12 m) so rounding in the STEP file cannot collapse a retained interval.
  const geometryTolerance = 0.0001 + 1e-9; // mm

  function interpolate(points, y) {
    const index = points.findIndex(p => p[0] >= y);
    const b = points[index];
    if (y === b[0]) return b[1];
    const a = points[index-1];
    return a[1] + (b[1]-a[1]) * ((y-a[0])/(b[0]-a[0]));
  }

  function sectionBands(state, outline) {
    const {depth, thickness, freeThickness, slope, thicknessMode, edgeProfile, edgeSide, edgeWidth} = state;
    const measured = thicknessMode === 'reference';
    const stations = [0,depth];
    function addStation(y) {
      const existing = stations.find(other => Math.abs(other-y) <= geometryTolerance);
      if (existing !== undefined) return existing;
      stations.push(y);
      return y;
    }
    if (measured) {
      for (const [y] of [...referenceBottom,...referenceTop]) addStation(y);
    }
    for (const [,y] of outline) addStation(y);
    const upstandEnd = state.upstand ? addStation(state.upstandWidth) : 0;
    const rebateEnd = state.facadeRebate ? addStation(state.rebateWidth) : 0;
    const edgeEnd = edgeProfile === 'none' ? 0 : addStation(edgeSide === 'facade' ? edgeWidth : depth-edgeWidth);
    function groove(width, inset, label) {
      const outer = depth-inset, inner = outer-width;
      if (inner < -geometryTolerance) throw new Error(label + ' valt buiten de plaatdiepte.');
      return {inner:addStation(inner), centre:addStation(outer-width/2), outer:addStation(outer)};
    }
    const channel = state.channelProfile !== 'none' && groove(state.channelWidth,state.channelInset,'De langsgoot');
    const drip = state.dripGroove && groove(state.dripWidth,state.dripInset,'Het waterhol');
    if (channel && channel.inner < upstandEnd) throw new Error('De langsgoot overlapt de gevelopstand.');
    if (channel && channel.inner < rebateEnd) throw new Error('De langsgoot overlapt de gevelsponning.');
    // An adjacent rectangular channel and rebate can share one floor. Resolve
    // heights within the IFC context precision to avoid a zero-height face.
    const sharedFloor = channel && state.channelProfile === 'rect' && state.facadeRebate &&
      channel.inner === rebateEnd && Math.abs(state.channelDepth-state.rebateDepth) <= geometryTolerance;
    const channelDepth = sharedFloor ? state.rebateDepth : state.channelDepth;
    function vFraction(feature, y) {
      return y <= feature.centre ? (y-feature.inner)/(feature.centre-feature.inner) :
        (feature.outer-y)/(feature.outer-feature.centre);
    }
    stations.sort((a,b) => a-b);
    const bands = [];
    let channelCentreRow;
    for (let i = 1; i < stations.length; i++) {
      const y0 = stations[i-1], y1 = stations[i];
      const midpoint = (y0+y1)/2;
      const raised = midpoint < upstandEnd;
      const recessed = midpoint < rebateEnd;
      const edge = edgeProfile !== 'none' && (edgeSide === 'facade' ? midpoint < edgeEnd : midpoint > edgeEnd);
      const inChannel = channel && midpoint > channel.inner && midpoint < channel.outer;
      const inDrip = drip && midpoint > drip.inner && midpoint < drip.outer;
      // Profiles are evaluated separately on each side of a station. A step
      // has two genuine ordinates at its shoulder, which creates a vertical face.
      function sectionAt(y) {
        const [left,right] = limitsAt(state,y);
        if (measured) {
          return {y, left, right, top:interpolate(referenceTop,y), bottom:interpolate(referenceBottom,y),
            edgeDrop:0, upstand:0, channelCut:0, dripCut:0, rebateCut:0};
        }
        const base = thicknessMode === 'linear' ? thickness+(freeThickness-thickness)*y/depth : thickness;
        const walk = -slope*y/100;
        let edgeDrop = 0;
        if (edge) {
          const offset = edgeSide === 'facade' ? y : depth-y;
          edgeDrop = edgeProfile === 'step' ? state.edgeDrop : state.edgeDrop * Math.max(0, (edgeWidth-offset)/edgeWidth);
          if (edgeProfile === 'bevel' && y === edgeEnd) edgeDrop = 0;
        }
        const upstand = raised ? state.upstandHeight : 0;
        const rebateCut = recessed ? state.rebateDepth : 0;
        const channelCut = inChannel ? channelDepth*(state.channelProfile === 'rect' ? 1 : vFraction(channel,y)) : 0;
        const dripCut = inDrip ? state.dripDepth*vFraction(drip,y) : 0;
        return {y, left, right, top:walk+upstand-channelCut-rebateCut, bottom:walk-base-edgeDrop+dripCut,
          edgeDrop, upstand, channelCut, dripCut, rebateCut};
      }
      const a = sectionAt(y0), b = sectionAt(y1), previous = bands.at(-1)?.b ?? a;
      // Both adjacent vertical intervals must overlap at a step. Positive
      // thickness on each side alone can still give two disconnected solids.
      if (Math.min(a.top,previous.top)-Math.max(a.bottom,previous.bottom) <= geometryTolerance ||
          b.top-b.bottom <= geometryTolerance) {
        throw new Error('Bij de randdetails blijft geen doorlopende betondoorsnede over.');
      }
      if (channel && y0 === channel.centre) channelCentreRow = a;
      bands.push({a, b, edge, raised, recessed, inChannel, inDrip});
    }
    return {bands, channelCentreRow};
  }

  function footprint(bands) {
    if (!bands.length) return [];
    const rows = [bands[0].a, ...bands.map(band => band.b)];
    return [...rows.map(r => [r.right,r.y]), ...rows.reverse().map(r => [r.left,r.y])];
  }

  // Shared cuts on a longitudinal sidewall prevent T-junctions where a step
  // starts on the top or the soffit.
  function sideHeights(row, neighbour) {
    const levels = [row.bottom,row.top];
    if (neighbour) {
      for (const z of [neighbour.bottom,neighbour.top]) {
        if (z > row.bottom && z < row.top) levels.push(z);
      }
    }
    return levels.sort((a,b) => a-b);
  }

  function meshOf(bands) {
    const faces = [];
    const at = (row, side, z) => [row[side],row.y,z];
    const crossWall = (row, low, high, towardFacade) => {
      if (low === high) return;
      const face = [at(row,'left',low),at(row,'right',low),at(row,'right',high),at(row,'left',high)];
      faces.push(towardFacade ? face : face.reverse());
    };
    for (const [index, {a,b}] of bands.entries()) {
      const previous = bands[index-1]?.b;
      const next = bands[index+1]?.a;
      for (const surface of ['bottom','top']) {
        const face = [at(a,'left',a[surface]),at(a,'right',a[surface]),at(b,'right',b[surface]),at(b,'left',b[surface])];
        faces.push(surface === 'top' ? face : face.reverse());
      }
      for (const side of ['left','right']) {
        const near = sideHeights(a,previous).map(z => at(a,side,z));
        const far = sideHeights(b,next).map(z => at(b,side,z));
        // Follow the first vertical edge down to the bottom, then go across.
        // One planar face avoids sliver triangles between two nearby steps.
        const [start,end] = side === 'right' ? [near,far] : [far,near];
        faces.push([start[1],start[0],...end,...start.slice(2).reverse()]);
      }
      if (!previous) crossWall(a,a.bottom,a.top,true);
      else {
        crossWall(a,Math.min(a.top,previous.top),Math.max(a.top,previous.top),a.top > previous.top);
        crossWall(a,Math.min(a.bottom,previous.bottom),Math.max(a.bottom,previous.bottom),a.bottom < previous.bottom);
      }
      if (!next) crossWall(b,b.bottom,b.top,false);
    }
    return faces;
  }

  function sectionPolygon(bands) {
    const top = [], bottom = [];
    const append = (list, y, z) => {
      const last = list.at(-1);
      if (!last || last[0] !== y || last[1] !== z) list.push([y,z]);
    };
    for (const {a,b} of bands) {
      for (const row of [a,b]) {
        append(top,row.y,row.top);
        append(bottom,row.y,row.bottom);
      }
    }
    return [...top,...bottom.reverse()];
  }

  // Width and vertical thickness are both linear within a band. Their
  // product is quadratic, so this integral is exact also on tapered outlines.
  function integratedVolume(bands, height) {
    let cubicMm = 0;
    for (const {a,b} of bands) {
      const widthA = a.right-a.left, widthB = b.right-b.left;
      const heightA = height(a), heightB = height(b);
      cubicMm += (b.y-a.y)/6 * (widthA*(2*heightA+heightB) + widthB*(heightA+2*heightB));
    }
    return cubicMm/1e9;
  }

  function build(input) {
    const state = readState(input);
    const {depth,thickness,slope,thicknessMode} = state;
    const outline = outlineOf(state);
    const {bands, channelCentreRow} = sectionBands(state,outline);
    const near = bands[0].a, far = bands.at(-1).b;
    const volumeM3 = integratedVolume(bands,r => r.top-r.bottom);
    // Symbols reserve locations. The illustrative layouts do not select products.
    const channelBands = bands.filter(b => b.inChannel);
    const drainRow = channelCentreRow ?? far;
    const reservation = (row,fraction) => [row.left+fraction*(row.right-row.left), row.y, row.top];
    const reservations = {
      drain:state.drain ? reservation(drainRow,state.drainPosition/100) : null,
      railing:state.railing ? [0.1,0.5,0.9].map(fraction => reservation(far,fraction)) : []
    };
    let lowLipWarningMm = null;
    if (reservations.drain && channelBands.length) {
      const channelEnd = channelBands.at(-1).b;
      // The outer face of a rectangular groove rises to the adjacent walking surface.
      // A groove cut to the free edge ends at its actual floor without that rise.
      const lip = bands.find(band => band.a.y === channelEnd.y)?.a ?? channelEnd;
      const difference = reservations.drain[2] - lip.top;
      if (difference > geometryTolerance) lowLipWarningMm = difference;
    }
    const measured = thicknessMode === 'reference';
    return {
      state, outline, upstandOutline:footprint(bands.filter(b => b.raised)),
      rebateOutline:footprint(bands.filter(b => b.recessed)),
      edgeOutline:footprint(bands.filter(b => b.edge)), edgeAtFacade:[near.left,near.right],
      channelOutline:footprint(channelBands), dripOutline:footprint(bands.filter(b => b.inDrip)),
      sectionRing:sectionPolygon(bands),
      endThicknessMm:[near.top-near.bottom,far.top-far.bottom],
      baseThicknessMm:measured ? [109.2,65] : [thickness,thicknessMode === 'linear' ? state.freeThickness : thickness],
      referenceFeatures:measured ? referenceFeatures.map(feature => ({...feature})) : [],
      parts:[{id:'slab', faces:meshOf(bands)}], reservations, lowLipWarningMm,
      areaM2:planArea(outline)/1e6,
      upstandVolumeM3:integratedVolume(bands,r => r.upstand),
      rebateVolumeM3:integratedVolume(bands,r => r.rebateCut),
      edgeVolumeM3:integratedVolume(bands,r => r.edgeDrop),
      channelVolumeM3:integratedVolume(bands,r => r.channelCut), dripVolumeM3:integratedVolume(bands,r => r.dripCut),
      volumeM3, massKg:volumeM3*state.density, dropMm:slope*depth/100
    };
  }

  const api = Object.freeze({build});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PrecastModel = api;
})(globalThis);
