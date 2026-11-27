// Read back vector coordinates in the displayed SVG and the A4 sheet. Expected
// dimensions below are calculated independently of model.sectionRing and IFC.
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {chromium} = require('playwright');

function sectionReadback(points, depth) {
  const xs = points.map(([x]) => x);
  const near = Math.min(...xs), far = Math.max(...xs);
  const scale = (far-near)/depth;
  const endpoint = x => {
    const ys = points.filter(p => Math.abs(p[0]-x) < 0.0001).map(p => p[1]);
    return (Math.max(...ys) - Math.min(...ys))/scale;
  };
  const doubleArea = points.reduce((sum, p, i) => {
    const q = points[(i+1)%points.length];
    return sum + p[0]*q[1] - p[1]*q[0];
  },0);
  return {near:endpoint(near),far:endpoint(far),area:Math.abs(doubleArea)/(2*scale**2)};
}

async function main() {
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1420,height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    const set = (id, value) => page.locator('#'+id).fill(String(value));
    const select = (id, value) => page.locator('#'+id).selectOption(value);
    await page.locator('[data-view="section"]').click();
    async function verify(depth,near,far,area) {
      const whole = 'polygon[data-section="whole"]';
      const read = loc => loc.evaluate(el => Array.from(el.points, p => [p.x,p.y]));
      const screen = await read(page.locator('#section-view ' + whole));
      const printed = await read(page.locator('#print-sheet ' + whole));
      assert.deepEqual(printed, screen);
      const measured = sectionReadback(screen, depth);
      for (const [field,expected] of Object.entries({near,far,area})) {
        // getPoint() exposes the browser's float32 view of the double-precision SVG coordinates.
        const tolerance = field === 'area' ? 0.75 : 0.002;
        assert.ok(Math.abs(measured[field]-expected) < tolerance, field+' '+measured[field]+' vs '+expected);
      }
    }
    await verify(1600,180,180,288000);
    await select('thicknessMode','linear');
    await set('depth',2200);
    await set('thickness',110);
    await set('freeThickness',65);
    await set('slope',1);
    await verify(2200,110,65,192500);
    for (const shape of ['rectangle','chamfer','trapezoid']) {
      await select('shape',shape);
      for (const edge of ['step','bevel']) {
        await select('edgeProfile',edge);
        await set('edgeWidth',200);
        await set('edgeDrop',50);
        const addition = 200*50*(edge==='step'?1:.5);
        for (const side of ['facade','free']) {
          await select('edgeSide',side);
          await verify(2200, side==='facade'?160:110, side==='free'?115:65, 192500+addition);
          assert.match(await page.locator('#section-view').textContent(), /Profielbreedte 200 mm/);
          assert.match(await page.locator('#print-sheet').textContent(), /Verdieping onderzijde 50 mm/);
        }
      }
    }
    await page.check('#upstand');
    await verify(2200,210,115,205500); // 80 × 100 curb and 200 × 50 / 2 edge bevel.
    await select('thicknessMode','reference');
    await verify(2210,130,65,193632.7098316);
    const actual = await page.locator('#section-view').textContent();
    for (const label of ['Gevelneus','Waterhol','Vlakke kop 45 mm','66,46 mm','Breedte 10 mm · diepte 4,33 mm','Vanaf vrije rand 35 mm']) {
      assert.ok(actual.includes(label), label+' missing: '+actual);
    }
    for (const prefix of ['#section-view','#print-sheet']) {
      assert.equal(await page.locator(prefix+' polygon[data-section]').count(), 3);
    }
    await page.setViewportSize({width:320,height:760});
    const smallSection = await page.locator('#section-view').boundingBox();
    const smallLegend = await page.locator('#legend').boundingBox();
    assert.ok(smallSection.y + smallSection.height <= smallLegend.y + 1, 'Legenda overlapt de details op mobiel');
    await page.setViewportSize({width:1420,height:900});
    await page.emulateMedia({media:'print'});
    assert.ok(await page.locator('#print-sheet').isVisible());
    const pdf = await page.pdf({preferCSSPageSize:true, printBackground:true});
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g);
    assert.equal(pages?.length,1);
    assert.deepEqual(errors,[]);
    console.log('Edge: SVG-vlak en einddikten nagemeten in scherm- en printdoorsneden voor constant, lineair en 12 combinaties van rand en contour; referentieneus, waterhol en één A4 gecontroleerd.');
  } finally { await browser.close(); }
}

main().catch(error => {console.error(error);process.exitCode=1;});
