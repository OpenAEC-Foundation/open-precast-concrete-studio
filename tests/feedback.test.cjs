const {test} = require('node:test');
const assert = require('node:assert/strict');
const feedback = require('../src/feedback.js');
require('../src/feedback-config.js');

// An existing service identifier is used exclusively with injected request doubles.
const config = {app:'open-frame-studio', version:'unit-test'};
const message = {category:'feature', message:'Een suggestie voor de goot.'};

test('client validates the service field limits and optional contact details', () => {
  for (const [fields, expected] of [
    [{message:' 123456789 '},'tooShort'], [{message:'1234567890'},null],
    [{message:'x'.repeat(5000)},null], [{message:'x'.repeat(5001)},'tooLong'],
    [{email:' a+b@voorbeeld.nl '},null], [{email:'a@b'},'email'], [{email:'a@@b.nl'},'email'],
    [{category:'other'},'category'], [{sentiment:'unknown'},'sentiment'], [{fullname:'x'.repeat(201)},'fullname']
  ]) assert.equal(feedback.validate({...message,...fields}),expected);
  assert.equal(feedback.validate(null),'invalid');
});

test('only explicitly entered fields and application identity are transmitted', async () => {
  const form = {...message,category:'general',message:'  Een vraag over mijn plaat.  ',email:' help@voorbeeld.nl ',
    fullname:' A. Bouwer ',sentiment:'Neutral',path:'local.opc.json',mark:'BP-01',login:'account',project:{private:true}};
  const result = await feedback.send(form,config,async (url,init) => {
    assert.equal(url,'https://open-feedback-studio.pages.dev/api/feedback');
    assert.equal(init.method,'POST');
    assert.equal(init.headers['Content-Type'],'application/json');
    assert.equal(init.credentials,'omit');
    assert.equal(init.referrerPolicy,'no-referrer');
    assert.equal(init.redirect,'error');
    assert.deepEqual(JSON.parse(init.body),{app:config.app,appVersion:config.version,category:'general',
      message:'Een vraag over mijn plaat.',email:'help@voorbeeld.nl',fullname:'A. Bouwer',sentiment:'Neutral'});
    return Response.json({success:true});
  });
  assert.deepEqual(result,{ok:true,issueUrl:null});
  assert.deepEqual(Object.keys(feedback.buildPayload({...message,email:'  ',fullname:' ',sentiment:''},config)).sort(),
    ['app','appVersion','category','message']);
});

test('only an acknowledged success may display a returned HTTPS GitHub link', async () => {
  const url = 'https://github.com/OpenAEC-Foundation/open-frame-studio/issues/10';
  for (const [value,expected] of [[url,url],[null,null],['https://example.com/a',null],
    ['https://github.com.example.com/1',null],['https://github.com@other.example/a',null],['javascript:alert(0)',null]]) {
    const result = await feedback.send(message,config,async () => Response.json({success:true,githubIssueUrl:value}));
    assert.deepEqual(result,{ok:true,issueUrl:expected});
  }
  assert.deepEqual(await feedback.send(message,config,async () => Response.json({success:false})),{ok:false,reason:'failed'});
  assert.deepEqual(await feedback.send(message,config,async () => new Response('not JSON')),{ok:false,reason:'failed'});
});

test('HTTP failures, offline delivery and unregistered apps return distinct results', async () => {
  for (const [status,reason] of [[400,'rejected'],[409,'duplicate'],[429,'rate'],[503,'failed']]) {
    const result = await feedback.send(message,config,async () => new Response(null,{status}));
    assert.deepEqual(result,{ok:false,reason});
  }
  assert.deepEqual(await feedback.send(message,config,async () => {throw new Error('offline');}),{ok:false,reason:'network'});
  let calls = 0;
  const count = () => { calls++; };
  assert.deepEqual(await feedback.send(message,{app:null,version:'test'},count),{ok:false,reason:'unregistered'});
  assert.deepEqual(await feedback.send({...message,message:'kort'},config,count),{ok:false,reason:'invalid'});
  assert.equal(calls,0);
});

test('web version matches the release and both builds allow the feedback endpoint', () => {
  assert.equal(globalThis.PrecastFeedbackConfig.version,require('../package.json').version);
  const desktop = require('../src-tauri/tauri.conf.json');
  assert.equal(desktop.version,globalThis.PrecastFeedbackConfig.version);
  const connect = desktop.app.security.csp.split(';').find(directive => directive.trim().startsWith('connect-src'));
  assert.ok(connect.split(/\s+/).includes('https://open-feedback-studio.pages.dev'));
  const html = require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../index.html'),'utf8');
  assert.match(html, /http-equiv="Content-Security-Policy" content="connect-src [^"]*https:\/\/open-feedback-studio\.pages\.dev"/);
});
