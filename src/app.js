(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const fields = Object.keys(PrecastProject.defaults);
  const typeNames = {balcony:'Balkonplaat', gallery:'Galerijplaat'};
  const draftKey = 'openaec.precast.design.v2';
  const drainageFields = ['channelProfile','channelWidth','channelDepth','channelInset','dripGroove','dripWidth','dripDepth','dripInset'];
  const profileFields = ['depth','slope','thickness','freeThickness','edgeProfile','edgeSide','edgeWidth','edgeDrop','upstand','upstandWidth','upstandHeight',...drainageFields];
  const referenceSettings = {depth:2210, slope:1, thickness:109.2, freeThickness:65, edgeProfile:'none', upstand:false, channelProfile:'none', dripGroove:false};
  const media = matchMedia('(prefers-color-scheme: dark)');
  const useTheme = () => { document.documentElement.dataset.oaTheme = media.matches ? 'dark' : 'light'; };
  useTheme();
  media.addEventListener('change', useTheme);
  let identity = PrecastIFC.newIdentity();
  let projectName = '';
  let view = 'iso';
  let currentModel = null;
  let importNumber = 0;
  let locallySaved = true;
  let manualProfile = null;

  function readControls() {
    return Object.fromEntries(fields.map(key => {
      const control = get(key);
      if (control.type === 'number') return [key,control.valueAsNumber];
      if (control.type === 'checkbox') return [key,control.checked];
      return [key,control.value];
    }));
  }

  function setControls(state, keys = fields) {
    for (const key of keys) {
      const control = get(key);
      if (control.type === 'checkbox') control.checked = state[key];
      else control.value = state[key];
    }
  }

  function setStatus(message) { get('status').textContent = message; }

  function refreshProfile(state, model) {
    const profile = PrecastProfiles.assess(state, model);
    get('profile-caption').textContent = profile.caption;
    get('profile-checks').replaceChildren(...profile.checks.map(check => {
      const item = document.createElement('li');
      item.textContent = check.text;
      item.dataset.level = check.warning ? 'warning' : 'ok';
      return item;
    }));
    const link = get('profile-source');
    link.hidden = !profile.url;
    if (profile.url) link.href = profile.url;
    else link.removeAttribute('href');
  }

  const format = (value, digits) => value.toLocaleString('nl-NL', {
    minimumFractionDigits:digits, maximumFractionDigits:digits
  });

  function handleInvalid(message) {
    currentModel = null;
    get('cutout-row').hidden = true;
    get('drain-coordinates').hidden = true;
    for (const id of ['area-value','volume-value','mass-value','drop-value','drawing-size','end-values']) get(id).textContent = '—';
    for (const id of ['plan-view','section-view','iso-view','legend','profile-source']) get(id).setAttribute('hidden','');
    get('profile-checks').replaceChildren();
    get('profile-caption').textContent = 'Vul de elementgegevens aan om het profiel te vergelijken.';
    get('invalid').textContent = message;
    get('invalid').hidden = false;
    get('print-sheet').textContent = 'Onvolledige elementgegevens. ' + message;
    for (const id of ['print-drawing','save-project','export-ifc']) get(id).disabled = true;
    setStatus(message);
  }

  function refresh() {
    const state = readControls();
    const reference = state.thicknessMode === 'reference';
    get('free-field').hidden = state.thicknessMode !== 'linear';
    get('thickness-fields').hidden = reference;
    get('thickness-label').textContent = state.thicknessMode === 'linear' ? 'Bij gevel (mm)' : 'Plaatdikte (mm)';
    get('reference-note').hidden = !reference;
    get('edge-fields').hidden = state.edgeProfile === 'none';
    for (const id of ['depth','slope','edgeProfile','upstand','channelProfile','dripGroove']) get(id).disabled = reference;
    get('drainage-reference').hidden = !reference;
    get('channel-fields').hidden = state.channelProfile === 'none';
    get('drip-fields').hidden = !state.dripGroove;
    get('drain-position-field').hidden = !state.drain;
    get('cut-row').hidden = state.shape === 'rectangle';
    get('upstand-fields').hidden = !state.upstand;
    get('element-code').textContent = state.mark;
    get('element-label').textContent = typeNames[state['element-type']];
    let model;
    try { model = PrecastProject.validate(state); }
    catch (error) { handleInvalid(error.message); return false; }
    currentModel = model;
    get('invalid').hidden = true;
    for (const id of ['print-drawing','save-project','export-ifc']) get(id).disabled = false;
    get('area-value').textContent = format(model.areaM2, 2) + ' m²';
    get('volume-value').textContent = format(model.volumeM3, 3) + ' m³';
    get('cutout-row').hidden = state.channelProfile === 'none' && !state.dripGroove;
    get('cutout-value').textContent = format((model.channelVolumeM3 + model.dripVolumeM3) * 1000, 3) + ' L';
    const outlet = model.reservations.drain;
    get('drain-coordinates').hidden = !outlet;
    if (outlet) {
      const axes = ['X','Y','Z'].map((axis,i) => axis + ' ' + format(outlet[i],1));
      get('drain-coordinates').textContent = 'HWA-reservering · ' + axes.join(' / ') + ' mm';
    }
    get('mass-value').textContent = format(model.massKg, 0) + ' kg';
    get('drop-value').textContent = format(model.dropMm, 1) + ' mm';
    get('end-values').textContent = model.endThicknessMm.map(n => format(n,1)).join(' / ') + ' mm';
    get('drawing-size').textContent = [state.length,state.depth].map(n => format(n,0)).join(' × ') + ' mm';
    refreshProfile(state, model);
    PrecastDrawings.render(model.state, model, view);
    return true;
  }

  function remember() {
    try {
      const project = PrecastProject.encode(currentModel.state, identity, projectName);
      const draft = manualProfile ? JSON.stringify({...JSON.parse(project), manualProfile}) : project;
      localStorage.setItem(draftKey, draft);
      locallySaved = true;
    } catch { locallySaved = false; }
    setStatus(locallySaved ? 'Werkversie lokaal bewaard' : 'Gebruik Opslaan om deze werkversie te bewaren.');
  }

  function updateField(event) {
    importNumber++;
    if (event.target.id === 'thicknessMode') {
      if (get('thicknessMode').value === 'reference') {
        // Keep raw inputs so an unfinished edit can also be resumed.
        manualProfile = Object.fromEntries(profileFields.map(key => {
          const control = get(key);
          return [key, control.type === 'checkbox' ? control.checked : control.value];
        }));
        setControls(referenceSettings, Object.keys(referenceSettings));
      } else if (manualProfile) {
        setControls(manualProfile, profileFields);
        manualProfile = null;
      }
      if (get('thicknessMode').value === 'constant' && !get('freeThickness').checkValidity()) {
        get('freeThickness').value = PrecastProject.defaults.freeThickness;
      }
    }
    if (event.target.id === 'element-type' && ['GP-01','BP-01'].includes(get('mark').value)) {
      get('mark').value = get('element-type').value === 'gallery' ? 'GP-01' : 'BP-01';
    }
    // Closed controls keep the last usable value so an incomplete edit never gets trapped.
    if (event.target.id === 'shape' && get('shape').value === 'rectangle') {
      const cut = get('cut').valueAsNumber;
      if (!Number.isFinite(cut) || cut < 0 || cut > 1000) get('cut').value = PrecastProject.defaults.cut;
    }
    const inactiveFields = [
      ...(get('edgeProfile').value === 'none' ? ['edgeWidth','edgeDrop'] : []),
      ...(!get('upstand').checked ? ['upstandWidth','upstandHeight'] : []),
      ...(get('channelProfile').value === 'none' ? ['channelWidth','channelDepth','channelInset'] : []),
      ...(!get('dripGroove').checked ? ['dripWidth','dripDepth','dripInset'] : []),
      ...(!get('drain').checked ? ['drainPosition'] : [])
    ];
    for (const key of inactiveFields) {
      const field = get(key);
      if (!Number.isFinite(field.valueAsNumber) || !field.checkValidity()) field.value = PrecastProject.defaults[key];
    }
    if (refresh()) remember();
  }

  function setView(next) {
    view = next;
    document.querySelectorAll('[data-view]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.view === next)));
    get('view-caption').textContent = {iso:'Sleep om te draaien',plan:'Maten in mm',section:'Doorsnede A–A'}[next];
    if (currentModel) PrecastDrawings.render(currentModel.state, currentModel, next);
  }

  function download(contents, suggestedName, mime) {
    const link = document.createElement('a');
    link.download = suggestedName;
    const url = URL.createObjectURL(new Blob([contents], {type:mime}));
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Download aangeboden · ' + link.download);
  }

  async function saveDocument(kind) {
    if (!currentModel) return;
    const isIfc = kind === 'ifc';
    try {
      const state = currentModel.state;
      const contents = isIfc ? PrecastIFC.export(state, currentModel, identity) : PrecastProject.encode(state, identity, projectName);
      const mark = state.mark.replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,60) || 'element';
      const suggestedName = mark + (isIfc ? '.ifc' : '.opc.json');
      const desktop = window.__TAURI__?.core;
      if (desktop) {
        const saved = await desktop.invoke('save_document', {kind, suggestedName, contents});
        setStatus(saved ? (isIfc ? 'IFC-bestand opgeslagen' : 'Ontwerp opgeslagen') : 'Opslaan geannuleerd');
      } else {
        download(contents, suggestedName, isIfc ? 'application/x-step' : 'application/json');
      }
    } catch (error) {
      setStatus((isIfc ? 'IFC-export mislukt. ' : 'Opslaan mislukt. ') + (error.message || error));
    }
  }

  async function openFile(file) {
    const number = ++importNumber;
    try {
      if (file.size > 1_000_000) throw new Error('Het ontwerpbestand is te groot.');
      const loaded = PrecastProject.decode(await file.text(), PrecastIFC.newIdentity);
      if (number !== importNumber) return;
      manualProfile = null;
      setControls(loaded.state);
      identity = loaded.identity;
      projectName = loaded.name;
      if (refresh()) { remember(); setStatus('Geopend · ' + file.name); }
    } catch (error) {
      if (number === importNumber) setStatus('Openen mislukt. ' + error.message);
    }
  }

  get('parameters').addEventListener('input', updateField);
  get('parameters').addEventListener('submit', event => event.preventDefault());
  get('supplier').addEventListener('input', updateField);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  get('open-project').addEventListener('click', () => get('file-input').click());
  get('file-input').addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) openFile(file);
  });
  get('save-project').addEventListener('click', () => saveDocument('project'));
  get('export-ifc').addEventListener('click', () => saveDocument('ifc'));
  get('print-drawing').addEventListener('click', () => { if (currentModel) window.print(); });
  get('new-project').addEventListener('click', () => {
    if (!confirm('Een nieuw element starten? Bewaar het huidige ontwerp met Opslaan als je het later wilt openen.')) return;
    importNumber++;
    manualProfile = null;
    identity = PrecastIFC.newIdentity();
    projectName = '';
    setControls(PrecastProject.defaults);
    refresh(); setView('iso'); remember();
    setStatus('Nieuw element aangemaakt');
  });

  let initialState = PrecastProject.defaults;
  let initialStatus = 'Nieuw element';
  try {
    const stored = localStorage.getItem(draftKey);
    if (stored) {
      const loaded = PrecastProject.decode(stored, PrecastIFC.newIdentity);
      initialState = loaded.state;
      projectName = loaded.name;
      identity = loaded.identity;
      const record = JSON.parse(stored);
      const backup = record.manualProfile;
      if (backup && record.schema === 'open-precast-concrete-studio/0.3') {
        for (const key of drainageFields) {
          const value = PrecastProject.defaults[key];
          backup[key] = get(key).type === 'checkbox' ? value : String(value);
        }
      }
      if (initialState.thicknessMode === 'reference' && backup &&
          profileFields.every(key => typeof backup[key] === (get(key).type === 'checkbox' ? 'boolean' : 'string'))) {
        manualProfile = backup;
      }
      initialStatus = 'Lokale werkversie hersteld';
    }
  } catch { initialStatus = 'Standaardontwerp geopend. Gebruik Opslaan voor een eigen bestand.'; }
  setControls(initialState);
  if (refresh()) { setView(view); remember(); if (locallySaved) setStatus(initialStatus); }
})();
