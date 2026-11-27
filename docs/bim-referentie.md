# BIM-referentie voor een Nederlands prefab balkon

Op 27 november 2026 is het openbare IFC-model van het Hi-Con Basic Line conceptbalkon met basis-Isokorf onderzocht. Hi-Con geeft voor deze uitvoering een nominale maat van 2.200 × 2.000 mm, eenzijdig afschot vanaf de gevel en een Gian-antislipafwerking op. Een opstand valt bij dit product onder maatwerk. [Productpagina en modelkeuze](https://www.hi-con.com/nl/producten/concept-balkons/)

## Wat staat in het bestand?

De IFC-header vermeldt IFC2X3 en een exportdatum van 25 april 2024. Het bestand is 404.057 bytes groot. De SHA-256 is `122f946af3e3f12f2e2ea84546fe76f3053b97a1f94c7878ddeccc86ba5296ca`. [Origineel IFC-bestand van Hi-Con](https://www.hi-con.com/media/jzod25co/hi-con-2000x2200x65-115-basis-isokorf.ifc)

| Gecontroleerd in STEP | Uitkomst | Gevolg voor Open Precast Concrete Studio |
|---|---|---|
| Element en geometrie | Eén `IfcSlab` (#15116) van het type `FLOOR`. Zijn Body (#15102) bevat 29 `IfcFacetedBrep`-lichamen. | Onze IFC4-export kiest eveneens `IfcSlab/FLOOR`. Hij geeft het door de gebruiker ontworpen betonlichaam door. Losse leveranciersdetails vereisen aanvullende geometrie en identificatie. |
| Fabrikant en materiaal | De fabrikant is als `Hi-con` ingevuld. Het materiaal heet `beton_staalvezelbeton_prefab-element`. | Een fabrikantprofiel moet onderscheid maken tussen een verwijzing naar een leverancier en de identiteit van een specifiek product. |
| Hoeveelheden | `BaseQuantities` (#15182) geeft 0,476037744 m³ `NetVolume` en 8,423054 m² `NetArea` op. De nominale rechthoek is 4,40 m². | Ons veld voor oppervlakte meet de horizontale projectie. Het verschil laat zien waarom een vergelijking ook de definitie van het meetvlak vereist. De gebruikte oppervlaktemethode is uit deze waarden alleen niet vast te stellen. |
| Plaatrand | Op het breedste lichaam (#14918), lokaal bij X = 0 en Y = 0, liggen hoekpunten op Z = 252,1 en 317,1 mm. Bij X = 0 en Y = 2.210 liggen ze op Z = 230 en 360 mm. | Versie 0.3 bevat het gemeten doorsnedeprofiel met 65 mm aan de vrije rand en 130 mm bij de gevel. |
| Buitenligging | De eigenschap `Pset_SlabCommon.IsExternal` staat op `FALSE` in de fabrikantuitvoer. | Open Precast zet deze eigenschap voor zijn buitenplaten op `TRUE`. Een bronvergelijking moet zo'n verschil zichtbaar maken. |

## Zo is de vergelijking gemaakt

Het fabrikantbestand is als STEP-tekst ingelezen. Vanaf de plaat zijn de verwijzingen naar de vormrepresentatie, de grensvlakken en de lokale hoekpunten gevolgd. De lengte-eenheid in de projecttoewijzing is millimeter. Voor de hoeveelheden is de relatie van #15116 naar #15182 gevolgd. De genoemde hoogteverschillen zijn lokaal aan de uiteinden gemeten en omvatten de aanwezige randdetails. De vermelde hoeveelheden zijn door de fabrikant geëxporteerde waarden.

Voor deze vergelijking is één montagevariant gebruikt. De leverancierspagina biedt ook aparte bestanden voor onder andere de stalen schoen en de trekstang. Dit onderzoek bepaalt geen toelaatbare belasting of afmetingen voor andere balkons. [Uitvoeringen bij Hi-Con](https://www.hi-con.com/nl/producten/concept-balkons/)

## Doorsnede en volumes van het referentievoorbeeld

De meting voor versie 0.3 volgt een verticale snede door lichaam #14918 bij bron-X = 1.000 mm. De verbindingen steken voorbij bron-Y = 2.210 mm uit. Dat is de gevelzijde. Voor de editor is de diepte vanaf de gevel gelijk aan 2.210 − bron-Y. De lokale hoogte is bron-Z − 339,2 mm. De gevelneus heeft bovenop 45 mm vlak gedeelte, gevolgd door een afschuining. Aan de onderzijde ligt het waterhol circa 35 tot 45 mm uit de vrije rand.

| Meting | Waarde |
|---|---:|
| Oppervlak van de gemeten doorsnede | 193.632,71 mm² |
| Volume van de snede doorgetrokken over 2.200 mm (voorbeeld BP-P01) | 0,425991962 m³ |
| Geometrisch volume van het betonlichaam #14918 in de bron | 0,425958153 m³ |
| NetVolume in de hoeveelhedenstaat van de volledige productexport | 0,476037744 m³ |

Het verschil van circa 34 cm³ tussen het referentievoorbeeld en het oorspronkelijke betonlichaam komt naar voren bij de driedimensionale vergelijking. De editor herhaalt één doorsnede over de lengte. Bij de onafhankelijke controle op de doorsnede zijn ook beide flanken van het waterhol en de afschuining van de gevelneus meegenomen. [Voorbeeldbestand](../examples/BP-P01.ifc) · [Onafhankelijke IFC-controle](https://github.com/OpenAEC-Foundation/open-precast-concrete-studio/blob/main/tests/verify-ifc.py)
