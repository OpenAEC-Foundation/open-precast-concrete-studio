const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function checkDrafts(browser, url, directory) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const field = id => page.locator('#' + id);
    const example = path.resolve(__dirname,'../examples/GP-A01.opc.json');
    async function importFile(filename) {
      await field('file-input').setInputFiles(filename);
      await page.getByText('Geopend · ' + path.basename(filename),{exact:true}).waitFor();
    }
    async function choose(mark, length) {
      if (!await field('draft-list').isVisible()) await page.locator('#drafts summary').click();
      const option = field('draft-list').getByRole('option').filter({hasText:mark + ' · ' + length + ' mm'});
      const key = await option.first().getAttribute('value');
      await field('draft-list').selectOption(key);
    }
    async function copy(filename) {
      const completed = page.waitForEvent('download');
      await field('export-draft').click();
      await (await completed).saveAs(filename);
      return fs.readFile(filename,'utf8');
    }
    await page.goto(url);
    const initial = await page.evaluate(() => JSON.parse(PrecastDrafts.entries()[0].content).identity);
    await page.reload();
    assert.equal(await page.evaluate(() => JSON.parse(PrecastDrafts.entries()[0].content).identity),initial);
    await field('mark').fill('BP-ONGESLAGEN');
    await field('length').fill('4980');
    await importFile(example);
    const count = await page.evaluate(() => PrecastDrafts.entries().length);
    await importFile(example);
    assert.equal(await page.evaluate(() => PrecastDrafts.entries().length),count);
    await page.reload();
    await choose('BP-ONGESLAGEN',4980);
    await field('restore-draft').click();
    assert.equal(await field('length').inputValue(),'4980');
    await field('depth').fill('');
    await page.reload();
    assert.equal(await field('depth').inputValue(),'');
    assert.ok(await field('export-ifc').isDisabled());
    page.once('dialog',dialog=>dialog.accept());
    await field('new-project').click();
    await choose('BP-ONGESLAGEN',4980);
    const filename = path.join(directory,'onvolledige-kopie.opc.json');
    assert.equal(JSON.parse(await copy(filename)).unfinished.depth,'');
    await importFile(filename);
    assert.equal(await field('depth').inputValue(),'');
    assert.equal(await field('length').inputValue(),'4980');
    await field('depth').fill('1600');

    const second = await context.newPage();
    await second.goto(url);
    await Promise.all([field('length').fill('5110'),second.locator('#length').fill('5330')]);
    await page.reload();
    await second.reload();
    assert.equal(await field('length').inputValue(),'5110');
    assert.equal(await second.locator('#length').inputValue(),'5330');
    await second.close();

    // Both previously released clients save to this key. Simulate the result of an edit in either.
    const oldKey = 'openaec.precast.design.v2';
    const oldFile = JSON.parse(await fs.readFile(example,'utf8'));
    oldFile.element.mark = 'OUD-NA-DOWNGRADE';
    const oldContent = JSON.stringify(oldFile);
    await page.evaluate(([key,content])=>localStorage.setItem(key,content),[oldKey,oldContent]);
    await page.reload();
    assert.equal(await field('length').inputValue(),'5110');
    await choose('OUD-NA-DOWNGRADE',3600);
    await field('restore-draft').click();
    assert.equal(await field('mark').inputValue(),'OUD-NA-DOWNGRADE');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),oldKey),oldContent);

    const unknown = JSON.stringify({...oldFile,schema:'future',element:{...oldFile.element,mark:'ONBEKEND'}});
    await page.evaluate(([key,content])=>{
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(key,content);
    },[oldKey,unknown]);
    await page.reload();
    assert.match(await field('status').innerText(),/kon niet worden geopend/);
    await field('mark').fill('NIEUW-NA-HERSTEL');
    await choose('ONBEKEND',3600);
    await field('restore-draft').click();
    assert.equal(await field('mark').inputValue(),'NIEUW-NA-HERSTEL');
    assert.equal(await copy(path.join(directory,'origineel.opc.json')),unknown);

    // No space for migration or autosave. The old raw file is still accessible.
    await page.evaluate(([key,content])=>{
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(key,content);
    },[oldKey,oldContent]);
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key,value) {
        if (this === localStorage) throw new DOMException('Vol','QuotaExceededError');
        return setItem.call(this,key,value);
      };
    });
    await page.reload();
    assert.equal(await field('mark').inputValue(),'OUD-NA-DOWNGRADE');
    await field('length').fill('5880');
    await field('file-input').setInputFiles(example);
    await page.getByText(/Bewaar je huidige ontwerp met Opslaan/).waitFor();
    assert.equal(await field('length').inputValue(),'5880');
    const offered = page.waitForEvent('download');
    await field('save-project').click();
    await (await offered).cancel();
    page.once('dialog',dialog=>dialog.dismiss());
    await field('file-input').setInputFiles(example);
    await page.getByText(/Bewaar je huidige ontwerp met Opslaan/).waitFor();
    assert.equal(await field('length').inputValue(),'5880');
    await choose('OUD-NA-DOWNGRADE',3600);
    assert.equal(await copy(path.join(directory,'volle-opslag.opc.json')),oldContent);
    await field('depth').fill('');
    assert.ok(await field('save-project').isEnabled());
    assert.ok(await field('export-ifc').isDisabled());
    const recoveryFile = path.join(directory,'onvolledige-quota.opc.json');
    const recovery = page.waitForEvent('download');
    await field('save-project').click();
    await (await recovery).saveAs(recoveryFile);
    const savedRecovery = JSON.parse(await fs.readFile(recoveryFile,'utf8'));
    assert.equal(savedRecovery.unfinished.depth,'');
    page.once('dialog',dialog=>dialog.accept());
    await field('file-input').setInputFiles(example);
    await page.waitForFunction(()=>document.getElementById('mark').value === 'GP-A01');
    await field('file-input').setInputFiles(recoveryFile);
    await page.waitForFunction(()=>document.getElementById('mark').value === 'OUD-NA-DOWNGRADE');
    assert.equal(await field('length').inputValue(),'5880');
    assert.equal(await field('depth').inputValue(),'');
    assert.ok(await field('export-ifc').isDisabled());
  } finally { await context.close(); }
};
