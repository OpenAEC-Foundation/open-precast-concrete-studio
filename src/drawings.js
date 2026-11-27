/* Plan, section and orthographic 3D projections of the precast element. */
(function () {
  'use strict';

  const number = (value, digits = 2) => value.toLocaleString('nl-NL', { maximumFractionDigits: digits });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const supportNames = { isokorf: 'Koudebrugonderbreking', console: 'Console', columns: 'Kolom', steel: 'Staaloplegging', nokken: 'Nokken / stekken' };
  const finishNames = { 'anti-slip': 'Antislipstructuur', smooth: 'Glad', waffle: 'Wafelprofiel', blasted: 'Gezandstraald' };
  const contourNames = { rectangle: 'Rechthoek', chamfer: 'Afgeschuinde hoek', trapezoid: 'Trapezium' };
  const point = ([x, y]) => x.toFixed(6) + ',' + y.toFixed(6);
  const referenceDisplay = state => state.thicknessMode === 'reference';
  const polygon = (vertices, css, extra = '') =>
    '<polygon points="' + vertices.map(point).join(' ') + '" class="' + css + '" ' + extra + '/>';
  const line = (a, b, css) => '<path d="M' + point(a) + 'L' + point(b) + '" class="' + css + '"/>';
  const label = (x, y, text, css = 'pc-tag', anchor = 'middle') =>
    '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" class="' + css + '">' + escape(text) + '</text>';
  const circle = ([x, y], r, css) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" class="' + css + '"/>';

  // The same factor on both axes preserves real angles, including the slope in section.
  function fit(points, box) {
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const xMin = Math.min(...xs), yMin = Math.min(...ys);
    const width = Math.max(...xs) - xMin, height = Math.max(...ys) - yMin;
    const k = Math.min(box.w / (width || 1), box.h / (height || 1));
    const dx = box.x + (box.w - width * k) / 2 - k * xMin;
    const dy = box.y + (box.h - height * k) / 2 - k * yMin;
    return ([x, y]) => [dx + x * k, dy + y * k];
  }

  function dimension(a, b, offset, caption) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (!length) return '';
    const ux = dx / length, uy = dy / length, nx = -uy, ny = ux;
    const shift = (p, distance) => [p[0] + nx * distance, p[1] + ny * distance];
    const start = shift(a, offset), end = shift(b, offset);
    const mark = p => line([p[0] - 3 * (ux + nx), p[1] - 3 * (uy + ny)],
      [p[0] + 3 * (ux + nx), p[1] + 3 * (uy + ny)], 'pc-dim');
    const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    // Vertical labels read from the right of the drawing sheet.
    const angle = Math.abs(dx) < 0.001 ? -90 : Math.atan2(dy, dx) * 180 / Math.PI;
    const sign = offset > 0 ? 1 : -1;
    return line(shift(a, sign * 4), shift(a, offset + sign * 6), 'pc-extension') +
      line(shift(b, sign * 4), shift(b, offset + sign * 6), 'pc-extension') +
      line(start, end, 'pc-dim') + mark(start) + mark(end) +
      '<g transform="translate(' + point(mid) + ') rotate(' + angle + ')">' +
      label(0, -6, caption, 'pc-dim-label') + '</g>';
  }

  function finishPattern(prefix, finish) {
    const id = prefix + '-finish';
    const tile = {
      'anti-slip': '<circle cx="2" cy="2" r=".8"/>',
      waffle: '<path d="M0 9V0H9" fill="none" stroke="currentColor" stroke-width=".7"/>',
      blasted: '<circle cx="2" cy="2" r=".6"/><circle cx="6" cy="6" r=".8"/>'
    }[finish];
    return tile ? '<defs><pattern class="pc-texture" id="' + id + '" width="9" height="9" patternUnits="userSpaceOnUse">' + tile + '</pattern></defs>' : '';
  }

  function plan(state, model, prefix) {
    const map = fit(model.outline, { x: 117, y: 90, w: 555, h: 265 });
    const { length, depth } = state;
    const slope = referenceDisplay(state) ? 1 : state.slope;
    const ll = map([0, 0]), right = map([length, 0]), front = map([0, depth]);
    const free = map([length, depth]);
    const [leftX, rightX] = model.edgeAtFacade;
    const wallLeft = map([leftX, 0]), wallRight = map([rightX, 0]);
    const sectionX = map([length / 2, 0])[0];
    const frontStartX = state.shape === 'chamfer' ? state.cut : 0;
    const contour = model.outline.map(map);
    const def = finishPattern(prefix, state.finish);
    let drawing = def + polygon(contour, 'pc-concrete');
    if (def) drawing += polygon(contour, 'pc-surface', 'fill="url(#' + prefix + '-finish)"');
    if (model.upstandOutline?.length) drawing += polygon(model.upstandOutline.map(map), 'pc-curb');
    if (model.edgeOutline?.length) drawing += polygon(model.edgeOutline.map(map), 'pc-hidden-edge');
    if (referenceDisplay(state)) {
      for (const feature of model.referenceFeatures) {
        const y = feature.id === 'facade-lip' ? feature.endY : (feature.startY + feature.endY)/2;
        const crossings = [];
        model.outline.forEach((p,i) => {
          const q = model.outline[(i+1) % model.outline.length];
          if (y > Math.min(p[1], q[1]) && y < Math.max(p[1], q[1])) {
            const t = (y-p[1])/(q[1]-p[1]);
            crossings.push(p[0]+t*(q[0]-p[0]));
          }
        });
        if (crossings.length === 2) drawing += line(map([crossings[0],y]),map([crossings[1],y]),
          feature.id === 'facade-lip' ? 'pc-edge-detail' : 'pc-hidden-edge');
      }
    }
    drawing += line(wallLeft, wallRight, 'pc-facade') +
      label((wallLeft[0] + wallRight[0]) / 2, wallLeft[1] - 41, 'Gevelzijde · ' + supportNames[state.support]);
    if (state.railing) {
      drawing += line(map([frontStartX, depth]), free, 'pc-rail');
      for (const pos of model.reservations.railing) drawing += circle(map(pos), 3, 'pc-socket');
    }
    if (model.reservations.drain) {
      const [x, y] = map(model.reservations.drain);
      drawing += circle([x, y], 6, 'pc-drain') + line([x - 4, y], [x + 4, y], 'pc-cross') +
        line([x, y - 4], [x, y + 4], 'pc-cross');
    }
    drawing += line([sectionX, ll[1] - 15], [sectionX, front[1] + 12], 'pc-cut') +
      label(sectionX + 8, ll[1] - 15, 'A', 'pc-tag', 'start') +
      label(sectionX + 8, front[1] + 16, 'A', 'pc-tag', 'start');
    drawing += dimension(front, free, 42, number(length)) +
      dimension(ll, front, 35, number(depth));
    if (slope > 0) {
      const sx = right[0] + 20, sy = (ll[1] + front[1]) / 2;
      drawing += line([sx, sy - 10], [sx, sy + 12], 'pc-flow') +
        line([sx - 4, sy + 6], [sx, sy + 12], 'pc-flow') +
        line([sx + 4, sy + 6], [sx, sy + 12], 'pc-flow') +
        label(sx + 8, sy + 3, number(slope, 2) + '%', 'pc-tag', 'start');
    }
    if (state.shape === 'chamfer' && state.cut > 0 && map([state.cut, 0])[0] - ll[0] >= 36) {
      const corner = map([state.cut / 2, depth - state.cut / 2]);
      const end = [corner[0] - 11, corner[1] + 11];
      drawing += line(corner, end, 'pc-extension') + label(end[0], end[1] + 14, number(state.cut) + ' × ' + number(state.cut), 'pc-tag');
    }
    return drawing;
  }

  const edgeNames = {step: 'Rechte verdikking', bevel: 'Verlopende verdikking'};
  const sideNames = {facade: 'gevelzijde', free: 'vrije rand'};

  // Intersect the section polygon with a vertical half-plane for the local detail.
  // A synthetic cut at the edge of this window is shown as a dashed break line.
  function clipAt(loop, axis, boundary, keepLower) {
    const inside = p => keepLower ? p[axis] <= boundary : p[axis] >= boundary;
    const result = [];
    for (let index = 0; index < loop.length; index++) {
      const a = loop[index], b = loop[(index + 1) % loop.length];
      if (inside(a)) result.push(a);
      if (inside(a) !== inside(b) && a[axis] !== boundary && b[axis] !== boundary) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        const intersection = [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])];
        intersection[axis] = boundary;
        result.push(intersection);
      }
    }
    return result;
  }

  function concreteSection(loop, map, hatch, role) {
    const contour = loop.map(map);
    return polygon(contour, 'pc-concrete', 'data-section="' + role + '"') +
      polygon(contour, 'pc-surface', 'fill="url(#' + hatch + ')"');
  }

  function sectionEnd(loop, station) {
    const values = loop.filter(p => Math.abs(p[0] - station) < 1e-7).map(p => p[1]);
    return {top:[station, Math.min(...values)], bottom:[station, Math.max(...values)]};
  }

  // Section-space Y points down on the sheet. Both axes use one scale per view.
  function section(state, model, prefix) {
    const loop = model.sectionRing.map(([y,z]) => [y,-z]);
    const reference = state.thicknessMode === 'reference';
    const profiled = state.edgeProfile !== 'none' && Boolean(state.edgeProfile);
    const detailed = reference || profiled;
    const map = fit(loop, detailed ? {x:110,y:59,w:540,h:118} : {x:110,y:120,w:540,h:170});
    const near = sectionEnd(loop,0), far = sectionEnd(loop,state.depth);
    const deepest = Math.max(...loop.map(p => p[1]));
    const hatch = prefix + '-hatch';
    let drawing = '<defs><pattern id="' + hatch + '" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M-3 3l6 -6 M0 12l12 -12 M9 15l6 -6" class="pc-hatch"/></pattern></defs>' +
      concreteSection(loop, map, hatch, 'whole');
    drawing += dimension(map(near.top), map(near.bottom), 38, number(model.endThicknessMm[0])) +
      dimension(map(far.top), map(far.bottom), -52, number(model.endThicknessMm[1])) +
      dimension(map([0, deepest]), map([state.depth, deepest]), 28, number(state.depth));
    const a = map(near.top), b = map(far.top);
    drawing += label(a[0], a[1] - 14, 'Gevelzijde', 'pc-tag', 'start') +
      label(b[0], b[1] - 14, 'Vrije rand', 'pc-tag', 'end');
    const fall = 'Loopvlak ' + number(reference ? 1 : state.slope) + '% · verval ' + number(model.dropMm) + ' mm';
    drawing += label(380, detailed ? 23 : 56, fall);

    if (reference) drawing += referenceDetails(state, model, loop, hatch);
    else if (profiled) drawing += edgeDetail(state, model, loop, hatch);
    return drawing;
  }

  function referenceDetails(state, model, loop, hatch) {
    const [lip, groove] = model.referenceFeatures;
    const lipBox = clipAt(loop, 0, lip.endY + 22, true);
    const lipTop = Math.min(...lipBox.map(p => p[1]));
    const lipLoop = clipAt(lipBox,1,lipTop + 36,true);
    const lipMap = fit(lipLoop, {x:74,y:278,w:262,h:90});
    const grooveSpan = groove.endY - groove.startY;
    const grooveBox = clipAt(clipAt(loop, 0, groove.startY - grooveSpan, false), 0, groove.endY + grooveSpan, true);
    const grooveFloor = Math.max(...grooveBox.map(p => p[1]));
    const grooveLoop = clipAt(grooveBox, 1, grooveFloor - 12, false);
    const grooveMap = fit(grooveLoop, {x:423,y:278,w:252,h:90});
    const lipCrest = lipBox.filter(p => Math.abs(p[1]-lipTop)<1e-5);
    const crestWidth = Math.max(...lipCrest.map(p=>p[0])) - Math.min(...lipCrest.map(p=>p[0]));
    const startBottom = sectionEnd(loop, groove.startY).bottom[1];
    const endBottom = sectionEnd(loop, groove.endY).bottom[1];
    const floorAt = y => startBottom + (endBottom - startBottom) * (y-groove.startY)/grooveSpan;
    const grooveDepth = Math.max(...grooveLoop
      .filter(([y,zDown]) => y >= groove.startY && y <= groove.endY && zDown > grooveFloor - 12 + .01)
      .map(([y,zDown]) => floorAt(y) - zDown));
    let drawing = line([52,236],[708,236],'pc-extension');
    drawing += label(199,260,'Gevelneus', 'pc-tag') + concreteSection(lipLoop, lipMap, hatch, 'facade-detail') +
      label(200,393,'Vlakke kop ' + number(crestWidth) + ' mm', 'pc-tag') +
      label(200,416,'Overgang tot Y ' + number(lip.endY) + ' mm', 'pc-tag');
    drawing += label(550,260,'Waterhol aan onderzijde', 'pc-tag') + concreteSection(grooveLoop, grooveMap, hatch, 'groove-detail') +
      label(550,393,'Breedte ' + number(grooveSpan) + ' mm · diepte ' + number(grooveDepth) + ' mm', 'pc-tag') +
      label(550,416,'Vanaf vrije rand ' + number(state.depth - groove.endY) + ' mm', 'pc-tag');
    return drawing;
  }

  function edgeDetail(state, model, loop, hatch) {
    const facade = state.edgeSide === 'facade';
    const station = facade ? 0 : state.depth;
    const index = facade ? 0 : 1;
    const span = Math.min(state.depth, state.edgeWidth + Math.max(state.edgeWidth * .25, 50));
    const boundary = facade ? span : state.depth - span;
    const detailLoop = clipAt(loop, 0, boundary, facade);
    const map = fit(detailLoop, {x:90,y:282,w:260,h:95});
    const end = sectionEnd(detailLoop, station), cut = sectionEnd(detailLoop,boundary);
    let drawing = line([59,239],[701,239],'pc-extension') +
      label(61,264,'Randdetail · ' + sideNames[state.edgeSide], 'pc-tag', 'start') +
      concreteSection(detailLoop, map, hatch, 'edge') +
      dimension(map(end.top), map(end.bottom), facade ? 22 : -24, number(model.endThicknessMm[index]));
    if (span < state.depth) drawing += line(map(cut.top),map(cut.bottom),'pc-detail-break');
    const nominal = y => {
      const [nearT, farT] = model.baseThicknessMm;
      return state.slope*y/100 + nearT + (farT-nearT)*y/state.depth;
    };
    const start = facade ? state.edgeWidth : state.depth-state.edgeWidth;
    drawing += line(map([station,nominal(station)]),map([start,nominal(start)]),'pc-hidden-edge') +
      label(402,298,edgeNames[state.edgeProfile], 'pc-tag', 'start') +
      label(402,324,'Profielbreedte ' + number(state.edgeWidth) + ' mm', 'pc-tag', 'start') +
      label(402,350,'Verdieping onderzijde ' + number(state.edgeDrop) + ' mm', 'pc-tag', 'start') +
      label(402,376,'Basisdikte aan rand ' + number(model.baseThicknessMm[index]) + ' mm', 'pc-tag', 'start');
    return drawing;
  }

  const camera = { yaw: 0.52, pitch: 0.49 };
  let activeModel;
  const clampPitch = angle => Math.max(-1.35, Math.min(1.35, angle));

  function coversPoint(face, point3) {
    // Convex faces can be split about their first vertex. Interpolate the depth
    // in each projected triangle so a reservation behind the upstand stays hidden.
    const [x, y, depth] = point3;
    const a = face[0];
    for (let i = 1; i + 1 < face.length; i++) {
      const b = face[i], c = face[i + 1];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-8) continue;
      const u = ((x-a[0]) * (c[1]-a[1]) - (y-a[1]) * (c[0]-a[0])) / area;
      const v = ((b[0]-a[0]) * (y-a[1]) - (b[1]-a[1]) * (x-a[0])) / area;
      if (u >= -1e-8 && v >= -1e-8 && u+v <= 1+1e-8 && a[2] + u*(b[2]-a[2]) + v*(c[2]-a[2]) > depth + .01) return true;
    }
    return false;
  }

  function draw3D() {
    if (!activeModel) return;
    const cosYaw = Math.cos(camera.yaw), sinYaw = Math.sin(camera.yaw);
    const cosPitch = Math.cos(camera.pitch), sinPitch = Math.sin(camera.pitch);
    const project = ([x, y, z]) => {
      const depth = x * sinYaw + y * cosYaw;
      return [x * cosYaw - y * sinYaw, depth * sinPitch - z * cosPitch, depth * cosPitch + z * sinPitch];
    };
    const faces = activeModel.parts.flatMap(part => part.faces.map(vertices => {
      const projected = vertices.map(project);
      const meanDepth = projected.reduce((sum, p) => sum + p[2], 0) / vertices.length;
      // A normal from the polygon as a whole also handles collinear first edges.
      const normal = [0, 0, 0];
      vertices.forEach((a, i) => {
        const b = vertices[(i + 1) % vertices.length];
        normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
        normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
        normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
      });
      const magnitude = Math.hypot(...normal);
      const light = (normal[2] - normal[0] * 0.5 + normal[1] * 0.2) / (magnitude || 1);
      const facing = normal[0] * cosPitch * sinYaw + normal[1] * cosPitch * cosYaw + normal[2] * sinPitch;
      return { vertices, projected, meanDepth, light, facing, normal: normal.map(c => c / magnitude) };
    }));
    const map = fit(faces.flatMap(f => f.projected), { x: 75, y: 73, w: 610, h: 312 });
    const edgeKey = (a, b) => [a.join(','), b.join(',')].sort().join('|');
    const normalsByEdge = new Map();
    for (const face of faces) {
      face.vertices.forEach((a, i) => {
        const key = edgeKey(a, face.vertices[(i + 1) % face.vertices.length]);
        if (!normalsByEdge.has(key)) normalsByEdge.set(key, []);
        normalsByEdge.get(key).push(face.normal);
      });
    }
    const visible = faces.filter(f => f.facing > 1e-8).sort((a, b) => a.meanDepth - b.meanDepth);
    const solids = visible.map(f => {
      const light = 27 + 40 * (1 - f.light) / 2;
      const corners = f.projected.map(map);
      let faceDrawing = polygon(corners, 'pc-mesh-face', 'style="--pc-shade:' + light.toFixed(1) + '%"');
      f.vertices.forEach((a, i) => {
        const j = (i + 1) % corners.length;
        const normals = normalsByEdge.get(edgeKey(a, f.vertices[j]));
        const coplanar = normals.length === 2 && normals[0].every((v, k) => Math.abs(v - normals[1][k]) < 1e-8);
        if (!coplanar) faceDrawing += line(corners[i], corners[j], 'pc-mesh-edge');
      });
      return faceDrawing;
    });
    const reservations = activeModel.reservations;
    if (camera.pitch > 0) {
      const marker = (at, css, radius) => {
        const p = project(at);
        if (!visible.some(face => coversPoint(face.projected, p))) solids.push(circle(map(p), radius, css));
      };
      for (const at of reservations.railing) marker(at, 'pc-socket', 3);
      if (reservations.drain) marker(reservations.drain, 'pc-drain', 5);
    }
    document.getElementById('iso-view').innerHTML = '<title>Betonlichaam in 3D</title>' + solids.join('');
  }

  function enableOrbit(svg) {
    if (svg.dataset.orbitReady) return;
    svg.dataset.orbitReady = 'true';
    let drag;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      camera.yaw += (event.clientX - drag.x) * 0.012;
      camera.pitch = clampPitch(camera.pitch + (event.clientY - drag.y) * 0.012);
      drag.x = event.clientX;
      drag.y = event.clientY;
      draw3D();
    });
    svg.addEventListener('lostpointercapture', () => { drag = null; });
    svg.addEventListener('keydown', event => {
      switch (event.key) {
        case 'ArrowLeft': camera.yaw -= 0.15; break;
        case 'ArrowRight': camera.yaw += 0.15; break;
        case 'ArrowUp': camera.pitch = clampPitch(camera.pitch + 0.15); break;
        case 'ArrowDown': camera.pitch = clampPitch(camera.pitch - 0.15); break;
        case 'Home': camera.yaw = 0.52; camera.pitch = 0.49; break;
        default: return;
      }
      event.preventDefault();
      draw3D();
    });
  }

  const typeName = state => state['element-type'] === 'gallery' ? 'Galerijplaat' : 'Balkonplaat';
  function legend(state, view) {
    if (view === 'iso') return '<span>Slepen of pijltjestoetsen om te draaien · Home voor beginstand</span>';
    if (view === 'section') return '<span>A–A · X = ' + number(state.length / 2, 1) + ' mm</span><span>Y = 0 aan gevel · Z = 0 op doorgetrokken loopvlak aan gevel</span>' +
      (referenceDisplay(state) || state.edgeProfile && state.edgeProfile !== 'none' ? '<span>Randdetails afzonderlijk vergroot</span>' : '');
    let items = '<span><i class="pc-key facade"></i>Gevelrand</span>';
    if (referenceDisplay(state) || state.edgeProfile && state.edgeProfile !== 'none') items += '<span><i class="pc-key underside"></i>Profiel onderzijde</span>';
    if (state.drain) items += '<span><i class="pc-key drain"></i>HWA-reservering</span>';
    if (state.railing) items += '<span><i class="pc-key railing"></i>Hekwerkreservering</span>';
    return items;
  }

  function sheet(state, model, planDrawing, sectionDrawing) {
    const row = (name, value) => '<div><dt>' + escape(name) + '</dt><dd>' + escape(value) + '</dd></div>';
    const figure = (title, content, notes) =>
      '<figure><figcaption>' + escape(title) + '</figcaption><svg viewBox="0 0 760 440" class="pc-drawing" role="img" aria-label="' +
      escape(title) + '">' + content + '</svg><small>' + escape(notes) + '</small></figure>';
    const name = typeName(state);
    const defaultMark = state['element-type'] === 'gallery' ? 'GP-01' : 'BP-01';
    const supplier = { generic: 'Generiek', olbecon: 'Olbecon', vebo: 'Vebo' }[state.supplier] ?? state.supplier ?? 'Generiek';
    const contour = contourNames[state.shape] + (state.shape === 'chamfer' ? ' · ' + number(state.cut) + ' × ' + number(state.cut) + ' mm' :
      state.shape === 'trapezoid' ? ' · inspringing ' + number(state.cut) + ' mm per zijde' : '');
    const fields = [
      ['Lengte × diepte', [state.length, state.depth].map(n => number(n)).join(' × ') + ' mm'],
      ['Contour', contour], ['Gevelopstand (b × h)', state.upstand ? number(state.upstandWidth) + ' × ' + number(state.upstandHeight) + ' mm' : 'Geen'],
      ['Afwerking loopvlak', finishNames[state.finish]], ['Oplegprincipe', supportNames[state.support]], ['Producentprofiel', supplier],
      ['Oppervlak in plan', number(model.areaM2, 3) + ' m²'], ['Betonvolume', number(model.volumeM3, 4) + ' m³'],
      ['Indicatieve massa', number(model.massKg, 1) + ' kg bij ' + number(state.density) + ' kg/m³']
    ];
    const reference = referenceDisplay(state);
    const modeLabel = reference ? 'Hi-Con-referentiedoorsnede' : state.thicknessMode === 'linear' ? 'Lineair' : 'Constant';
    const base = model.baseThicknessMm;
    const thicknessText = reference ? modeLabel : modeLabel + ' · ' + number(base[0]) + ' / ' + number(base[1]) + ' mm';
    let edgeText = 'Geen';
    if (reference) edgeText = 'Gevelneus en waterhol';
    else if (state.edgeProfile && state.edgeProfile !== 'none') {
      edgeText = edgeNames[state.edgeProfile] + ' · ' + sideNames[state.edgeSide] + ' · ' + number(state.edgeWidth) + ' × ' + number(state.edgeDrop) + ' mm';
    }
    fields.push([reference ? 'Dikteverloop' : 'Basisdikte gevel / vrij', thicknessText], ['Randdetail', edgeText],
      ['Totale dikte gevel / vrij', model.endThicknessMm.map(n=>number(n)).join(' / ') + ' mm']);
    const reservations = [state.drain ? 'cirkel met kruis = HWA' : '', state.railing ? 'cirkels op vrije rand = hekwerk' : ''].filter(Boolean).join(' · ');
    const cm = model.reservations;
    const positions = [];
    if (cm.drain) positions.push('HWA op X ' + number(cm.drain[0], 1));
    if (cm.railing.length) positions.push('Hekwerk op X ' + cm.railing.map(p => number(p[0], 1)).join(' / '));
    const positionNote = positions.length ? '<p class="pc-print-detail"><strong>Reserveringen vrije rand</strong> · ' + positions.join(' · ') +
      ' mm · Y ' + number(state.depth) + ' mm. X vanaf linker buitenmaat, Y vanaf gevel.</p>' : '';
    let profileNote = '';
    if (state.supplier && state.supplier !== 'generic') {
      const profile = window.PrecastProfiles.assess(state, model);
      profileNote = '<p class="pc-print-detail"><strong>Profiel ' + escape(supplier) + '</strong> · ' +
        escape(profile.caption) + ' ' + profile.checks.map(c => escape(c.text)).join(' · ') + '</p>';
    }
    return '<header><div><p>Open Precast Concrete Studio</p><h1>' + escape(state.mark || defaultMark) + ' · ' + name +
      '</h1></div><div><strong>Concept-elementtekening</strong><p>' + escape(state.storey || 'Bouwlaag onbekend') +
      ' · maten in mm</p></div></header><div class="pc-sheet-figures">' +
      figure('Bovenaanzicht', planDrawing, reservations ? 'Reserveringen · ' + reservations : 'A–A geeft de plaats van de doorsnede aan.') +
      figure('Doorsnede A–A', sectionDrawing, 'X = ' + number(state.length / 2, 1) + ' mm vanaf links. Y = 0 aan gevel. Z = 0 op het doorgetrokken loopvlak aan de gevel.') +
      '</div><dl>' + fields.map(([key, value]) => row(key, value)).join('') +
      '</dl>' + positionNote + profileNote + '<footer><strong>Open voor engineering</strong> · wapening, opleg- en ankerdetails, hijspunten en posities van de instortdelen.</footer>';
  }

  function render(state, model, view = 'plan') {
    const planSvg = document.getElementById('plan-view');
    const sectionSvg = document.getElementById('section-view');
    const isoSvg = document.getElementById('iso-view');
    const planDrawing = plan(state, model, 'pc-plan');
    const sectionDrawing = section(state, model, 'pc-section');
    for (const [key, svg] of [['plan', planSvg], ['section', sectionSvg], ['iso', isoSvg]]) {
      svg.classList.add('pc-drawing');
      svg.setAttribute('viewBox', '0 0 760 440');
      svg.toggleAttribute('hidden', key !== view);
    }
    planSvg.innerHTML = planDrawing;
    sectionSvg.innerHTML = sectionDrawing;
    activeModel = model;
    enableOrbit(isoSvg);
    if (view === 'iso') draw3D();
    const key = document.getElementById('legend');
    key.hidden = false;
    key.innerHTML = legend(state, view);
    document.getElementById('print-sheet').innerHTML = sheet(state, model,
      planDrawing.replaceAll('pc-plan-finish', 'pc-paper-finish'), sectionDrawing.replaceAll('pc-section-hatch', 'pc-paper-hatch'));
  }

  window.PrecastDrawings = Object.freeze({ render });
})();
