# Afwatering van prefab balkon- en galerijplaten

De langsgoot vangt water op uit het loopvlak. Het waterhol onder de plaat onderbreekt de weg van afdruipend water langs de onderzijde. De hemelwaterafvoer (HWA) sluit aan op het afvoerstelsel. Voor de uitbreiding zijn deze drie functies op 27 november 2026 vergeleken aan de hand van fabrikantdetails, een Revit-handleiding en twee gedownloade 3D-modellen.

## Welke uitvoeringen leveren producenten?

| Bron | Detail dat het ontwerp beïnvloedt |
|---|---|
| Betonhuis, *Handboek Prefab Beton*, §5.5 | De schetsen op p. 83 tonen diagonaal afschot naar een punt, of dwarsafschot naar een goot evenwijdig aan de gevel. De goot kan in lengterichting vlak zijn. De positie van de HWA hangt onder meer af van de gekozen afvoer en onderliggende consoles. Een blijvende toog kan bij een afvoer in het midden water aan de uiteinden laten staan. [Handboek, p. 82–83](https://handboek-prefab-beton.betonhuis.nl/Documenten/deel5-5.pdf) |
| FEBE, *Architectonisch beton. Gids voor architecten en voorschrijvers*, §3.3 | Bij het beschreven profiel loopt het vlak 1,5–2% vanaf het gebouw af. Aan de voorzijde verzamelt een geul het water. De getekende ronde balkonplaat heeft een goot, spuwer en afzonderlijke druipgroef. [Gids, p. 47–49](https://www.febe.be/wp-content/uploads/2024/04/Gids-voor-architecten-en-voorschrijvers.pdf) |
| Vebo Beton, standaard balkonconcept | Vebo combineert een vlak loopvlak met een gevormde ringgoot. Het balustradedetail toont een verdieping bovenin en een waterhol onderin. De Revit-handleiding van september 2024 toont hoe per randsegment de start, lengte en aansluiting op het volgende segment worden vastgelegd. De family toont de uitgewerkte rand en goten op detailniveau Medium en Fine. [Concept](https://www.vebo.nl/balkonconcept) · [Randdetail 1](https://www.vebo.nl/hubfs/Detail%201.2.png) · [Revit-handleiding, p. 1–3](https://www.vebo.nl/hubfs/8.%20Vebo/Vebo%20-%20Downloads/Revit-Handleiding-Balkonconcept.pdf) |
| OMG Prefabbeton, Dessel | Voor terrassen, balkons en gaanderijen biedt OMG een geïntegreerde goot met klokput en een te kiezen aansluitpunt. De fabrikant werkt de elementen projectspecifiek in 3D uit. Dit ondersteunt een vrij te positioneren HWA-reservering in het schetsontwerp. [Producten en BIM-werkwijze](https://www.omgprefabbeton.be/) |
| HCI Betonindustrie en Olbecon | HCI noemt afschot, afvoer en doorvoer als ontwerpkeuzes. Olbecon kan door de klant aangeleverde hemelwaterafvoeren instorten. Voor de sparingsvorm en -maat is dus een gekozen afvoerproduct nodig. [HCI, balkons en galerijplaten](https://www.hcibeton.nl/woningbouw/producten/balkons-galerijplaten-en-consoles/) · [Olbecon, inbouwdelen](https://www.olbecon.nl/prefab/balkons-en-galerijplaten) |

Een concreet maatvoorbeeld komt uit de **DYKA-catalogus 2019**, p. 406. Bij de getekende balkondoorvoer staat voor de bovenmaat C **130 mm**, voor de onderste diameter d **77 mm** en voor L **100 mm**. Voor een fysieke doorbreking zijn de inbouwtekening van de gekozen pot en de aansluiting op de leiding bepalend. De HWA-markering in de editor geeft de plaats voor die uitwerking door. [DYKA, maatvoering p. 406](https://www.dyka.nl/media/documents/catalogus-2019-maatvoering-nl.pdf#page=22)

## Controle van gedownloade modellen

**Vebo, rechthoekig balkon in de productselector.** Na uitlezen van de ingebedde glTF-buffers en samenvoegen van samenvallende hoekpunten bevat het kijkmodel acht unieke hoekpunten en twaalf driehoeken. Alle zes buitenvlakken zijn vlak. De voorbeeldgeometrie geeft de hoofdvorm weer. De producttekening en de Revit-handleiding leveren de informatie over de goot. Het onderzochte bestand telt 5.895 bytes en heeft SHA-256 `0e3c2f6bc79c91fa5491640cf59821010e1f6cb79f590cdd0fc5545bf4059c13`. [Productselector](https://productselector.vebo.nl/balkonconcept/balkonplaat-standaard/) · [Origineel glTF-bestand](https://productselector.vebo.nl/wp-content/uploads/Balkonplaat-Rechthoekig-1.gltf)

**Hi-Con, Comfort Line met basis-Isokorf.** In het IFC2X3-bestand verwijst plaat #15354 naar 29 vormonderdelen. Met IfcOpenShell is het grootste betonlichaam (#15156) apart gemeten. Het omhult 2.600 × 2.210 mm in het horizontale vlak en heeft een volume van **0,503394525 m³**. Het bestand telt 410.756 bytes en heeft SHA-256 `d83ab0a9cc9454f35f9d96e3204a5f185cb7b168dd7b8daded5b54761aea14bb`. [Comfort Line, origineel IFC](https://www.hi-con.com/media/5h1nybya/hi-con-2000x2600x65-115-basis-isokorf.ifc) · [Uitvoeringen van Hi-Con](https://www.hi-con.com/nl/producten/concept-balkons/)

De tabel geeft de snijpunten van verticale meetlijnen met het betonlichaam bij bron-X = 1.300 mm. Bron-Y begint aan de vrije rand. Alle maten zijn in millimeters en Z is lokaal in het fabrikantbestand.

| Afstand vanaf vrije rand | Z onderzijde | Z bovenzijde |
|---:|---:|---:|
| 34 | 251,760 | 317,440 |
| 36 | 253,442 | 317,460 |
| 40 | 256,030 | 317,500 |
| 44 | 253,422 | 317,540 |
| 46 | 251,640 | 317,560 |

Bij 40 mm loopt de onderzijde **4,330 mm** omhoog ten opzichte van de doorgetrokken onderlijn op Z = 251,700 mm. De bovenzijde volgt over deze meetpunten één rechte lijn. Dit laat de ligging van het waterhol zien. De [eerdere meting aan de Basic Line](bim-referentie.md) beschrijft de andere plaatlengte.

## Wat de editor uitwerkt

De generieke langsgoot ligt boven en loopt evenwijdig aan de gevel. De tekenaar kiest een rechthoekige of V-vormige uitsparing, de inwendige breedte, verticale diepte en afstand tot de vrije rand. Een apart V-vormig waterhol ligt onder. De profielen lopen tot de snijding met de gekozen plaatcontour. Ze hebben een constante diepte in de lengterichting. De uitgewerkte Vebo-ringgoot, een goot met eigen langsafschot en de hydraulische dimensionering vragen ieder een eigen uitwerking.

**Rekenvoorbeeld met gekozen ontwerpmaten.** Een rechthoekige plaat van 3.200 × 1.600 × 180 mm bevat bruto **0,921600 m³**. Een rechthoekige langsgoot van 100 × 15 mm over 3.200 mm neemt **0,004800 m³** beton weg. Een V-waterhol van 15 × 8 mm over dezelfde lengte neemt de helft van zijn omhullende rechthoek weg, **0,000192 m³**. Netto resteert **0,916608 m³**. Met een V-goot van dezelfde breedte en diepte resteert **0,919008 m³**. Beide uitkomsten zijn vergeleken met het plaatmodel.
