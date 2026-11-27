(() => {
  'use strict';

  const templates = [
    {id:'balcony', title:'Rechte balkonplaat', data:{}},
    {id:'gallery', title:'Galerij met afwatering', data:{
      'element-type':'gallery', mark:'GP-A01', storey:'01 Galerij', length:3600, depth:1800,
      thicknessMode:'linear', thickness:190, freeThickness:145, support:'console',
      channelProfile:'rect', channelWidth:120, channelDepth:20, channelInset:60,
      dripGroove:true, dripWidth:16, dripDepth:8, drainPosition:20
    }},
    {id:'rebate', title:'Balkon met gevelsponning', data:{
      mark:'BP-S01', depth:1800, thicknessMode:'linear', thickness:180, freeThickness:120,
      facadeRebate:true, rebateWidth:120, rebateDepth:30,
      edgeProfile:'bevel', edgeSide:'facade', edgeWidth:500, edgeDrop:60, drain:false
    }},
    {id:'hicon', title:'Hi-Con-referentiebalkon', data:{
      mark:'BP-P01', length:2200, depth:2210, thicknessMode:'reference', thickness:109.2,
      freeThickness:65, slope:1, drain:false, railing:false
    }}
  ];
  const stateOf = template => ({...PrecastProject.defaults, ...template.data});

  function sectionPreview(model) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const ring = model.sectionRing;
    const upper = Math.max(...ring.map(p => p[1]));
    const lower = Math.min(...ring.map(p => p[1]));
    const margin = model.state.depth * .04;
    svg.setAttribute('viewBox', [-margin, -upper-margin, model.state.depth+2*margin, upper-lower+2*margin].join(' '));
    svg.setAttribute('aria-hidden','true');
    const section = document.createElementNS(ns,'polygon');
    section.setAttribute('points', ring.map(([y,z]) => y + ',' + (-z)).join(' '));
    svg.append(section);
    return svg;
  }

  const list = document.getElementById('element-templates');
  for (const template of templates) {
    const model = PrecastProject.validate(stateOf(template));
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'template';
    radio.value = template.id;
    radio.defaultChecked = template === templates[0];
    const title = document.createElement('strong');
    title.textContent = template.title;
    const dimensions = document.createElement('small');
    dimensions.textContent = [model.state.length,model.state.depth].map(n => n.toLocaleString('nl-NL')).join(' × ') + ' mm';
    label.append(radio, title, sectionPreview(model), dimensions);
    list.append(label);
  }

  window.PrecastTemplates = {
    selected() {
      const chosen = document.querySelector('#element-templates input:checked').value;
      return stateOf(templates.find(template => template.id === chosen));
    }
  };
})();
