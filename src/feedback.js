(() => {
  'use strict';
  const endpoint = 'https://open-feedback-studio.pages.dev/api/feedback';
  const categories = ['bug','feature','general'];
  const sentiments = ['Frustrated','Neutral','Happy'];

  function validate(fields) {
    if (!fields || typeof fields !== 'object') return 'invalid';
    if (!categories.includes(fields.category)) return 'category';
    const text = typeof fields.message === 'string' ? fields.message.trim() : '';
    if (text.length < 10) return 'tooShort';
    if (text.length > 5000) return 'tooLong';
    if (fields.email != null && typeof fields.email !== 'string') return 'email';
    const email = fields.email?.trim();
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email))) return 'email';
    if (fields.fullname != null && (typeof fields.fullname !== 'string' || fields.fullname.trim().length > 200)) return 'fullname';
    if (fields.sentiment != null && fields.sentiment !== '' && !sentiments.includes(fields.sentiment)) return 'sentiment';
    return null;
  }

  function buildPayload(fields, config) {
    if (validate(fields) || !config?.app || !config.version) return null;
    const payload = {app:config.app, category:fields.category, message:fields.message.trim(), appVersion:config.version};
    for (const key of ['email','fullname','sentiment']) {
      const value = fields[key]?.trim();
      if (value) payload[key] = value;
    }
    return payload;
  }

  function githubLink(value) {
    if (typeof value !== 'string' || !value.startsWith('https://github.com/')) return null;
    try {
      const url = new URL(value);
      return url.origin === 'https://github.com' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  async function send(fields, config, request = globalThis.fetch) {
    let timer;
    try {
      if (!config?.app || !config.version) return {ok:false, reason:'unregistered'};
      const payload = buildPayload(fields, config);
      if (!payload) return {ok:false, reason:'invalid'};
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 20000);
      const response = await request(endpoint, {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload), credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', signal:controller.signal});
      if (response.status !== 200) {
        return {ok:false, reason:({400:'rejected',409:'duplicate',429:'rate'})[response.status] || 'failed'};
      }
      const receipt = await response.json().catch(() => null);
      return receipt?.success === true ? {ok:true, issueUrl:githubLink(receipt.githubIssueUrl)} : {ok:false, reason:'failed'};
    } catch {
      return {ok:false, reason:'network'};
    } finally {
      clearTimeout(timer);
    }
  }

  const api = Object.freeze({validate, buildPayload, send});
  if (typeof module === 'undefined') globalThis.PrecastFeedback = api;
  else module.exports = api;
})();
