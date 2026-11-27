(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const dialog = byId('feedback-dialog');
  const opener = byId('open-feedback');
  const form = byId('feedback-form');
  const inputs = form.elements;
  const receipt = byId('feedback-receipt');
  const link = byId('feedback-issue');
  const status = byId('feedback-state');
  const send = byId('feedback-submit');
  const problems = {
    tooShort: 'Schrijf een bericht van minstens 10 tekens.',
    tooLong: 'Kort het bericht in tot maximaal 5.000 tekens.',
    email: 'Vul een geldig e-mailadres in of laat het veld leeg.',
    fullname: 'Kort je naam in of laat het veld leeg.',
    category: 'Kies een soort melding.',
    sentiment: 'Kies een van de opties bij ‘Hoe bevalt het?’.',
    invalid: 'Controleer de ingevulde gegevens.'
  };
  const errors = {
    invalid: problems.invalid,
    rejected: 'Open Feedback Studio heeft de melding afgewezen. Controleer je invoer.',
    duplicate: 'Deze melding is al ontvangen.',
    rate: 'De uurlimiet is bereikt. Probeer het over een uur opnieuw.',
    network: 'Geen verbinding met Open Feedback Studio. Controleer je internetverbinding en probeer het opnieuw.',
    failed: 'Versturen is mislukt. Probeer het later opnieuw.',
    unregistered: 'De registratie bij Open Feedback Studio is nog niet bevestigd.'
  };
  let sending = false;
  let sent = false;
  let edited = false;
  let failure = '';

  function values() {
    return {
      category: inputs.category.value, message: inputs.message.value,
      email: inputs.email.value, fullname: inputs.fullname.value, sentiment: inputs.sentiment.value
    };
  }

  function refresh() {
    const config = window.PrecastFeedbackConfig;
    const registered = Boolean(config?.app);
    const fields = values();
    const problem = window.PrecastFeedback.validate(fields);
    const hint = edited && problem ? problems[problem] || problems.invalid : '';
    byId('feedback-version').textContent = config?.version || 'onbekend';
    byId('feedback-registration').hidden = registered;
    byId('feedback-fields').disabled = sending || !registered;
    byId('feedback-counter').textContent = fields.message.trim().length.toLocaleString('nl-NL') + ' / 5.000';
    inputs.message.setAttribute('aria-invalid', String(edited && (problem === 'tooShort' || problem === 'tooLong')));
    inputs.email.setAttribute('aria-invalid', String(edited && problem === 'email'));
    inputs.fullname.setAttribute('aria-invalid', String(edited && problem === 'fullname'));
    const message = sending ? 'Bezig met versturen…' : failure || hint;
    if (status.textContent !== message) status.textContent = message;
    status.toggleAttribute('data-error', Boolean(failure || hint) && !sending);
    send.disabled = sending || !registered || Boolean(problem);
    form.hidden = sent;
    receipt.hidden = !sent;
  }

  function reset() {
    form.reset();
    sent = edited = false;
    failure = '';
    link.removeAttribute('href');
    link.hidden = true;
    byId('feedback-link-error').textContent = '';
    refresh();
  }

  opener.addEventListener('click', () => {
    if (dialog.open) return;
    refresh();
    dialog.showModal();
    byId(sent ? 'feedback-thanks' : 'feedback-title').focus();
  });
  byId('feedback-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (sent) reset();
    opener.focus();
  });
  form.addEventListener('input', () => {
    edited = true;
    failure = '';
    refresh();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = values(), config = window.PrecastFeedbackConfig;
    if (sent || sending || !config?.app || window.PrecastFeedback.validate(fields)) return;
    sending = true;
    failure = '';
    refresh();
    const result = await window.PrecastFeedback.send(fields, config);
    sending = false;
    if (result.ok) {
      sent = true;
      const url = result.issueUrl;
      if (typeof url === 'string' && url.startsWith('https://github.com/')) {
        link.href = url;
        link.hidden = false;
        byId('feedback-confirmation').textContent = 'Je kunt de melding op GitHub bekijken.';
      } else {
        link.removeAttribute('href');
        link.hidden = true;
        byId('feedback-confirmation').textContent = 'De makers zien je melding in hun overzicht.';
      }
    } else {
      failure = errors[result.reason] || errors.failed;
    }
    refresh();
    if (sent && dialog.open) byId('feedback-thanks').focus();
  });
  link.addEventListener('click', async event => {
    const desktop = window.__TAURI__?.core;
    if (!desktop) return;
    event.preventDefault();
    if (!link.href.startsWith('https://github.com/')) return;
    try {
      await desktop.invoke('open_feedback_issue', {url:link.href});
      byId('feedback-link-error').textContent = '';
    } catch {
      byId('feedback-link-error').textContent = 'Openen in de browser is mislukt. Je kunt het linkadres kopiëren.';
    }
  });
})();
