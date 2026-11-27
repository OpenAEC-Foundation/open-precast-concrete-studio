const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

async function main() {
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const field = id => page.locator('#'+id);
    const click = id => field(id).click();
    const value = id => field(id).inputValue();
    const undo = () => click('undo-edit'), redo = () => click('redo-edit');
    const shortcut = async keys => {
      await field('iso-view').focus();
      await page.keyboard.press(keys);
    };
    const draft = () => page.evaluate(() => JSON.parse(PrecastDrafts.entries()
      .find(entry => entry.key === PrecastDrafts.current()).content));
    async function download(button) {
      const started = page.waitForEvent('download');
      await click(button);
      return fs.readFile(await (await started).path(),'utf8');
    }
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    assert.ok(await field('undo-edit').isDisabled());
    assert.ok(await field('redo-edit').isDisabled());
    const initial = await draft();
    const ifcId = text => text.match(/IFCSLAB\('([^']+)'/)[1];
    const slabId = ifcId(await download('export-ifc'));

    await field('length').focus();
    await field('length').press('Control+a');
    await field('length').pressSequentially('4590');
    const volume = await field('volume-value').textContent();
    await undo();
    assert.equal(await value('length'),'3200');
    assert.ok(await field('undo-edit').isDisabled());
    await shortcut('Control+y');
    assert.equal(await value('length'),'4590');
    assert.equal(await field('volume-value').textContent(),volume);
    assert.equal((await draft()).element.length,4590);
    assert.equal(ifcId(await download('export-ifc')),slabId);

    await field('depth').fill('');
    assert.ok(await field('export-ifc').isDisabled());
    await undo();
    assert.equal(await value('depth'),'1600');
    assert.equal(await field('volume-value').textContent(),volume);
    await shortcut('Control+Shift+z');
    assert.equal(await value('depth'),'');
    assert.equal((await draft()).unfinished.depth,'');
    assert.equal((await draft()).identity,initial.identity);
    await undo();
    await field('facadeRebate').check();
    assert.ok(await field('redo-edit').isDisabled(),'Een andere wijziging sluit de vorige reeks af');

    await field('rebateDepth').fill('25');
    await field('thicknessMode').selectOption('reference');
    assert.equal(await field('facadeRebate').isChecked(),false);
    await shortcut('Control+z');
    assert.equal(await field('facadeRebate').isChecked(),true);
    assert.equal(await value('rebateDepth'),'25');
    await redo();
    assert.equal((await draft()).manualProfile.rebateDepth,'25');
    await field('thicknessMode').selectOption('linear');
    assert.equal(await value('rebateDepth'),'25');
    assert.equal(await field('facadeRebate').isChecked(),true);
    await field('mark').focus();
    await field('mark').press('End');
    await field('mark').pressSequentially('-TEKST');
    await field('mark').evaluate(el => el.addEventListener('input',event => {
      el.dataset.undoInputType = event.inputType;
    },{once:true}));
    await field('mark').press('Control+z');
    assert.equal(await field('mark').getAttribute('data-undo-input-type'),'historyUndo','Tekstinvoer behoudt lokaal ongedaan maken');
    assert.notEqual(await value('mark'),'BP-01-TEKST');
    assert.equal(await value('thicknessMode'),'linear');
    await field('mark').fill('GETEST');
    const file = await download('save-project');
    assert.equal(JSON.parse(file).identity,initial.identity);

    await click('new-project');
    await click('cancel-element');
    assert.ok(await field('undo-edit').isEnabled());
    await click('new-project');
    await click('create-element');
    assert.ok(await field('undo-edit').isDisabled());
    assert.ok(await field('redo-edit').isDisabled());
    assert.notEqual((await draft()).identity,initial.identity);
    await field('length').fill('5000');
    await field('file-input').setInputFiles({name:'heropen.opc.json',mimeType:'application/json',buffer:Buffer.from(file)});
    await page.getByText('Geopend · heropen.opc.json',{exact:true}).waitFor();
    assert.equal(await value('mark'),'GETEST');
    assert.ok(await field('undo-edit').isDisabled());
    await field('mark').fill('ANDER');
    await page.locator('#drafts summary').click();
    const other = field('draft-list').getByRole('option').filter({hasText:'BP-01 · 5000 mm'});
    await field('draft-list').selectOption(await other.first().getAttribute('value'));
    await click('restore-draft');
    assert.equal(await value('length'),'5000');
    assert.ok(await field('undo-edit').isDisabled());
    assert.ok(await field('redo-edit').isDisabled());
    assert.deepEqual(errors,[]);
    console.log('Edge: undo en redo per veld, tekstinvoer, sneltoetsen, herstel van onvolledige ontwerpen en Hi-Con, werkversies en IFC-identiteit gecontroleerd.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
