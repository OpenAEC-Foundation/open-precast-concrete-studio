# Open Precast Concrete Studio

Met Open Precast Concrete Studio teken je prefab balkon- en galerijplaten, maak je een elementblad en exporteer je het betonlichaam naar IFC4.

## Installeren op Windows

Download het bestand met de uitgang `windows-x64-setup.exe` en voer het uit. De installer installeert de app voor je eigen Windows-account. Open daarna **Open Precast Concrete Studio** vanuit Start. Tekenen en exporteren werken lokaal. [Download de nieuwste release](https://github.com/OpenAEC-Foundation/open-precast-concrete-studio/releases/latest)

**Opslaan** opent een Windows-dialoog voor het bewerkbare `.opc.json`-ontwerp. Met **Exporteer IFC4** kies je waar het `.ifc`-bestand komt. **Open ontwerp** opent een eerder opgeslagen plaat.

De installer gebruikt Microsoft Edge WebView2. Als deze runtime op de computer ontbreekt, downloadt de installer deze bij de eerste installatie.

De ZIP op dezelfde releasepagina bevat de webversie en voorbeelden. Pak de ZIP uit en open `index.html` in Edge of Chrome. De voorbeelden kun je ook openen in de Windows-app. [Galerijplaat met afwatering](examples/GP-A01.opc.json) · [Balkon met gemeten randprofiel](examples/BP-P01.opc.json) · [Galerijplaat met opstand](examples/GP-Z01.opc.json)

## Een plaat tekenen

Kies balkonplaat of galerijplaat en vul het elementmerk en de bouwlaag in. Lengte loopt evenwijdig aan de gevel, diepte vanaf de gevel naar de vrije rand. Het doorgetrokken loopvlak ligt aan de gevel op lokaal peil nul.

Bij **Lineair dikteverloop** stel je de verticale plaatdikte in aan de gevel en aan de vrije rand. Het afschot bepaalt de bovenzijde. De dikten bepalen de onderzijde. Een rechthoekige of schuine verdikking kan aan de gevel of aan de vrije rand liggen. De opstand en randverdikking tellen beide mee in het volume binnen de gekozen plattegrond.

Bij **Hi-Con · gemeten doorsnede** volgt de editor een vaste snede van 2.210 mm diep door het betonlichaam van het onderzochte balkon. De gevelneus en het waterhol bepalen mede de plaatselijke dikte. Het loopvlak heeft 1% afschot. Bij een rechthoekige lengte van 2.200 mm levert de over die lengte doorgetrokken snede 0,425991962 m³ beton op. Het fabrikantmodel bevat daarnaast plaatselijke geometrie en afzonderlijke onderdelen. [Meting en bron](docs/bim-referentie.md)

De drie tekenweergaven gebruiken hetzelfde elementmodel. Sleep of gebruik de pijltjestoetsen om het model te draaien. **Elementblad** opent de afdrukweergave met bovenaanzicht, doorsnede, maatvoering, reserveringen en hoeveelheden. Kies in het afdrukvenster voor PDF om een bestand te bewaren. De maatlabels geven millimeters aan.

### Afwatering tekenen

Kies bij **Afwatering** een rechthoekige langsgoot of een V-goot in het loopvlak. Vul de breedte, verticale diepte en afstand van de vrije rand tot de buitenste lip in. Met **V-waterhol onderzijde** teken je op dezelfde manier een afzonderlijke druipgroef. Beide details lopen evenwijdig aan de gevel en eindigen bij de werkelijke plaatcontour. De uitsparingen zijn zichtbaar op het elementblad en in de 3D-geometrie van de IFC. Het elementpaneel toont het uitgespaarde volume in liters en de resterende hoeveelheid beton in m³.

Met **HWA-reservering** plaats je het hart van een toekomstige afvoer op de gootbodem. Zonder langsgoot ligt het punt op de vrije rand. De invoer loopt van 0% links tot 100% rechts op de plaatselijke plaatbreedte. Tekening en IFC geven de coördinaten door. Voor een fysieke doorvoer kies je bij de verdere engineering een afvoerpot en bijbehorende sparingsmaat. Het gemeten Hi-Con-profiel bevat zijn eigen waterhol.

Voorbeeld GP-A01 is een galerijplaat van 3.600 × 1.800 mm met een langsgoot van 120 × 20 mm en een waterhol van 16 × 8 mm. De twee uitsparingen nemen samen 8,8704 liter beton weg. Het netto volume is 1,0765296 m³. [Elementblad](examples/GP-A01.pdf) · [IFC4](examples/GP-A01.ifc) · [Fabrikantdetails en metingen aan 3D-bestanden](docs/afwatering.md)

## Fabrikantprofielen en BIM

- **Generiek** bewaart het element zonder leverancierselectie.
- **Olbecon** vergelijkt balkonlengte, diepte en berekende massa met respectievelijk 10.000 mm, 3.000 mm en 17.000 kg. Een overschrijding blijft zichtbaar en het ontwerp blijft bewerkbaar. De bron noemt deze waarden specifiek voor balkons. [Olbecon](https://www.olbecon.nl/prefab/balkons-en-galerijplaten)
- **Vebo** vergelijkt het afschot met het vlakke loopvlak van het standaardbalkon en benoemt de uit te werken ringgoot en randdetails. Het is een referentieprofiel. [Vebo standaardbalkon en Revit-tool](https://www.vebo.nl/balkonconcept)
- **OMG Prefabbeton** vergelijkt zowel balkons als galerijen met de algemene productiematen van het atelier (10.000 × 4.500 mm en 16.000 kg). Voor de uitvoering met klokput laat de app zien of de goot en HWA-positie zijn ingetekend. [OMG, producten en productiemogelijkheden](https://www.omgprefabbeton.be/)
- Een daadwerkelijk IFC2X3-fabrikantmodel van **Hi-Con Basic Line** is onderzocht op onder meer plaattype, randgeometrie en de betekenis van oppervlaktes. [Modelvergelijking met meetpunten en bronbestand](docs/bim-referentie.md)
- De Nederlandse informatiekaart voor balkon- en galerijplaten onderbouwt de keuze voor `IfcSlab`, bouwlaag, elementmerk, maatvoering en voorzieningen. [Henselmans, informatiekaart p. 22](https://henselmans.nl/uploads/disk-162-cms/Downloads/BIM/HENSELMANS%20BIM%20Informatiekaarten%20V1.2-compressed.pdf)

**Exporteer IFC4** schrijft één gesloten betonlichaam als `IfcSlab/FLOOR`, in een bouwlaag met de ingevoerde naam. Het bestand bevat materiaal, lokale plaatsing, projectieoppervlak, betonvolume en indicatieve massa. Het peil is lokaal. Na heropenen van het ontwerp of een maatrevisie houdt het element dezelfde IFC-identiteit.

**Opslaan** bewaart de instellingen in ontwerpformaat 0.4 als bewerkbaar `.opc.json`-bestand. De app herstelt het laatste lokaal bewaarde concept bij opnieuw openen. Bestanden uit de Windows-app 0.4.1 (ontwerpformaat 0.3) behouden de bestaande doorsnede en IFC-identiteit. Dat geldt ook voor ontwerpen met constante dikte uit formaat 0.2. Concepten uit 0.1 krijgen bij migratie een identiteit. **Nieuw** start een afzonderlijk element.

## Feedback in de app

**Feedback** in de titelbalk opent een Nederlands formulier voor fouten, ideeën en vragen. Open Feedback Studio verzorgt de koppeling met de openbare GitHub-repository. Het formulier vermeldt vooraf welke velden meegaan en bewaart de invoer bij een fout. Verzending wordt alleen ingeschakeld met een bevestigd app-id in de centrale dienst. De Windows- en webversie staan voor feedback dezelfde HTTPS-bestemming toe. [Open Feedback Studio](https://open-feedback-studio.pages.dev)

## Basis uit Open Stair Studio

Overgenomen uit de lokale Open Stair Studio-distributie zijn de OpenAEC Blueprint-ontwerptokens. Bron en licentie staan in `public/blueprint`. Net als in de prefabtrapmodule leidt `build()` uit de gecontroleerde parameters de geometrie en hoeveelheden af. De applicatiecode staat in `src/`, de gedeelde OpenAEC-stijlen in `public/`. De webeditor heeft een eigen plaatmodel, tekenmodule en IFC4-schrijver.

## Controles herhalen

Gebruik op de ontwikkelmachine Node.js, npm, Edge en uv.

```powershell
npm ci
npm run verify
```

De installatie is alleen nodig voor de ontwikkelcontroles. De volledige controle voert de modeltests uit, opent de lokale HTML-pagina in Edge, bedient de editor en controleert de IFC4-bestanden met IfcOpenShell. De onafhankelijke inspectie gebruikt Python 3.12 via uv. Voor geïnstalleerd Chrome in plaats van Edge kun je `OPCS_BROWSER=chrome` instellen.

Voorbeeld GP-Z01 heeft een afgeschuinde hoek van 450 × 450 mm en een opstand van 80 × 140 mm. Oppervlak in plan is 8,17875 m², volume 1,68727 m³ en verval 27 mm. Het meegeleverde IFC-bestand is heropend en nagemeten. De PDF bevat één liggend A4-elementblad.

Voor een onafhankelijke vergelijking met het oorspronkelijke fabrikantbestand, download je het IFC2X3-model uit de onderzoeksnotitie en voer je `npm run test:ifc -- --source-reference "pad/naar/fabrikant.ifc"` uit.

## Repository en distributie

De applicatie gebruikt de AGPL-3.0-licentie. De meegeleverde Blueprint-tokens hebben een eigen bronvermelding en licentie. [Applicatielicentie](LICENSE) · [Blueprint](public/blueprint/NOTICE.txt)

GitHub Actions voert de model-, browser- en IFC-controles uit bij een push naar `main` en bij pull requests. Voor een release bouwt GitHub de Windows x64-installer met Tauri en NSIS. De installatietest start het geïnstalleerde programma, tekent een balkonplaat en controleert het geëxporteerde bestand met IfcOpenShell. Na de geslaagde controles publiceert de releaseworkflow de installer, de webversie als ZIP en `SHA256SUMS.txt`. [Releasenotities](https://github.com/OpenAEC-Foundation/open-precast-concrete-studio/blob/main/.github/release-notes.md)

Lokaal bouw je de installer op Windows met Node.js, Rust voor MSVC, de Visual Studio C++ Build Tools en WebView2. Voer `npm ci` en `npm run desktop:build` uit. De installer verschijnt in `target/release/bundle/nsis/`. De webversie verpak je met `py scripts/package-release.py`.
