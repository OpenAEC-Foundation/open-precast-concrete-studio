# Wat de twaalf balkon- en galerijbeelden laten zien

De nummering volgt de aangeleverde beelden. Voor een tekenfunctie is vooral van belang of een detail over de hele plaatlengte doorloopt of alleen bij een deur, kolom of afvoer voorkomt. Twee onderdelen kunnen in één doorsnede identiek lijken en toch een ander betonvolume hebben.

| Beeld | Waarneembaar detail | Betekenis voor de editor |
| --- | --- | --- |
| 1 | Het blad van Belder toont een vierzijdig opgelegd polyester balkon, afschotpijlen in plan, twee randdetails en een HWA-detail met een doorvoer van Ø80. | Plan, doorsnede en hart van de afvoer horen op hetzelfde elementblad. De maat en het materiaal gelden voor deze tekening. [Belder](https://belder.nl/balkonconstructie-film-belder-prefab-bv/) |
| 2 en 8 | De foto's tonen evenwijdige groeven, ronde openingen en opstaande randen. Bij beeld 8 eindigen de groeven plaatselijk. | Een korte drempelgroef vraagt een begin- en eindpositie langs de gevel. Een ronde opening heeft ook een diameter en diepte nodig. |
| 3 en 9 | De buitenrand heeft verschillende niveaus. Bij de gestapelde platen zijn het niveauverschil en de uitstekende staven van opzij zichtbaar. | Bovenrand en verdikking onder de plaat moeten afzonderlijk instelbaar zijn. Staafdiameters en verankeringen zijn uit deze beelden niet af te leiden. |
| 4 | De galerijdoorsnede laat het afschot, de ingesneden bovengoot en het waterhol onder de buitenrand zien. De kolom en stalen console liggen onder de plaat. | Goot en waterhol nemen allebei beton weg. De HWA-hoogte en de hoogte van de buitenlip volgen uit de ligging van het loopvlak. |
| 5 en 6 | Ter plaatse van de gevel liggen de geleiderail of drempel verdiept. In beeld 5 loopt de onderzijde bij de aansluiting schuin omlaag. Beeld 6 toont ook groeven en een koudebrugonderbreking. | Voorbeeld BP-S01 combineert een gevelsponning met verdikking aan dezelfde zijde. Sponningdiepte, plaatdikte en verdikking zijn afzonderlijke maten. |
| 7 en 11 | De galerij bestaat uit opeenvolgende platen. Bij de deuren zitten korte groeven. De afvoer ligt langs de gevel, in beeld 11 in een plaatselijke verdieping. | Een gevelgoot met afvoerpot vraagt een positie langs twee assen. De huidige langsgoot ligt aan de vrije zijde en de HWA-reservering geeft een hartpunt aan. |
| 10 en 12 | Het schema toont een onderbroken plaatrand bij een kolom. Het BIM-beeld toont een asymmetrische rand met een plaatselijke uitsprong, een goot en afzonderlijke voorzieningen. | Een kolominkassing, een plaatselijke pot of een goot rond meerdere zijden vraagt een lokaal begrensde uitsparing in het plaatlichaam. Vebo beschrijft bij zijn standaardbalkon een vlak loopvlak en een ringgoot met variabele randdetails. [Vebo](https://www.vebo.nl/balkonconcept) |

## Gevelsponning in BP-S01

Het voorbeeld is een eigen parametrische uitwerking van het principe in beeld 5. De gekozen voorbeeldmaten zijn in millimeters. De plaat meet 3.200 × 1.800. De dikte loopt lineair van 180 naar 120. Onder de gevelzijde komt een driehoekige verdikking van 500 breed en 60 hoog. Aan de bovenzijde volgt een sponning van 120 breed en 30 diep het afschot over de volle lengte. Een plaatselijke deursparing zou minder beton wegnemen.

| Onderdeel | Berekening in meters | Volume |
| --- | --- | ---: |
| Plaat met dikteverloop | 3,2 × 1,8 × (0,18 + 0,12) / 2 | 0,86400 m³ |
| Verdikking bij gevel | 3,2 × 0,50 × 0,06 / 2 | +0,04800 m³ |
| Gevelsponning | 3,2 × 0,12 × 0,03 | −0,01152 m³ |
| Netto beton | 3,2 × 0,2814 m² doorsnede | **0,90048 m³** |

De verticale eindmaten zijn 210 mm bij de gevel en 120 mm aan de vrije rand. In de IFC-controle worden zowel het driehoeksnet van het geëxporteerde betonlichaam als de IFC-hoeveelheid met de handberekening vergeleken. [Bewerkbaar voorbeeld](../examples/BP-S01.opc.json) · [IFC4](../examples/BP-S01.ifc) · [Elementblad](../examples/BP-S01.pdf)

## Wat we uit de andere OpenAEC-editors gebruiken

Open Stair Studio geeft de tekening een eigen bedieningsruimte, met een vaste manier om het model weer in beeld te brengen. De interface is in Svelte gebouwd. De viewport gebruikt Rust, WebAssembly en wgpu. Open Frame Studio heeft een bibliotheek met startmodellen, een tekening die rond de cursor zoomt en een Rust-rekenkern die ook via WebAssembly beschikbaar is. [Open Stair Studio](https://github.com/OpenAEC-Foundation/open-stair-studio/tree/a0fe687351c34c0bccb06af92078e7d0a9040c33) · [Open Frame Studio](https://github.com/OpenAEC-Foundation/open-frame-studio/tree/c2f7f8053015d30b4634ebee761b37cb3b9bf88d)

In Open Precast gebruikt ieder aanzicht zijn eigen zoom en verschuiving. Het elementblad houdt de volledige plaat in beeld. Vier startmodellen laten je in **Nieuw** eerst de bijbehorende doorsnede zien. Elk nieuw element krijgt een eigen IFC-identiteit.

De Windows-app gebruikt Rust en Tauri voor bestandsdialoog en PDF-uitvoer. De webeditor en Windows-app delen één JavaScript-plaatmodel voor doorsnede, hoeveelheden en IFC. Bij uitbreiding naar willekeurige contouren, ringgoten en echte doorvoeren is een gedeelde Rust-kern met een WebAssembly-interface de logische volgende stap. De bestaande handberekeningen, doorsneden en IFC-metingen kunnen dan beide implementaties op exact dezelfde proefstukken vergelijken. [Tauri-processen en webinterface](https://v2.tauri.app/concept/process-model/)

Als snelheidsproef is voor elk van drie meegeleverde platen het model opnieuw gevalideerd en als IFC-tekst opgebouwd. Op een Core i7-11850H onder Windows met Node 24.20.0 waren de medianen 0,52 ms voor GP-A01, 0,19 ms voor BP-S01 en 0,28 ms voor BP-P01. Elke reeks had 200 opwarmrondes en 1.000 metingen. De 95e percentielen lagen tussen 0,40 en 1,12 ms. De meting betreft de berekening van één plaat in het geheugen. Schermopbouw, bestandsschrijven en samengestelde gebouwen vallen buiten deze meting.
