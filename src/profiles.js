(function (root) {
  'use strict';
  const sources = {
    olbecon: 'https://www.olbecon.nl/prefab/balkons-en-galerijplaten',
    omg: 'https://www.omgprefabbeton.be/',
    vebo: 'https://www.vebo.nl/balkonconcept'
  };
  const integer = new Intl.NumberFormat('nl-NL', {maximumFractionDigits: 1});

  function assess(state, model) {
    if (state.supplier === 'generic') {
      return {caption:'Vrij ontwerp. Kies een profiel om de elementgegevens met een leverancier te vergelijken.', checks:[]};
    }
    const url = sources[state.supplier];
    if (!url) throw new Error('Onbekend fabrikantprofiel.');
    if (state['element-type'] === 'gallery' && state.supplier !== 'omg') {
      return {url, caption:'De geraadpleegde productspecificaties gaan over balkons. Stem de grenzen voor deze galerijplaat af met de leverancier.', checks:[]};
    }
    if (state.supplier === 'vebo') {
      return {
        url, caption:'Referentie voor het standaardbalkon van Vebo. De fabrikant beschrijft een vlak loopvlak met ringgoot.',
        checks:[
          {warning:state.slope > 0, text:state.slope > 0 ? 'Het getekende afschot wijkt af van het vlakke loopvlak.' : 'Vlak loopvlak ingesteld.'},
          {warning:true, text:'Ringgoot, randsegmenten en aansluitdetails uitwerken met de Revit-tool van Vebo.'}
        ]
      };
    }
    const omg = state.supplier === 'omg';
    const limits = [
      ['Lengte', state.length, 10000, 'mm'],
      ['Breedte', state.depth, omg ? 4500 : 3000, 'mm'],
      ['Indicatieve massa', model.massKg, omg ? 16000 : 17000, 'kg']
    ];
    const checks = limits.map(([label,value,max,unit]) => ({
      warning:value > max,
      text:label + ' ' + integer.format(value) + ' / ' + integer.format(max) + ' ' + unit + (value > max ? ' · overschreden' : ' · binnen grens')
    }));
    if (omg) {
      const coordinated = state.channelProfile !== 'none' && !!model.reservations.drain;
      checks.push({warning:!coordinated, text:coordinated ? 'Goot en HWA-positie ingetekend. Stem klokput en aansluiting af met OMG.' : 'Voor de uitvoering met klokput kun je een langsgoot en een HWA-reservering intekenen.'});
      return {url,caption:'Algemene productiematen van OMG Prefabbeton. OMG beschrijft een ingewerkte goot met klokput voor balkons en galerijen.',checks};
    }
    return {url,caption:'Vergelijking met de gepubliceerde bovengrenzen voor Olbecon-balkons. Massa volgt uit de ingevoerde dichtheid.',checks};
  }

  const api = {assess};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrecastProfiles = api;
})(globalThis);
