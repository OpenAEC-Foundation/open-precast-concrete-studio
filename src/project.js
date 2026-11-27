(function (root) {
  'use strict';
  const modelApi = typeof module === 'undefined' ? root.PrecastModel : require('./model.js');
  const schema = 'open-precast-concrete-studio/0.5';
  const drainageSchema = 'open-precast-concrete-studio/0.4';
  const profileSchema = 'open-precast-concrete-studio/0.3';
  const uniformSchema = 'open-precast-concrete-studio/0.2';
  const oldSchema = 'open-precast-concrete-studio/concept-0.1';
  const drainageDefaults = {channelProfile:'none', channelWidth:100, channelDepth:15, channelInset:50,
    dripGroove:false, dripWidth:15, dripDepth:8, dripInset:25, drainPosition:66};
  const rebateDefaults = {facadeRebate:false, rebateWidth:120, rebateDepth:30};
  const defaults = Object.freeze({
    'element-type':'balcony', mark:'BP-01', storey:'01', supplier:'generic',
    length:3200, depth:1600, thickness:180, shape:'rectangle', cut:300, slope:1.5,
    drain:true, railing:true, upstand:false, support:'isokorf', finish:'anti-slip',
    density:2450, upstandWidth:80, upstandHeight:100,
    thicknessMode:'constant', freeThickness:180,
    edgeProfile:'none', edgeSide:'free', edgeWidth:120, edgeDrop:35, ...drainageDefaults, ...rebateDefaults
  });
  const geometryFields = Object.keys(defaults);
  function validText(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error('Vul een geldig ' + label + ' in (1–80 tekens).');
    }
    return value.trim();
  }
  function checkIdentity(value) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
      throw new Error('De IFC-projectidentificatie is ongeldig.');
    }
    return value;
  }
  function validate(input) {
    if (!input || typeof input !== 'object') throw new Error('Element ontbreekt.');
    const state = Object.fromEntries(geometryFields.map(key => [key, input[key]]));
    state.mark = validText(state.mark,'elementmerk');
    state.storey = validText(state.storey,'bouwlaagnummer of naam');
    if (!['generic','olbecon','vebo','omg'].includes(state.supplier)) throw new Error('Onbekend fabrikantprofiel.');
    return modelApi.build(state);
  }
  function encode(input, identity, name) {
    const model = validate(input);
    return JSON.stringify({schema, unit:'mm', identity:checkIdentity(identity), name, element:model.state}, null, 2);
  }
  function decode(text, newIdentity) {
    const data = JSON.parse(text);
    if (!data || data.unit !== 'mm' || !data.element) throw new Error('Een ontwerp in millimeters wordt verwacht.');
    let state = data.element;
    let identity;
    if (data.schema === oldSchema) {
      const old = data.element;
      state = {...defaults, 'element-type':old.type, mark:old.type === 'gallery' ? 'GP-01' : 'BP-01',
        shape:old.shape, length:old.length, depth:old.depth, thickness:old.thickness, cut:old.contour,
        support:old.support, slope:old.slopePercent, drain:old.drain, railing:old.railingProvision,
        upstand:old.wallUpstand, finish:old.surfaceFinish};
      identity = newIdentity();
    } else if (data.schema === uniformSchema) {
      identity = checkIdentity(data.identity);
      state = {...data.element, thicknessMode:'constant', freeThickness:data.element.thickness,
        edgeProfile:'none', edgeSide:'free', edgeWidth:120, edgeDrop:35, ...drainageDefaults};
    } else if (data.schema === profileSchema) {
      identity = checkIdentity(data.identity);
      state = {...data.element, ...drainageDefaults};
    } else if (data.schema === drainageSchema || data.schema === schema) {
      identity = checkIdentity(data.identity);
    } else {
      throw new Error('Deze versie van het ontwerpbestand wordt niet ondersteund.');
    }
    if (data.schema !== schema) state = {...state, ...rebateDefaults};
    const model = validate(state);
    return {state:model.state, identity, name:typeof data.name === 'string' ? data.name.slice(0,200) : ''};
  }
  const api = Object.freeze({defaults,validate,encode,decode});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrecastProject = api;
})(globalThis);
