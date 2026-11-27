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
    const points = loc => loc.evaluate(el => Array.from(el.points, p => [p.x,p.y]));
    async function verify(depth,near,far,area) {
      const whole = 'polygon[data-section="whole"]';
      const screen = await points(page.locator('#section-view ' + whole));
      const printed = await points(page.locator('#print-sheet ' + whole));
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
    await page.check('#dripGroove');
    await set('drainPosition',25);
    for (const shape of ['rectangle','chamfer','trapezoid']) {
      await select('shape',shape);
      for (const channel of ['rect','v']) {
        await select('channelProfile',channel);
        await verify(2200,210,115,205500 - (channel==='rect'?1500:750) - 60);
        for (const prefix of ['#section-view','#print-sheet']) {
          for (const role of ['channel','drip','edge']) {
            const detail = await points(page.locator(prefix + ' polygon[data-section="'+role+'"]'));
            assert.ok(detail.length >= 4 && detail.every(p => p.every(Number.isFinite)), role);
          }
          assert.match(await page.locator(prefix).textContent(),/B × D 100 × 15 mm/);
          assert.match(await page.locator(prefix).textContent(),/B × D 15 × 8 mm/);
        }
        // Read the two plan strips and the HWA centre back in millimetres. The
        // plan's concrete polygon supplies an independent origin and drawing scale.
        const left = shape==='chamfer'?200:shape==='trapezoid'?300*(1-2100/2200):0;
        const right = shape==='trapezoid'?3200-left:3200;
        const expectedX = left+.25*(right-left);
        for (const prefix of ['#plan-view','#print-sheet figure:first-child']) {
          const contour = await points(page.locator(prefix+' polygon.pc-concrete').first());
          const x0 = Math.min(...contour.map(p=>p[0])), y0 = Math.min(...contour.map(p=>p[1]));
          const scale = (Math.max(...contour.map(p=>p[1]))-y0)/2200;
          for (const [role,inner,outer] of [['channel',2050,2150],['drip',2160,2175]]) {
            const coords = await points(page.locator(prefix+' [data-plan="'+role+'"]'));
            const ys = coords.map(p=>(p[1]-y0)/scale);
            assert.ok(Math.abs(Math.min(...ys)-inner)<.002 && Math.abs(Math.max(...ys)-outer)<.002, role);
          }
          const marker = await page.locator(prefix+' .pc-drain').evaluate(el=>[el.cx.baseVal.value,el.cy.baseVal.value]);
          assert.ok(Math.abs((marker[0]-x0)/scale-expectedX)<.002 && Math.abs((marker[1]-y0)/scale-2100)<.002);
        }
        assert.match(await page.locator('#print-sheet').textContent(),/Y 2.100, Z -36 mm/);
      }
    }
    await page.locator('[data-view="plan"]').click();
    assert.match(await page.locator('#legend').textContent(),/Langsgoot bovenzijde/);
    assert.match(await page.locator('#legend').textContent(),/Waterhol onderzijde/);
    assert.match(await page.locator('#legend').textContent(),/HWA-reservering/);
    await select('supplier','vebo');
    const drainagePdf = await page.pdf({preferCSSPageSize:true, printBackground:true});
    assert.equal(drainagePdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length,1, 'Afwateringsblad past op één liggend A4');
    await page.locator('[data-view="section"]').click();
    // Both groove centres fall within 0.0001 mm of the chamfer's section at
    // Y = 2000 mm. Read the cropped physical heights from the actual detail SVG.
    await select('shape','chamfer');
    await set('cut',200);
    await select('edgeProfile','none');
    await select('thicknessMode','constant');
    await set('thickness',180);
    await set('slope',0);
    await set('channelInset',149.99995);
    await set('dripWidth',16);
    await set('dripInset',191.99994);
    await verify(2200,280,180,2200*180+80*100-100*15/2-16*8/2);
    for (const prefix of ['#section-view','#print-sheet']) {
      for (const [role,span,expectedHeight] of [['channel',180,35],['drip',28.8,12.4]]) {
        const detail = await points(page.locator(prefix+' polygon[data-section="'+role+'"]'));
        const ranges = [0,1].map(axis=>{
          const coords = detail.map(p=>p[axis]);
          return Math.max(...coords)-Math.min(...coords);
        });
        const height = span*ranges[1]/ranges[0];
        assert.ok(Math.abs(height-expectedHeight)<.002, role+' physical height '+height);
      }
    }
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
    await page.emulateMedia({media:null});
    await select('thicknessMode','constant');
    await select('channelProfile','v');
    await set('slope',2);
    await set('channelWidth',300);
    await set('channelDepth',2);
    const warning = page.locator('#drain-warning');
    for (const supplier of ['generic','omg','vebo']) {
      await select('supplier',supplier);
      assert.match(await warning.innerText(), /buitenlip van de goot ligt 1 mm lager dan het HWA-punt/);
      assert.ok((await page.locator('#print-sheet').textContent()).includes(await warning.innerText()));
      assert.ok(await page.locator('#export-ifc').isEnabled());
      assert.ok(await page.locator('#save-project').isEnabled());
    }
    const warningSheet = await page.pdf({preferCSSPageSize:true, printBackground:true});
    assert.equal(warningSheet.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length,1, 'Waarschuwing past op het elementblad');
    await set('channelDepth',3);
    assert.equal(await warning.textContent(),'');
    assert.doesNotMatch(await page.locator('#print-sheet').textContent(),/lager dan het HWA-punt/);
    await set('channelDepth',2);
    await page.uncheck('#drain');
    assert.equal(await warning.textContent(),'');
    await page.check('#drain');
    await set('channelDepth',0);
    assert.equal(await warning.textContent(),'');
    assert.deepEqual(errors,[]);
    console.log('Edge: doorsneden, planstroken en HWA-positie nagemeten op scherm en A4 voor drie plattegronden, rechte en V-goten, waterhol, randen en referentiebalkon.');
  } finally { await browser.close(); }
}

main().catch(error => {console.error(error);process.exitCode=1;});
