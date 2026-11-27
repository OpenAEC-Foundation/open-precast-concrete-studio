const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const project = require('../src/project.js');

// A sight ray hits a triangle at barycentric coordinates (u, v).
// The largest depth along that ray is the visible concrete surface.
function depthAt(face, x, y) {
  const a = face[0];
  for (let i = 1; i < face.length - 1; i++) {
    const b = face[i], c = face[i+1];
    const det = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    if (Math.abs(det) < 1e-10) continue;
    const u = ((x-a[0])*(c[1]-a[1]) - (y-a[1])*(c[0]-a[0]))/det;
    const v = ((b[0]-a[0])*(y-a[1]) - (b[1]-a[1])*(x-a[0]))/det;
    if (u >= -1e-9 && v >= -1e-9 && u+v <= 1+1e-9) {
      return a[2] + u*(b[2]-a[2]) + v*(c[2]-a[2]);
    }
  }
  return -Infinity;
}

async function check(svg, model, yaw, pitch) {
  const rendered = await svg.evaluate(node => ({
    faces:Array.from(node.querySelectorAll('polygon.pc-mesh-face'), polygon =>
      Array.from(polygon.points, p => [p.x,p.y])),
    markers:Array.from(node.querySelectorAll('circle'), c => [c.cx.baseVal.value,c.cy.baseVal.value])
  }));
  const projectPoint = ([x,y,z]) => {
    const horizontal = x*Math.sin(yaw) + y*Math.cos(yaw);
    return [x*Math.cos(yaw) - y*Math.sin(yaw), horizontal*Math.sin(pitch) - z*Math.cos(pitch),
      horizontal*Math.cos(pitch) + z*Math.sin(pitch)];
  };
  const projected = model.parts.flatMap(part => part.faces.map(face => face.map(projectPoint)));
  function bounds(faces, axis) {
    const values = faces.flat().map(p => p[axis]);
    return [Math.min(...values), Math.max(...values)];
  }
  const [xmin,xmax] = bounds(projected, 0), [ymin] = bounds(projected, 1);
  const [left,right] = bounds(rendered.faces, 0), [top,bottom] = bounds(rendered.faces, 1);
  const scale = (right-left)/(xmax-xmin);
  const screen = ([x,y,z]) => [left+(x-xmin)*scale, top+(y-ymin)*scale, z];
  const geometry = projected.map(face => face.map(screen));
  // Match the actual SVG polygons to their 3D vertices. DOM order is SVG paint order.
  const painted = rendered.faces.map(polygon => {
    const face = geometry.find(f => f.length === polygon.length &&
      polygon.every(([x,y], i) => Math.hypot(x-f[i][0], y-f[i][1]) < .001));
    assert.ok(face, 'Unexpected face in the rendered SVG');
    return face;
  });
  let overlap = 0;
  for (let y = top+.37; y < bottom; y += 5) {
    for (let x = left+.43; x < right; x += 5) {
      const hits = painted.map(face => depthAt(face,x,y)).filter(Number.isFinite);
      const nearest = Math.max(...geometry.map(face => depthAt(face,x,y)));
      if (!Number.isFinite(nearest)) continue;
      assert.ok(hits.length, 'Missing surface in the rendered SVG');
      assert.ok(Math.abs(nearest-hits.at(-1)) < .001,
        `${model.state.shape} yaw ${yaw.toFixed(2)}, pitch ${pitch.toFixed(2)}: at (${x.toFixed(2)}, ${y.toFixed(2)}) the foreground is ${(nearest-hits.at(-1)).toFixed(3)} mm behind the surface`);
      if (hits.length > 1) overlap++;
    }
  }
  const markers = [...model.reservations.railing, model.reservations.drain].filter(Boolean);
  const visible = markers.map(p => screen(projectPoint(p))).filter(([x,y,z]) =>
    pitch > 0 && geometry.every(face => depthAt(face,x,y) <= z+.01));
  assert.equal(rendered.markers.length, visible.length, 'Reservation visibility');
  for (const [x,y] of visible) {
    assert.ok(rendered.markers.some(([mx,my]) => Math.hypot(mx-x,my-y) < .001), 'Reservation position');
  }
  return overlap;
}

async function main() {
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const svg = page.locator('#iso-view');
    const gallery = project.decode(JSON.stringify(require('../examples/GP-A01.opc.json'))).state;
    const scenarios = [
      {...project.defaults, edgeProfile:'step', edgeSide:'free', edgeWidth:200, edgeDrop:100,
        channelProfile:'rect', channelWidth:100, channelDepth:45, channelInset:20},
      {...gallery, shape:'chamfer',length:3500,depth:2400,cut:1000,
        channelWidth:200,channelDepth:50,channelInset:80},
      {...gallery, shape:'trapezoid',channelProfile:'v',upstand:true,edgeProfile:'bevel',edgeSide:'facade'},
      {...project.defaults,depth:1800,thicknessMode:'linear',freeThickness:120,
        edgeProfile:'bevel',edgeSide:'facade',edgeWidth:500,edgeDrop:60,
        facadeRebate:true,rebateWidth:120,rebateDepth:30},
      project.decode(JSON.stringify(require('../examples/BP-P01.opc.json'))).state
    ];
    let overlaps = 0;
    for (const state of scenarios) {
      const model = project.validate(state);
      const name = state.shape + '-' + state.thicknessMode + '.opc.json';
      const file = project.encode(state, 'be18901c-0426-4c0c-9fa9-32da4f5481f5', '');
      await page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(file)});
      await page.getByText('Geopend · '+name, {exact:true}).waitFor();
      for (const [right,down] of [[0,0],[9,0],[17,5],[27,0]]) {
        await svg.press('Home');
        for (let i = 0; i < right; i++) await svg.press('ArrowRight');
        for (let i = 0; i < down; i++) await svg.press('ArrowDown');
        overlaps += await check(svg, model, .52+right*.15, .49-down*.15);
      }
    }
    assert.ok(overlaps > 100, 'The rays must exercise overlapping surfaces');
    console.log('Edge: 20 views of five slab models checked by sight ray, including '+overlaps+' overlapping face samples and reservation visibility.');
  } finally { await browser.close(); }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
