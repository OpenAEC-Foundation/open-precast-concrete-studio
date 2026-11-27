const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

async function main() {
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1440, height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const scale = page.locator('#view-scale');
    const plus = page.getByRole('button', {name:'Inzoomen', exact:true});
    const minus = page.getByRole('button', {name:'Uitzoomen', exact:true});
    const fit = page.getByRole('button', {name:'Tekening passend maken'});
    const box = svg => svg.evaluate(el => {
      const b = el.viewBox.baseVal;
      return [b.x, b.y, b.width, b.height];
    });
    const full = [0,0,760,440];
    const near = (a, b) => assert.ok(Math.abs(a - b) < .002, a + ' differs from ' + b);

    for (const view of ['iso','plan','section']) {
      await page.locator('[data-view="' + view + '"]').click();
      const svg = page.locator('#' + view + '-view');
      assert.deepEqual(await box(svg), full);
      const geometry = svg.locator(view === 'iso' ? '.pc-mesh-face' : view === 'plan' ? '.pc-concrete' : '[data-section="whole"]').first();
      const before = await geometry.boundingBox();
      await plus.click();
      assert.equal(await scale.textContent(), '125%');
      near((await geometry.boundingBox()).width / before.width, 1.25);
      near((await box(svg))[2], 608);
      await minus.click();
      assert.equal(await scale.textContent(), '100%');
      await page.locator('[data-view="' + view + '"]').press('=');
      assert.equal(await scale.textContent(), '125%');
      const saved = await box(svg);
      await page.locator('#length').fill(view === 'plan' ? '3710' : '3700');
      assert.deepEqual(await box(svg), saved, 'Changing the slab must keep the camera');
      await svg.press(view === 'iso' ? 'Shift+ArrowRight' : 'ArrowRight');
      assert.ok((await box(svg))[0] > saved[0]);
      await svg.press('f');
      assert.deepEqual(await box(svg), full);
      await svg.press('-');
      assert.equal(await scale.textContent(), '80%');
      await fit.click();
    }

    await page.locator('[data-view="iso"]').click();
    const iso = page.locator('#iso-view');
    const screen = await iso.boundingBox();
    const x = Math.round(screen.x + .57 * screen.width);
    const y = Math.round(screen.y + .46 * screen.height);
    const cursor = () => iso.evaluate((el, [x,y]) => {
      const p = new DOMPoint(x,y).matrixTransform(el.getScreenCTM().inverse());
      return [p.x,p.y];
    }, [x,y]);
    const anchor = await cursor();
    await page.mouse.move(x,y);
    await page.mouse.wheel(0,-120);
    await page.waitForFunction(() => document.querySelector('#view-scale').value !== '100%');
    const after = await cursor();
    near(after[0], anchor[0]);
    near(after[1], anchor[1]);
    const zoomed = await box(iso);
    const mesh = iso.locator('.pc-mesh-face').first();
    const face = await mesh.getAttribute('points');
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(x+40,y+22,{steps:4});
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const shifted = await box(iso);
    assert.ok(shifted[0] < zoomed[0] && shifted[1] < zoomed[1]);
    assert.equal(await mesh.getAttribute('points'), face, 'panning must keep the 3D orientation');
    await page.locator('[data-view="plan"]').click();
    const plan = page.locator('#plan-view');
    assert.deepEqual(await box(plan), full);
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x-32,y+16);
    await page.mouse.up();
    const pannedPlan = await box(plan);
    assert.ok(pannedPlan[0] > 0 && pannedPlan[1] < 0);
    await page.locator('[data-view="iso"]').click();
    assert.deepEqual(await box(iso), shifted);
    const paper = await page.locator('#print-sheet svg').evaluateAll(figures => figures.map(svg => svg.getAttribute('viewBox')));
    assert.deepEqual(paper, [full.join(' '),full.join(' ')]);
    for (let i=0; i<12 && await plus.isEnabled(); i++) await plus.click();
    assert.equal(await scale.textContent(), '400%');
    assert.ok(await plus.isDisabled());
    for (let i=0; i<15 && await minus.isEnabled(); i++) await minus.click();
    assert.equal(await scale.textContent(), '50%');
    assert.ok(await minus.isDisabled());
    await page.locator('#length').fill('');
    await page.waitForFunction(() => document.querySelector('#view-scale').value === '—');
    for (const button of [plus,minus,fit]) assert.ok(await button.isDisabled());
    await page.locator('#length').fill('3200');
    await fit.click();
    assert.deepEqual(await box(iso), full);

    // The view survives a cancelled command, while new and imported files open in full.
    await plus.click();
    await page.locator('#new-project').click();
    await page.locator('#cancel-element').click();
    assert.equal(await scale.textContent(), '125%');
    await page.locator('#new-project').click();
    await page.locator('#create-element').click();
    assert.deepEqual(await box(iso), full);
    assert.deepEqual(await box(plan), full);
    await plus.click();
    await page.locator('#file-input').setInputFiles(path.resolve(__dirname,'../examples/GP-A01.opc.json'));
    await page.getByText('Geopend · GP-A01.opc.json', {exact:true}).waitFor();
    assert.deepEqual(await box(iso), full);

    for (const width of [320,620,768,1024,1440]) {
      await page.setViewportSize({width,height:850});
      const header = await page.locator('.topbar button').evaluateAll(buttons => buttons.map(button => {
        const box = button.getBoundingClientRect();
        return {left:box.left, right:box.right, top:box.top, bottom:box.bottom, name:button.id};
      }));
      for (const [index,button] of header.entries()) {
        assert.ok(button.left >= 0 && button.right <= width + 1, button.name + ' outside window at ' + width);
        for (const other of header.slice(index+1)) {
          assert.ok(button.right <= other.left + 1 || other.right <= button.left + 1 ||
            button.bottom <= other.top + 1 || other.bottom <= button.top + 1, button.name + ' overlaps ' + other.name);
        }
      }
      const left = await page.locator('.view-switch').boundingBox();
      const right = await page.locator('.viewport-tools').boundingBox();
      assert.ok(left.x >= 0 && right.x + right.width <= width + 1, 'toolbar overflow at ' + width);
      assert.ok(left.x + left.width <= right.x + 1 || left.y + left.height <= right.y + 1, 'overlapping commands at ' + width);
      const svg = await iso.boundingBox();
      const legend = await page.locator('#legend').boundingBox();
      assert.ok(svg.width >= 280 && svg.height >= 180 && svg.y + svg.height <= legend.y + 1, 'drawing space at ' + width);
    }
    await page.emulateMedia({forcedColors:'active'});
    await page.locator('#zoom-in').click();
    assert.equal(await scale.textContent(), '125%');
    assert.deepEqual(errors, []);
    console.log('Edge: drie aanzichten, zoom op cursor, verschuiven, toetsenbord, beeldgeheugen, afdruk en vijf vensterbreedtes getoetst.');
  } finally {
    await browser.close();
  }
}

main().catch(error => {console.error(error); process.exitCode=1;});
