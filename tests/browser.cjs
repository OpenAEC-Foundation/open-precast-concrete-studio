// Headless Edge exercises the same local file the user opens. No development server required.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const project = require('../src/project.js');

async function download(page, button, name) {
  const pending = page.waitForEvent('download');
  await page.locator('#' + button).click();
  const item = await pending;
  await item.saveAs(name);
  return fs.readFile(name,'utf8');
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'opcs-browser-'));
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
    const control = id => page.locator('#' + id);
    const url = pathToFileURL(path.resolve(__dirname,'../index.html')).href;
    await page.goto(url);
    assert.equal(await control('mass-value').innerText(), '2.258 kg');
    assert.ok(await page.locator('#iso-view polygon').count() >= 3);
    for (const view of ['plan','section','iso']) {
      await page.locator('[data-view="' + view + '"]').click();
      assert.equal(await control(view+'-view').isVisible(), true);
    }
    const camera = await control('iso-view').innerHTML();
    await control('iso-view').press('ArrowLeft');
    assert.notEqual(await control('iso-view').innerHTML(), camera);
    await control('iso-view').press('Home');
    await control('length').fill('');
    assert.equal(await control('save-project').isDisabled(),true);
    assert.equal(await control('export-ifc').isDisabled(),true);
    assert.equal(await control('print-drawing').isDisabled(),true);
    assert.equal(await control('area-value').innerText(),'—');
    await control('length').fill('10500');
    await control('depth').fill('3100');
    await control('supplier').selectOption('olbecon');
    assert.equal(await page.locator('#profile-checks [data-level=warning]').count(),2);
    await control('thickness').fill('300');
    assert.equal(await page.locator('#profile-checks [data-level=warning]').count(),3);
    await control('element-type').selectOption('gallery');
    assert.equal(await control('mark').inputValue(), 'GP-01');
    assert.equal(await page.locator('#profile-checks li').count(),0);

    // Reopen a genuine 0.1-format fixture through the native file input.
    const old = {schema:'open-precast-concrete-studio/concept-0.1', unit:'mm', name:'Galerij zuid',
      element:{type:'gallery',shape:'chamfer',contour:450,length:4600,depth:1800,thickness:200,
        support:'console',slopePercent:1.5,drain:true,railingProvision:true,wallUpstand:true,surfaceFinish:'waffle'}};
    await control('file-input').setInputFiles({name:'legacy.opc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('legacy.opc.json'));
    await control('mark').fill('GP-Z01');
    await control('storey').fill('02 Verdieping');
    await control('upstandHeight').fill('140');
    const jsonFile = path.join(dir,'GP-Z01.opc.json');
    const json = await download(page,'save-project',jsonFile);
    const saved = JSON.parse(json);
    const model = project.validate(saved.element);
    assert.equal(model.state.mark,'GP-Z01');
    assert.equal(model.state.finish,'waffle');
    assert.equal(model.dropMm,27);
    assert.ok(Math.abs(model.volumeM3-1.68727)<1e-8);
    assert.equal(await control('volume-value').innerText(),'1,687 m³');
    await page.reload();
    assert.equal(await control('mark').inputValue(),'GP-Z01');
    assert.equal(await control('upstandHeight').inputValue(),'140');
    const ifcFile = path.join(dir,'GP-Z01.ifc');
    const ifc = await download(page,'export-ifc',ifcFile);
    assert.match(ifc, /IFCSLAB\('/);
    assert.match(ifc, /GP-Z01/);
    const guid = text => text.match(/IFCSLAB\('([^']+)'/)[1];

    let printCalls = 0;
    await page.exposeFunction('capturePrint',()=>printCalls++);
    await page.evaluate(() => {window.print = () => window.capturePrint();});
    await control('print-drawing').click();
    assert.equal(printCalls,1);
    const pdfFile = path.join(dir,'GP-Z01.pdf');
    await page.emulateMedia({media:'print'});
    assert.ok(await control('print-sheet').isVisible());
    assert.equal(await page.locator('#print-sheet svg').count(),2);
    assert.match(await control('print-sheet').innerText(),/GP-Z01/);
    await page.pdf({path:pdfFile, preferCSSPageSize:true, printBackground:true});
    await page.emulateMedia({media:'screen'});

    page.once('dialog', dialog => dialog.accept());
    await control('new-project').click();
    const nextIfc = await download(page,'export-ifc',path.join(dir,'new.ifc'));
    assert.notEqual(guid(ifc),guid(nextIfc));
    await control('file-input').setInputFiles(jsonFile);
    await page.waitForFunction(() => document.getElementById('mark').value === 'GP-Z01');
    await control('length').fill('4520');
    const revised = await download(page,'export-ifc',path.join(dir,'revision.ifc'));
    assert.equal(guid(ifc),guid(revised));
    await control('file-input').setInputFiles({name:'incorrect.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"other"}')});
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Openen mislukt'));
    assert.equal(await control('mark').inputValue(),'GP-Z01');
    assert.equal(await control('length').inputValue(),'4520');
    // One independent hand calculation with a linear soffit and a stepped band.
    page.once('dialog', dialog => dialog.accept());
    await control('new-project').click();
    await control('element-type').selectOption('balcony');
    await control('mark').fill('BP-P01');
    await control('shape').selectOption('rectangle');
    await control('length').fill('2200');
    await control('depth').fill('2000');
    await control('thicknessMode').selectOption('linear');
    await control('thickness').fill('100');
    await control('freeThickness').fill('60');
    await control('upstand').uncheck();
    await control('edgeProfile').selectOption('step');
    await control('edgeWidth').fill('100');
    await control('edgeDrop').fill('40');
    assert.equal(await control('volume-value').innerText(),'0,361 m³'); // 0.352 + 0.0088
    await control('edgeProfile').selectOption('bevel');
    assert.equal(await control('volume-value').innerText(),'0,356 m³'); // 0.352 + 0.0044
    await control('edgeSide').selectOption('facade');
    assert.equal(await control('end-values').innerText(),'140,0 / 60,0 mm');
    await control('edgeWidth').fill('0');
    assert.equal(await control('export-ifc').isEnabled(),false);
    // The active reference uses its measured geometry while the manual edit is parked.
    await control('thicknessMode').selectOption('reference');
    await control('drain').uncheck();
    await control('railing').uncheck();
    assert.equal(await control('depth').inputValue(),'2210');
    assert.equal(await control('depth').isDisabled(),true);
    assert.equal(await control('end-values').innerText(),'130,0 / 65,0 mm');
    assert.equal(await control('volume-value').innerText(),'0,426 m³');
    await page.locator('[data-view="section"]').click();
    const profileFile = path.join(dir,'BP-P01.opc.json');
    const referenceState = JSON.parse(await download(page,'save-project',profileFile));
    assert.equal(referenceState.element.thicknessMode,'reference');
    assert.equal(referenceState.manualProfile,undefined);
    await page.reload();
    assert.equal(await control('volume-value').innerText(),'0,426 m³');
    await control('thicknessMode').selectOption('linear');
    assert.equal(await control('depth').isEditable(),true);
    for (const [id,value] of Object.entries({depth:'2000',slope:'1.5',thickness:'100',freeThickness:'60',
      edgeProfile:'bevel',edgeSide:'facade',edgeWidth:'0',edgeDrop:'40'})) {
      assert.equal(await control(id).inputValue(),value,id);
    }
    assert.equal(await control('export-ifc').isEnabled(),false);
    assert.equal(await control('drain').isChecked(),false);
    await control('edgeWidth').fill('130');
    await control('upstand').check();
    await control('upstandWidth').fill('90');
    await control('upstandHeight').fill('135');
    await control('slope').fill('2.25');
    const customVolume = await control('volume-value').innerText();
    await control('thicknessMode').selectOption('reference');
    await control('storey').fill('03');
    await page.reload();
    await control('thicknessMode').selectOption('constant');
    assert.equal(await control('thicknessMode').inputValue(),'constant');
    assert.equal(await control('upstand').isChecked(),true);
    for (const [id,value] of Object.entries({upstandWidth:'90',upstandHeight:'135',depth:'2000',
      thickness:'100',freeThickness:'60',edgeWidth:'130',edgeDrop:'40',slope:'2.25',storey:'03'})) {
      assert.equal(await control(id).inputValue(),value,id);
    }
    await control('thicknessMode').selectOption('linear');
    assert.equal(await control('volume-value').innerText(),customVolume);
    await control('thicknessMode').selectOption('reference');
    // An imported reference carries only its own profile, even if the same GUID was open.
    await control('file-input').setInputFiles(profileFile);
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Geopend'));
    assert.equal(await control('end-values').innerText(),'130,0 / 65,0 mm');
    await control('thicknessMode').selectOption('linear');
    assert.equal(await control('depth').inputValue(),'2210');
    assert.equal(await control('edgeProfile').inputValue(),'none');
    assert.equal(await control('upstand').isChecked(),false);
    await control('file-input').setInputFiles(profileFile);
    await page.waitForFunction(() => document.getElementById('thicknessMode').value === 'reference');
    if (process.argv.includes('--profile-example')) {
      const exampleDir = path.resolve(__dirname,'../examples');
      await download(page,'export-ifc',path.join(exampleDir,'BP-P01.ifc'));
      await fs.copyFile(profileFile,path.join(exampleDir,'BP-P01.opc.json'));
      await page.pdf({path:path.join(exampleDir,'BP-P01.pdf'),preferCSSPageSize:true,printBackground:true});
    }
    for (const width of [1024,768,390,320]) {
      await page.setViewportSize({width,height:780});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontale overflow bij ' + width);
      assert.equal(await control('save-project').isVisible(),true);
    }
    // The native dialog distinguishes a cancelled save from a failed write.
    await page.evaluate(() => {
      window.__TAURI__ = {core:{invoke:async () => false}};
    });
    await control('save-project').click();
    assert.equal(await control('status').innerText(), 'Opslaan geannuleerd');
    await page.evaluate(() => {
      window.__TAURI__.core.invoke = async () => { throw 'Schijf vol'; };
    });
    await control('export-ifc').click();
    assert.equal(await control('status').innerText(), 'IFC-export mislukt. Schijf vol');
    assert.equal(await control('mark').inputValue(), 'BP-P01');
    assert.deepEqual(errors,[]);
    if (process.argv.includes('--examples')) {
      const target = path.resolve(__dirname,'../examples');
      await fs.mkdir(target,{recursive:true});
      for (const file of [jsonFile,ifcFile,pdfFile]) await fs.copyFile(file,path.join(target,path.basename(file)));
    }
    console.log('Edge lokaal: weergaven, validatie, profielen, oude en nieuwe JSON, herstel, download, elementblad, IFC-identiteit en vier schermbreedtes OK.');
  } finally {
    await browser.close();
    await fs.rm(dir,{recursive:true,force:true});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
