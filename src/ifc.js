/* IFC4 ADD2 coordination export, with SI units in the file and mm in the editor. */
(() => {
  'use strict';

  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

  function newIdentity() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  // Each role has a fixed number. Changing geometry or inserting a STEP record
  // cannot renumber the slab or its relationships. Role 0 is the saved UUID.
  function guid(identity, role) {
    let value = BigInt('0x' + identity.replaceAll('-', '')) ^ BigInt(role);
    let result = '';
    for (let digit = 0; digit < 22; digit++) {
      result = alphabet[Number(value & 63n)] + result;
      value >>= 6n;
    }
    return "'" + result + "'";
  }

  function quote(value) {
    let step = "'";
    for (const char of String(value)) {
      const number = char.codePointAt(0);
      if (char === "'") step += "''";
      else if (char === '\\') step += '\\\\';
      else if (number >= 32 && number < 127) step += char;
      else {
        const wide = number > 65535;
        step += (wide ? '\\X4\\' : '\\X2\\') +
          number.toString(16).toUpperCase().padStart(wide ? 8 : 4, '0') + '\\X0\\';
      }
    }
    return step + "'";
  }

  function real(number) {
    if (!Number.isFinite(number)) throw new Error('Ongeldige numerieke waarde bij IFC-export.');
    // IEC/STEP REAL requires a decimal point. Submicrometre precision suffices here.
    return number.toFixed(12).replace(/0+$/, '');
  }

  function exportIfc(state, model, identity) {
    if (!uuidPattern.test(identity)) throw new Error('Het project mist een geldige elementidentiteit.');
    const records = [];
    function add(entity) {
      const id = '#' + (records.length + 1);
      records.push(id + '=' + entity + ';');
      return id;
    }
    const id = role => guid(identity, role);
    const list = refs => '(' + refs.join(',') + ')';
    const mark = String(state.mark || (state['element-type'] === 'gallery' ? 'GP-01' : 'BP-01'));
    const name = state['element-type'] === 'gallery' ? 'Galerijplaat' : 'Balkonplaat';

    const world = add('IFCCARTESIANPOINT((0.,0.,0.))');
    const origin = add('IFCAXIS2PLACEMENT3D(' + world + ',$,$)');
    const context = add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-7," + origin + ',$)');
    const body = add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*," + context + ',$,.MODEL_VIEW.,$)');
    const units = [
      add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'),
      add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
      add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'),
      add('IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)')
    ];
    const cubicMetreInverse = add('IFCDERIVEDUNITELEMENT(' + units[0] + ',-3)');
    const kilogram = add('IFCDERIVEDUNITELEMENT(' + units[3] + ',1)');
    const densityUnit = add('IFCDERIVEDUNIT((' + kilogram + ',' + cubicMetreInverse + '),.MASSDENSITYUNIT.,$)');
    units.push(densityUnit);
    const assignment = add('IFCUNITASSIGNMENT(' + list(units) + ')');
    const project = add('IFCPROJECT(' + id(1) + ",$,'Prefab elementen',$,$,$,$,(" + context + '),' + assignment + ')');
    const place = parent => add('IFCLOCALPLACEMENT(' + parent + ',' + origin + ')');
    const buildingLocation = place('$');
    const storeyLocation = place(buildingLocation);
    const building = add('IFCBUILDING(' + id(2) + ",$,'Gebouw',$,$," + buildingLocation + ',$,$,.ELEMENT.,$,$,$)');
    const storeyName = quote(String(state.storey || '').trim() || 'Onbenoemde bouwlaag');
    const storey = add('IFCBUILDINGSTOREY(' + id(3) + ',$,' + storeyName + ',$,$,' + storeyLocation + ',$,$,.ELEMENT.,$)');
    add('IFCRELAGGREGATES(' + id(4) + ',$,$,$,' + project + ',(' + building + '))');
    add('IFCRELAGGREGATES(' + id(5) + ',$,$,$,' + building + ',(' + storey + '))');

    function closedMesh(part) {
      const indexed = new Map();
      const vertices = [];
      const indices = part.faces.map(face => face.map(point => {
        const coordinates = point.map(axis => real(axis / 1000));
        const key = list(coordinates);
        if (!indexed.has(key)) {
          vertices.push(key);
          indexed.set(key, vertices.length);
        }
        return indexed.get(key);
      }));
      const coordinates = add('IFCCARTESIANPOINTLIST3D(' + list(vertices) + ')');
      const faces = indices.map(loop => add('IFCINDEXEDPOLYGONALFACE(' + list(loop) + ')'));
      return add('IFCPOLYGONALFACESET(' + coordinates + ',.T.,' + list(faces) + ',$)');
    }
    const items = model.parts.map(closedMesh);
    const representation = add('IFCSHAPEREPRESENTATION(' + body + ",'Body','Tessellation'," + list(items) + ')');
    const shape = add('IFCPRODUCTDEFINITIONSHAPE($,$,(' + representation + '))');
    const slab = add('IFCSLAB(' + id(0) + ',$,' + quote(name) + ',$,$,' + place(storeyLocation) + ',' + shape + ',' + quote(mark) + ',.FLOOR.)');
    add('IFCRELCONTAINEDINSPATIALSTRUCTURE(' + id(6) + ',$,$,$,(' + slab + '),' + storey + ')');

    const material = add("IFCMATERIAL('Prefab beton',$,'concrete')");
    add('IFCRELASSOCIATESMATERIAL(' + id(7) + ',$,$,$,(' + slab + '),' + material + ')');
    const classification = add("IFCCLASSIFICATION($,$,$,'NL-SfB',$,$,$)");
    const group = add("IFCCLASSIFICATIONREFERENCE($,'23','Vloeren'," + classification + ",$,$)");
    add('IFCRELASSOCIATESCLASSIFICATION(' + id(14) + ',$,$,$,(' + slab + '),' + group + ')');
    function relateProperties(role, set) {
      add('IFCRELDEFINESBYPROPERTIES(' + id(role) + ',$,$,$,(' + slab + '),' + set + ')');
    }
    function property(name, type, value) {
      return add('IFCPROPERTYSINGLEVALUE(' + quote(name) + ',$,' + type + '(' + value + '),$)');
    }
    function propertySet(role, name, properties) {
      return add('IFCPROPERTYSET(' + id(role) + ',$,' + quote(name) + ',$,' + list(properties) + ')');
    }
    relateProperties(8, propertySet(9, 'Pset_SlabCommon', [property('IsExternal', 'IFCBOOLEAN', '.T.')]));
    const length = (name, mm) => property(name, 'IFCLENGTHMEASURE', real(mm / 1000));
    const label = (name, value) => property(name, 'IFCLABEL', quote(value));
    const bool = (name, value) => property(name, 'IFCBOOLEAN', value ? '.T.' : '.F.');
    const supports = { isokorf:'Koudebrugonderbreking', console:'Consoles', columns:'Kolommen', steel:'Staal', nokken:'Nokken / stekken' };
    const finishes = { 'anti-slip':'Antislipstructuur', smooth:'Glad', waffle:'Wafelprofiel', blasted:'Gezandstraald' };
    const profiles = { generic:'Generiek', olbecon:'Olbecon', vebo:'Vebo' };
    const drainCount = model.reservations.drain ? 1 : 0;
    const railingCount = model.reservations.railing.length;
    const properties = [
      label('Gebruiksfunctie', name),
      label('Ontwerpstatus', 'Coördinatieontwerp'),
      label('Referentieprofiel fabrikant', profiles[state.supplier] || 'Generiek'),
      label('Constructieve uitwerking', 'Open'),
      label('Bevestigingsprincipe', supports[state.support]),
      label('Loopvlak', finishes[state.finish]),
      length('Buitenmaat X', state.length),
      length('Buitenmaat Y', state.depth),
      property('Horizontaal projectieoppervlak', 'IFCAREAMEASURE', real(model.areaM2)),
      property('Afschot', 'IFCRATIOMEASURE', real(state.slope / 100)),
      property('Dichtheid voor massaraming', 'IFCMASSDENSITYMEASURE', real(state.density ?? 2450)),
      bool('HWA-reservering', drainCount > 0),
      bool('Hekwerkreservering', railingCount > 0),
      property('Aantal HWA-reserveringen', 'IFCINTEGER', drainCount),
      property('Aantal hekwerkreserveringen', 'IFCINTEGER', railingCount),
      bool('Gevelopstand', state.upstand)
    ];
    const mode = state.thicknessMode ?? 'constant';
    const profile = state.edgeProfile ?? 'none';
    const modeNames = {constant:'Constant', linear:'Lineair', reference:'Hi-Con referentiedoorsnede'};
    const edgeNames = {none:'Geen', step:'Rechthoekige verdikking', bevel:'Schuine verdikking'};
    properties.push(label('Dikteverloop', modeNames[mode]));
    if (mode === 'constant') {
      properties.push(length(profile === 'none' ? 'Verticale plaatdikte' : 'Basisplaatdikte buiten randprofiel', state.thickness));
    }
    if (mode === 'linear') {
      properties.push(length('Basisdikte gevelzijde', state.thickness), length('Basisdikte vrije rand', state.freeThickness));
    }
    if (mode === 'reference') {
      properties.push(
        property('Bron referentiedoorsnede', 'IFCTEXT',
          quote('https://www.hi-con.com/media/jzod25co/hi-con-2000x2200x65-115-basis-isokorf.ifc')),
        label('Herkomst profiel', 'Maatgegevens op X = 1000 mm van betonlichaam #14918, geëxtrudeerd over de plaatlengte')
      );
    }
    properties.push(label('Randprofiel', mode === 'reference' ? 'Volgens referentiedoorsnede' : edgeNames[profile]));
    if (mode !== 'reference' && profile !== 'none') {
      properties.push(
        label('Zijde randprofiel', state.edgeSide === 'facade' ? 'Gevel' : 'Vrije rand'),
        length('Breedte randprofiel', state.edgeWidth),
        length('Extra dikte randprofiel', state.edgeDrop)
      );
    }
    const [nearDepth, farDepth] = model.endThicknessMm;
    properties.push(length('Totale eindhoogte gevelzijde', nearDepth), length('Totale eindhoogte vrije rand', farDepth));
    // Y and Z have the same index and trace the perimeter of the central section.
    for (const [axis, name] of ['Y', 'Z'].entries()) {
      const values = model.sectionRing.map(point => 'IFCLENGTHMEASURE(' + real(point[axis] / 1000) + ')');
      properties.push(add('IFCPROPERTYLISTVALUE(' + quote('Doorsnede A-A ' + name) + ',' +
        quote('Omtrek in elementcoördinaten, gekoppeld op puntvolgorde') + ',' + list(values) + ',$)'));
    }
    if (state.upstand) {
      properties.push(length('Breedte gevelopstand', state.upstandWidth ?? 80), length('Hoogte gevelopstand', state.upstandHeight ?? 100));
    }
    function reservationLocation(name, point) {
      const values = point.map(axis => 'IFCLENGTHMEASURE(' + real(axis / 1000) + ')');
      return add('IFCPROPERTYLISTVALUE(' + quote(name) +
        ",'Lokale X, Y, Z ten opzichte van het elementnulpunt'," + list(values) + ',$)');
    }
    if (drainCount + railingCount > 0) {
      properties.push(label('Status reserveringen', 'Schematische posities voor coördinatie'));
    }
    if (model.reservations.drain) {
      properties.push(reservationLocation('Positie HWA-reservering', model.reservations.drain));
    }
    model.reservations.railing.forEach((point, index) => {
      properties.push(reservationLocation('Positie hekwerkreservering ' + (index + 1), point));
    });
    relateProperties(10, propertySet(11, 'OpenPrecast_Ontwerp', properties));
    const volume = add("IFCQUANTITYVOLUME('NetVolume',$,$," + real(model.volumeM3) + ',$)');
    const weight = add("IFCQUANTITYWEIGHT('NetWeight','Indicatieve massa op basis van volume en dichtheid',$," + real(model.massKg) + ',$)');
    const quantities = add('IFCELEMENTQUANTITY(' + id(12) + ",$,'Qto_SlabBaseQuantities',$,$,(" + volume + ',' + weight + '))');
    relateProperties(13, quantities);

    const timestamp = new Date().toISOString().slice(0, 19);
    return [
      'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('Coordination model'),'2;1');",
      'FILE_NAME(' + quote(mark + '.ifc') + ',' + quote(timestamp) + ",(''),(''),'Open Precast Concrete Studio','Open Precast Concrete Studio','');",
      "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...records, 'ENDSEC;', 'END-ISO-10303-21;', ''
    ].join('\r\n');
  }

  globalThis.PrecastIFC = Object.freeze({ newIdentity, export: exportIfc });
})();
