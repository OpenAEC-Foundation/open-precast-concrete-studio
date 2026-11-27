const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const project = require('../src/project.js');

async function run() {
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const page = await browser.newPage();
    const field = id => page.locator('#' + id);
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await field('mark').fill('BEHOUD-MIJ');
    await field('new-project').click();
    assert.equal(await page.getByRole('radio').count(), 4);
    await field('cancel-element').click();
    assert.equal(await field('mark').inputValue(), 'BEHOUD-MIJ');
    await field('new-project').click();
    await page.keyboard.press('Escape');
    assert.equal(await field('new-element-dialog').isVisible(), false);
    assert.equal(await field('new-project').evaluate(el => el === document.activeElement), true);

    const identities = new Set();
    for (const [id, mark, volume] of [
      ['balcony','BP-01',.9216], ['gallery','GP-A01',1.0765296],
      ['rebate','BP-S01',.90048], ['hicon','BP-P01',.425991962], ['rebate','BP-S01',.90048]
    ]) {
      await field('new-project').click();
      await page.locator('#element-templates input[value="' + id + '"]').check();
      await field('create-element').click();
      assert.equal(await field('mark').inputValue(), mark);
      const saving = page.waitForEvent('download');
      await field('save-project').click();
      const file = await saving;
      assert.equal(file.suggestedFilename(), mark + '.opc.json');
      const record = project.decode(await fs.readFile(await file.path(), 'utf8'));
      assert.equal(record.state.mark, mark);
      assert.ok(Math.abs(project.validate(record.state).volumeM3 - volume) < 1e-9);
      assert.ok(!identities.has(record.identity));
      identities.add(record.identity);
      assert.equal(await field('export-ifc').isEnabled(), true);
    }
    await page.locator('#drafts summary').click();
    const saved = field('draft-list').getByRole('option').filter({hasText:'BEHOUD-MIJ'});
    await field('draft-list').selectOption(await saved.first().getAttribute('value'));
    await field('restore-draft').click();
    assert.equal(await field('mark').inputValue(), 'BEHOUD-MIJ');
    console.log('Four templates drawn and saved, unique IFC identities, cancel, Escape and previous drawing restored.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
