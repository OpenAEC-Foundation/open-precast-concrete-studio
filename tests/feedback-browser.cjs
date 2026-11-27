const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

const service = 'https://open-feedback-studio.pages.dev/api/feedback';
const issue = 'https://github.com/OpenAEC-Foundation/open-precast-concrete-studio/issues/123';

async function main() {
  const browser = await chromium.launch({channel:process.env.OPCS_BROWSER || 'msedge'});
  try {
    const context = await browser.newContext({serviceWorkers:'block', viewport:{width:1440,height:900}});
    const page = await context.newPage();
    const requests = [], errors = [];
    let finish;
    const release = new Promise(resolve => {finish = resolve;});
    // The page itself is a local file. All HTTP(S) is intercepted from the start.
    await context.route(/^https?:\/\//, async route => {
      const request = route.request();
      if (request.url() !== service) {
        errors.push('Unexpected external request: '+request.url());
        return route.abort();
      }
      const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST',
        'Access-Control-Allow-Headers':'Content-Type'};
      if (request.method()==='OPTIONS') return route.fulfill({status:204,headers});
      requests.push({method:request.method(), headers:request.headers(), payload:request.postDataJSON()});
      await release;
      await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({success:true,githubIssueUrl:issue})});
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); });
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    const el = id => page.locator('#'+id);
    const active = () => page.evaluate(() => document.activeElement.id);
    const configure = app => page.evaluate(id => {
      window.PrecastFeedbackConfig = {app:id, version:'1.2.3'};
    },app);
    const open = () => el('open-feedback').click();
    await el('mark').fill('PRIVE-PROJECT-TEST');
    await configure(null);
    await el('open-feedback').focus();
    await page.keyboard.press('Enter');
    assert.equal(await active(),'feedback-title');
    assert.ok(await el('feedback-registration').isVisible());
    assert.ok(await el('feedback-submit').isDisabled());
    await el('feedback-form').evaluate(form=>form.requestSubmit());
    assert.equal(requests.length,0);
    await page.keyboard.press('Escape');
    assert.equal(await active(),'open-feedback');
    assert.equal(await el('feedback-dialog').isVisible(),false);

    // Use a known registered example id only inside this network-isolated test context.
    await configure('open-frame-studio');
    await page.emulateMedia({forcedColors:'active'});
    await page.setViewportSize({width:320,height:670});
    await open();
    assert.ok(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches));
    assert.ok(await el('feedback-dialog').evaluate(d=>d.scrollWidth <= d.clientWidth+1));
    assert.match(await el('feedback-dialog').textContent(),/openbaar issue op GitHub/);
    assert.match(await el('feedback-dialog').textContent(),/e-mailadres komt niet in het issue/);
    assert.match(await el('feedback-name-note').innerText(),/kan bij de melding getoond worden/);
    await page.keyboard.press('Tab');
    assert.equal(await active(),'feedback-close');
    await page.keyboard.press('Tab');
    assert.equal(await active(),'feedback-category');
    await el('length').evaluate(node=>node.focus());
    assert.equal(await active(),'feedback-category');
    await page.emulateMedia({forcedColors:'none',colorScheme:'dark'});
    await page.setViewportSize({width:1440,height:900});
    await el('feedback-category').selectOption('feature');
    await el('feedback-message').fill('kort');
    assert.ok(await el('feedback-submit').isDisabled());
    assert.match(await el('feedback-state').innerText(),/10 tekens/);
    const message = 'Voeg een tweede detail aan het elementblad toe.';
    await el('feedback-message').fill(message);
    assert.equal(await el('feedback-counter').innerText(), message.length+' / 5.000');
    await el('feedback-email').fill('ongeldig');
    assert.ok(await el('feedback-submit').isDisabled());
    await el('feedback-email').fill('tester@example.invalid');
    await el('feedback-fullname').fill('Testpersoon');
    await el('feedback-sentiment').selectOption('Happy');
    await Promise.all([page.waitForRequest(r=>r.method()==='POST' && r.url()===service), el('feedback-submit').click()]);
    assert.ok(await el('feedback-submit').isDisabled());
    await el('feedback-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    finish();
    await el('feedback-receipt').waitFor();
    assert.equal(await active(),'feedback-thanks');
    assert.equal(requests.length,1);
    assert.equal(requests[0].method,'POST');
    assert.match(requests[0].headers['content-type'],/application\/json/);
    assert.deepEqual(requests[0].payload,{app:'open-frame-studio', appVersion:'1.2.3',category:'feature',message,
      email:'tester@example.invalid',fullname:'Testpersoon',sentiment:'Happy'});
    assert.equal(await el('feedback-issue').getAttribute('href'), issue);
    // Exercise the explicit desktop link without opening an external browser.
    await page.evaluate(() => { window.__TAURI__ = {core:{invoke:async(command,args)=>{
      window.requestedLink={command,args};
      throw new Error('Test');
    }}}; });
    await el('feedback-issue').click();
    assert.deepEqual(await page.evaluate(()=>window.requestedLink),{command:'open_feedback_issue',args:{url:issue}});
    assert.match(await el('feedback-link-error').innerText(),/mislukt/);
    await el('feedback-close').click();
    await open();
    assert.equal(await el('feedback-message').inputValue(),'');
    await el('feedback-message').fill(message);

    // Simulate HTTP failures in fetch itself, keeping browser-network diagnostics clean.
    const reply = (code,body) => page.evaluate(({code,body})=>{
      window.fetch = async () => {
        if (!code) throw new TypeError('Network failure');
        return new Response(JSON.stringify(body), {status:code});
      };
    },{code,body});
    for (const [code,expected] of [[400,/afgewezen/],[409,/al ontvangen/],[429,/uurlimiet/],
      [503,/mislukt/],[0,/Geen verbinding/]]) {
      await reply(code,{});
      await el('feedback-submit').click();
      assert.match(await el('feedback-state').innerText(),expected);
      assert.equal(await el('feedback-message').inputValue(),message);
      assert.ok(await el('feedback-submit').isEnabled());
    }
    for (const body of [{success:true,githubIssueUrl:'https://github.com.evil.invalid/issue'}, {success:true}]) {
      await reply(200,body);
      await el('feedback-message').fill(message);
      await el('feedback-submit').click();
      await el('feedback-receipt').waitFor();
      assert.ok(await el('feedback-issue').isHidden());
      assert.equal(await el('feedback-issue').getAttribute('href'),null);
      assert.match(await el('feedback-confirmation').innerText(),/makers zien je melding in hun overzicht/);
      await page.keyboard.press('Escape');
      await open();
    }
    await el('feedback-close').click();
    assert.equal(await el('mark').inputValue(),'PRIVE-PROJECT-TEST');
    assert.equal(requests.length,1);
    assert.deepEqual(errors,[]);
    console.log('Feedbackdialoog: toetsenbord, hoog contrast, privacy, registratie, validatie, ontvangst en foutafhandeling met onderschepte verzoeken geslaagd.');
  } finally { await browser.close(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
