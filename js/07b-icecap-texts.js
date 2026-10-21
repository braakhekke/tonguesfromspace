/* =====================================================================
   7b. The texts of the glaciers of the ice-cap regions (Vatnajökull, the rest of Iceland, Svalbard, mainland Norway)
       One record per glacier, shown by renderStoryIcecap (js/07a-region-icecaps.js): lede (the line under the name), look (What to look for), news (In the news), fact (Did you know?),
       name (The name), front (a documented retreat of the front for the video facts) and groups (extra stat cards). Every sentence is a documented fact with its source (the numbered notes,
       gfn); a record has only the parts that could be documented, the page leaves out the rest. Wikipedia is quoted with its licence (CC BY-SA 4.0) and "with the sources named there".
       Figures that come from the data files of the page (area, length, heights, the lowest point) are not repeated here: the Stats tab and the automatic part of What to look for show them.
   ===================================================================== */
const wpLink = (page, label) => `<a href="https://en.wikipedia.org/wiki/${encodeURI(page.replace(/ /g, '_'))}" target="_blank" rel="noopener">${label || page}</a>`;
const wp = (...pages) => gfn(`Wikipedia, ${pages.map(p => Array.isArray(p) ? wpLink(p[0], p[1]) : wpLink(p)).join(' and ')} (CC BY-SA 4.0), with the sources named there`);
const doiSrc = (cite, doi) => gfn(`${cite} ${lnk('https://doi.org/' + doi, 'doi:' + doi)}`);
const IS_WIKI_BR = 'Wikipedia, <a href="https://en.wikipedia.org/wiki/Brei%C3%B0amerkurj%C3%B6kull" target="_blank" rel="noopener">Breiðamerkurjökull</a> (CC BY-SA 4.0), with the sources named there';
const IS_WIKI_JL = 'Wikipedia, <a href="https://en.wikipedia.org/wiki/J%C3%B6kuls%C3%A1rl%C3%B3n" target="_blank" rel="noopener">Jökulsárlón</a> (CC BY-SA 4.0), with the sources named there';
const JOKULL_2020 = () => gfn(`Jökull (the journal of the Icelandic Glaciological Society and the Geoscience Society of Iceland), 2020, on the surges of Brúarjökull and Dyngjujökull: ${lnk('https://timarit.is/page/7864182', 'timarit.is')}`);
const IC_INFO = {
  /* ---------------- Vatnajökull ---------------- */
  breidamerkurjokull: {
    lede: () => 'The big outlet of the Vatnajökull ice cap that ends in the glacier lagoon Jökulsárlón. Its front has pulled back 4 to 7 km since about 1890, and the lagoon has grown in its place.',
    look: () => `Find the lagoon Jökulsárlón at the foot of the glacier and follow the ice front from year to year: where the ice pulls back, the lagoon grows. The lagoon covered about 8 km² in 1975 and 17.5 km² in 2004${gfn(IS_WIKI_BR)}. Icebergs break off the front and float in the lagoon before they reach the sea.`,
    news: () => `On 25 August 2024 an ice wall collapsed in a ravine outside an ice cave on Breiðamerkurjökull: one tourist died and another was seriously injured. The accident started a debate about ice cave tours in Iceland${gfn(IS_WIKI_BR + ' (reports of the BBC and of Icelandic media)')}.`,
    fact: () => `When the first settlers came, around 900 AD, the tongue of the glacier lay about 20 km further north than today's coast. During the Little Ice Age (about 1600 to 1900) it advanced until its front was about 1 km from the coast, near the river Jökulsá, around 1890${gfn(IS_WIKI_BR)}.`,
    name: () => `Breiðamerkurjökull means roughly "glacier of the wide woodland" (Breiðamörk)${gfn(IS_WIKI_BR)}. Jökulsárlón is the "glacier river lagoon": it began to form in 1933 or 1934, in the hollow that the retreating ice left${gfn(IS_WIKI_JL)}.`,
    front: {label: 'FRONT SINCE ~1890', value: '4–7', unit: 'km'},
    lowest: {text: `where the front ends in the lagoon, at sea level${gfn(IS_WIKI_JL)}`, d: 'the front ends in the lagoon, at sea level', f: 'is_wiki'},
    groups: () => [
      ['change', 'Since about 1890', '4–7 <small>km</small>', [
        {hero: true, loss: true, v: '4–7', s: 'km', k: 'Retreat of the front since about 1890', f: 'is_gudm'},
        /* CHECK (external-numbers rule): '0.95 km² a year' looks calculated, not quoted; compare with Guðmundsson et al. 2017 before keeping it */
        {v: '115', s: 'km²', k: 'Land exposed', d: 'by the retreat, 0.95 km² a year', f: 'is_gudm'},
        {v: '70 ± 8', s: 'km³', k: 'Ice lost (water equivalent)', d: 'about two thirds after the mid 20th century', f: 'is_gudm'},
        {v: '−0.6', s: 'm w.e. a⁻¹', k: 'Mass balance, 1890 to 2010', d: '± 0.1, mean over the whole glacier', f: 'is_gudm'},
        {v: 'up to 200', s: 'm', k: 'Lowering of the lowest ice', d: 'above 1,500 m the change is small', f: 'is_gudm'}]],
      ['drop', 'The lagoon Jökulsárlón', 'about 25 <small>km²</small>', [
        {hero: true, v: 'about 25', s: 'km²', k: 'Lagoon area today', f: 'is_wiki', d: '8 km² in 1975, 17.5 km² in 2004'},
        {v: '284', s: 'm', k: 'Greatest depth', d: 'as reported in 2009', f: 'is_wiki'},
        {v: '1933–34', k: 'Began to form', d: 'in the hollow of the retreating ice', f: 'is_wiki'}]]]
  },
  skeidararjokull: {
    lede: () => 'The outlet of Vatnajökull that flows south to the black outwash plain Skeiðarársandur. Its basin is the largest of the ice cap.',
    look: () => `Between the end of the glacier and the sea lies Skeiðarársandur, an outwash plain of sand and ash 20 to 30 km wide, built by the Skeiðará and other rivers that the glacier feeds${wp('Skeiðarársandur')}. Follow the front from year to year and watch the plain, not only the ice.`,
    news: () => `In 1996 an eruption of the volcano Grímsvötn under Vatnajökull set off the latest big glacier flood of the Skeiðará. At its peak 45,000 m³ of water a second came down, and the bridge of the Ring Road was damaged by blocks of ice as big as houses. Nobody was hurt: scientists had followed the volcano closely${wp('Skeiðará')}.`,
    fact: () => `The Skeiðará was the main obstacle in the building of Iceland's Ring Road. Only in 1974 could it be closed, with a bridge 904 m long, which Wikipedia calls the longest in Iceland${wp('Skeiðarársandur')}.`,
    name: () => `Skeiðarárjökull is the glacier of the river Skeiðará: the river has its source on the glacier${wp('Skeiðará')}. The word jökull means glacier.`
  },
  bruarjokull: {
    lede: () => 'A big outlet on the northern side of the ice cap, the second largest basin of Vatnajökull. It is one of the glaciers that make sudden advances.',
    look: () => `Look for the long, flat tongue pointing north-east into the highlands, and compare its front from year to year. In 1963–1964 Brúarjökull advanced close to 10 km in a surge, the largest surge in Iceland since the end of the Little Ice Age${JOKULL_2020()}.`,
    fact: () => `A surge is a sudden advance of a glacier that is not caused by the weather. Brúarjökull and Dyngjujökull have both surged, and their surges have shaped the northern margin of the ice cap${JOKULL_2020()}.`
  },
  dyngjujokull: {
    lede: () => 'The outlet that flows north from Vatnajökull towards the volcano Askja and the lava field Holuhraun.',
    look: () => `The glacier lies between the volcanoes Bárðarbunga, Askja and Kverkfjöll, and its meltwater flows into the river Jökulsá á Fjöllum, the second longest river of Iceland${wp('Dyngjujökull')}. Just north of the front lies the lava field Holuhraun${wp('Holuhraun')}.`,
    news: () => `On 29 August 2014 an eruption started in Holuhraun, just north of Dyngjujökull, at the end of a magma intrusion that had moved north from the volcano Bárðarbunga since 16 August. It made a lava field of more than 85 km² (1.4 km³), the largest in Iceland since 1783${wp('Holuhraun')}. On 6 September 2014 scientists found depressions in the ice of Dyngjujökull that raised the question whether eruptions were taking place under the glacier${wp('Dyngjujökull')}.`,
    fact: () => `Surges of Dyngjujökull and of Brúarjökull have shaped the northern margin of Vatnajökull${JOKULL_2020()}.`,
    name: () => `Dyngjujökull is translated as "shield volcano glacier"${wp('Dyngjujökull')}.`
  },
  sidujokull: {
    lede: () => 'The inventory holds Síðujökull and Skaftárjökull as one basin. The tongue shown is the one that reaches lowest, Síðujökull, on the southern side of the ice cap.',
    look: () => `Skaftárjökull, in the same basin, has two ice cauldrons over subglacial lakes; they are the main source of the river Skaftá${wp('Skaftá')}.`,
    news: () => `In 2015 the river Skaftá had its biggest flood since records began, a jökulhlaup (glacial outburst flood) from the ice cauldrons under Skaftárjökull. Such floods come every one to two years from the western or the eastern cauldron${wp('Skaftá')}.`
  },
  koldukvislarjokull: {
    lede: () => 'An outlet on the western side of Vatnajökull, the sixth largest basin of the ice cap, ending higher than the big outlets: its lowest ice lies at about 900 m.'
  },
  tungnaarjokull: {
    lede: () => 'An outlet on the south-western side of Vatnajökull. The river Tungnaá starts at the western edge of the ice cap.',
    look: () => `The river Tungnaá flows from the western edge of Vatnajökull to the reservoir Sultartangalón and has been used extensively for hydroelectricity, with power stations at Vatnsfell, Sigalda, Hrauneyjafoss and Sultartangi${wp('Tungnaá')}.`
  },
  heinabergsjokull: {
    lede: () => 'Heinabergsjökull and Skálafellsjökull, two outlets side by side on the south-eastern side of Vatnajökull, shown as one unit. The inventory has them as two basins, without names.'
  },
  hoffellsjokull: {
    lede: () => 'An outlet of Vatnajökull in the south-east of Iceland, in the municipality of Hornafjörður. The inventory has its basin without a name.',
    look: () => `Hoffellsjökull and the Hoffell area are part of Vatnajökull National Park${wp('Hoffellsjökull')}.`,
    name: () => `Hoffellsjökull takes its name from Hoffell, a mountainous area and a farmland${wp('Hoffellsjökull')}.`
  },
  svinafellsjokull: {
    lede: () => 'An outlet that flows from the ice cap Öræfajökull, at the south of Vatnajökull, near Skaftafell. The inventory has its basin without a name.'
  },
  sylgjujokull: {
    lede: () => 'An outlet on the western side of Vatnajökull, the tenth largest basin of the ice cap, ending high: its lowest ice lies at about 900 m.'
  },
  flaajokull: {
    lede: () => 'A slow-flowing outlet on the south-eastern side of Vatnajökull, north-west of the town Höfn. The inventory has its basin without a name.',
    look: () => `Fláajökull lies on the east side of the volcano Breiðabunga, in Vatnajökull National Park, about 20 km north-west of Höfn on the map${wp('Fláajökull')}.`,
    name: () => `The name comes from flár, the Icelandic word for "slope". Earlier names of the glacier are Mýrajökull, Hólmsárjökull and Hólsárjökull${wp('Fláajökull')}.`
  },
  /* ---------------- Rest of Iceland ---------------- */
  langjokull: {
    lede: () => 'The second largest ice cap of Iceland, 50 km long, west of the highland road Kjölur. The nearest big glacier to Reykjavík.',
    look: () => `The outlets Norðurjökull and Suðurjökull reached as far as the lake Hvítárvatn until about 1900 and have retreated rapidly since${wp('Langjökull')}. Look for the lake and for the bare ground between it and today's ice.`,
    fact: () => `Langjökull covers a volcanic system. Water from the ice cap flows under ground to the lake Þingvallavatn, some 50 km to the south, and reappears in springs; two thirds of the water of the lake Hvítárvatn seem to come from Langjökull through underwater channels${wp('Langjökull')}. Some researchers believe the ice cap could disappear in about 150 years if climate change continues at its recent pace${wp('Langjökull')}.`,
    news: () => `In 1999 the outlet Eystri-Hagafellsjökull surged into a lake, which then flooded downstream${wp('Jökulhlaup')}.`,
    name: () => `Langjökull is Icelandic for "long glacier"${wp('Langjökull')}.`
  },
  hofsjokull: {
    lede: () => 'The third largest ice cap of Iceland, in the middle of the highlands between Langjökull and Vatnajökull, on top of the largest active central volcano of the country.',
    look: () => `Hofsjökull is the source of several rivers, among them the Þjórsá, the longest river of Iceland${wp('Hofsjökull')}.`,
    news: () => `While all ice caps in Iceland had lost volume since 1995, Hofsjökull gained mass in 2015, the first time in 20 years, after high precipitation and a cool summer before. Between 1989 and 2015 it had still lost about 12 % of its volume of 1989${wp('Hofsjökull')}.`,
    name: () => `Hofsjökull is Icelandic for "temple glacier"${wp('Hofsjökull')}.`
  },
  myrdalsjokull: {
    lede: () => 'The ice cap on top of the volcano Katla in the south of Iceland, north of the village Vík í Mýrdal.',
    look: () => `The ice cap covers the caldera of Katla, 10 km across. The recession of the ice cap is driven mainly by summer temperature, which the length of its outlet Sólheimajökull also shows${wp('Mýrdalsjökull')}. The ice cap covered about 595 km² in 1980 and 520 km² in 2019${wp('Mýrdalsjökull')}.`,
    fact: () => `Katla erupts usually every 40 to 80 years; the last eruption was in 1918. Floods from under the ice cap have reached the plains in front of it: after the eruption of 1918 the coastline was extended by 5 km${wp('Mýrdalsjökull')}.`,
    news: () => `Scientists have watched Katla closely since the eruption of the neighbouring Eyjafjallajökull in April 2010${wp('Mýrdalsjökull')}.`,
    name: () => `Mýrdalsjökull is Icelandic for "(the) mire dale glacier" or "mire valley glacier"${wp('Mýrdalsjökull')}.`
  },
  drangajokull: {
    lede: () => 'The northernmost glacier of Iceland, in the Westfjords. It is the only ice cap of Iceland that lies entirely below 1,000 m.',
    look: () => `Drangajökull sits on the southern foothills of the Hornstrandir peninsula. Its outlets can surge: they sometimes advance while the ice cap as a whole shrinks${wp('Drangajökull')}.`,
    fact: () => `Airborne lidar maps show that Drangajökull has lost about 1.19 km³ of ice, an average thinning of 8.0 m, since about 1990, even as its surge-type outlet glaciers periodically advance${wp('Drangajökull')}.`
  },
  eyjafjallajokull: {
    lede: () => 'A small ice cap that covers the crater of a volcano in the south of Iceland, west of Mýrdalsjökull.',
    look: () => `The main outlets flow north: Gígjökull, into the lagoon Lónið, and Steinsholtsjökull, into the lagoon Steinsholtslón${wp('Eyjafjallajökull')}.`,
    news: () => `The volcano under the ice erupted in 2010. On 14 April 2010 it began to erupt from the crater under the ice, sending meltwater floods down the rivers, and the ash caused enormous disruption to air travel across northern and western Europe for about a week${wp('Eyjafjallajökull')}.`,
    fact: () => `The ice cap of Eyjafjallajökull and the one of Mýrdalsjökull were one ice cap at the end of the 19th century and separated in the middle of the 20th century${wp('Mýrdalsjökull')}.`,
    name: () => `Eyjafjallajökull means "glacier of Eyjafjöll", and Eyjafjöll, "the mountains of the islands", probably refers to the nearby Westman Islands${wp('Eyjafjallajökull')}.`
  },
  tungnafellsjokull: {
    lede: () => 'A small ice cap on a volcano in the middle of the highlands, north-west of Vatnajökull.',
    look: () => `The ice cap sits on one of the two calderas of the volcano, a desert area with little vegetation. Three glacial rivers drain it${wp('Tungnafellsjökull')}.`,
    name: () => `The name is given as "Tungna-fells glacier" or "tongue-fells glacier"; the volcano is also known as Vonarskarð${wp('Tungnafellsjökull')}.`
  },
  thorisjokull: {
    lede: () => 'A small glacier on a table mountain south-west of Langjökull, above the highland road Kaldidalur.',
    look: () => `Þórisjökull is a tuya, a volcano that formed under ice in the last ice age. The glacier was probably still part of Langjökull until the end of the 18th century${wp('Þórisjökull')}.`,
    fact: () => `One can hike onto the glacier from the highest point of the Kaldidalur road, from the big cairn Beinakerlingin at 720 m${wp('Þórisjökull')}.`,
    name: () => `The name is that of the troll Þórir from Grettis saga, who is said to have lived in a cave nearby${wp('Þórisjökull')}.`
  },
  eiriksjokull: {
    lede: () => 'A small glacier on top of the biggest table mountain of Iceland, north-west of Langjökull.',
    look: () => `The ice cap reaches 1,675 m on a tuya of more than 1,000 m above its surroundings. In 2008 the edge of the ice lay at about the 1,300 m contour${wp('Eiríksjökull')}.`,
    name: () => `The glacier was called Baldjökull until about 1700. The present name probably comes from the nearby mountain Eiríksgnípa; a tale tells of an outlaw named Eiríkur who ran into that mountain to escape capture${wp('Eiríksjökull')}.`
  },
  thrandarjokull: {
    lede: () => 'A small glacier in the east of Iceland, 20 km north-east of Vatnajökull.',
    fact: () => `Between the Little Ice Age maximum of 1890 and 2019 the area of Þrándarjökull fell from 35 km² to 14.2 km²${wp('Þrándarjökull')}.`
  },
  tindfjallajokull: {
    lede: () => 'A small glacier on the volcano Tindfjöll in the south of Iceland.',
    look: () => `The glacier was mapped at about 22.6 km² at its maximum in the 1890s; by 2019 its area had fallen by 45 %. Between 1994 and 2006 an unnamed outlet in the valley Eystri Botná showed signs of surging before it retreated again${wp('Tindfjallajökull')}.`,
    name: () => `Tindfjallajökull means "Tindfjöll glacier"; Tindfjöll, "peak mountains", is the ridge south of the glacier. The highest peak, Ýmir (1,462 m), is named after the giant Ýmir of Norse mythology${wp('Tindfjallajökull')}.`
  },
  /* ---------------- Mainland Norway ---------------- */
  jostedalsbreen: {
    lede: () => 'The largest glacier in continental Europe: an ice cap in western Norway with about 50 glacier arms, among them Nigardsbreen, Briksdalsbreen and Bøyabreen.',
    look: () => `The ice cap is fed by heavy snowfall, not by cold: that is why its arms reach down to low valleys and melt fast at their snouts${wp('Jostedalsbreen')}. Compare the arms from year to year; they do not all behave alike.`,
    news: () => `A study of the ice cap by Andreassen and others (2023) compared an elevation model from aerial photographs of 1966 with an airborne lidar model of 2020. For the three quarters of the ice cap that both cover, the area fell from 363.4 km² (1966) to 332.9 km² (2019), 8.4 % less. The glaciers lost mass at very different rates: Nigardsbreen −0.05, Austdalsbreen −0.28 and Tunsbergdalsbreen −0.36 m water equivalent a year${doiSrc('Andreassen, L. M. et al. (2023), Spatio-temporal variability in geometry and geodetic mass balance of Jostedalsbreen ice cap, Norway, Annals of Glaciology 64(90), 26–43.', '10.1017/aog.2023.70')}.`,
    fact: () => `Jostedalsbreen holds about 20 % of the glacier area of mainland Norway${doiSrc('Andreassen, L. M. et al. (2023), Annals of Glaciology 64(90), 26–43.', '10.1017/aog.2023.70')}. It is part of the Jostedalsbreen National Park, founded in 1991${wp('Jostedalsbreen')}.`
  },
  'vestre-svartisen': {
    lede: () => 'The western of the two ice caps of Svartisen, just inside the Arctic Circle in northern Norway; its outlet Engabreen reaches lower than any other glacier on the European mainland.',
    look: () => `Engabreen, an outlet of Vestre Svartisen, ended at 20 m above sea level in 2007, the lowest point of any glacier on the European mainland${wp('Svartisen')}. The ice cap owes its existence to heavy snowfall, not to cold${wp('Svartisen')}.`,
    fact: () => `NVE, the Norwegian Water Resources and Energy Directorate, has measured the mass balance of Engabreen since 1970 and runs a laboratory beneath the glacier. Water from the glacier is collected for hydropower through intakes bored under Engabreen${wp('Svartisen')}.`,
    name: () => `Svartisen means "black ice": svart, black, and is, ice. The old ice of the glacier is much darker than fresh ice and new snow${wp('Svartisen')}.`
  },
  'ostre-svartisen': {
    lede: () => 'The eastern of the two ice caps of Svartisen in northern Norway. The two are separated by the valley Vesterdalen, 1 km long.',
    look: () => `Østre Svartisen, "eastern Svartisen", lies on the other side of the valley Vesterdalen from Vestre Svartisen${wp('Svartisen')}.`,
    name: () => `Svartisen means "black ice": svart, black, and is, ice${wp('Svartisen')}.`
  },
  'sondre-folgefonna': {
    lede: () => 'The biggest of the three ice caps of the Folgefonna peninsula in Hardanger, western Norway.',
    look: () => `The largest outlets of Folgefonna are Blomstølskardbreen, Bondhusbreen and Buarbreen. Blomstølskardbreen has changed little since about 1960; Bondhusbreen and Buerbreen were growing in the 1990s and have retreated since 2000${wp('Folgefonna')}.`,
    fact: () => `Folgefonna National Park was founded on 14 May 2005. The meltwater of the glacier is bottled at the source as Isklar${wp('Folgefonna')}.`,
    name: () => `Folgefonna: folge is a thin layer of snow, fonn a mass of snow or a glacier made of snow${wp('Folgefonna')}.`
  },
  blamannsisen: {
    lede: () => 'An ice cap in Nordland, 2 km west of the Swedish border; in Lule Sami Ålmåjalosjiegŋa.',
    look: () => `Three outlet glaciers reach down from the ice cap; the eastern one ends in the lake Leirvatnet and calves into it. In the north, an ice-dammed lake sometimes drains in a jökulhlaup, an outburst flood${wp('Blåmannsisen')}.`,
    fact: () => `The ice cap is typically 200 to 400 m thick, in places more than 800 m. Its meltwater feeds Norwegian hydropower systems and the one on the Luleälven in Sweden${wp('Blåmannsisen')}.`,
    name: () => `Blåmannsisen is Norwegian for the Blåmann glacier; the Lule Sami name is Ålmåjalosjiegŋa${wp('Blåmannsisen')}.`
  },
  hardangerjokulen: {
    lede: () => 'A glacier in Vestland county, about 5 km south of the village Finse, which has a station on the Bergen Line.',
    look: () => `The ice was up to 380 m thick when measured and has been getting thinner during the 20th century. The glacier can be reached on skis from Finse station on the Bergen Line${wp('Hardangerjøkulen')}.`,
    fact: () => `Hardangerjøkulen was a filming location of the film Star Wars: Episode V – The Empire Strikes Back (1980), for the scenes of the ice planet Hoth${wp('Hardangerjøkulen')}.`,
    name: () => `Hardangerjøkulen means "Hardanger glacier"${wp('Hardangerjøkulen')}.`
  },
  myklebustbreen: {
    lede: () => 'An ice cap north-west of Jostedalsbreen in Vestland, on the mountain Snønipa.',
    look: () => `Myklebustbreen and Jostedalsbreen are both part of the Jostedalsbreen National Park and are separated by the valley Stardalen${wp('Myklebustbreen')}.`,
    name: () => `The glacier is officially called Myklebustbreen, but because it sits on the mountain Snønipa it is also known as Snønipbreen${wp('Myklebustbreen')}.`
  },
  okstindbreen: {
    lede: () => 'The biggest of the 19 glaciers of the Okstindan mountains in Nordland, near Oksskolten, the highest mountain of northern Norway.',
    news: () => `Okstindbreen shrank by 31 % in ten years: from 53.6 km² in 2012 to 36.9 km² in 2022${wp('Okstindbreen')}.`,
    look: () => `Okstindbreen is an ice field with several arms. The largest outlet, Austre Okstindbreen, drains towards the valley Oksfjelldalen${wp('Okstindbreen')}.`
  },
  oksfjordjokelen: {
    lede: () => 'A glacier on the border of Troms and Finnmark in the far north of Norway, in Northern Sami Ákšovuonjiehkki.',
    fact: () => `Its highest point was 1,204 m above sea level; because the glacier has shrunk it is now 1,191 m${wp('Øksfjordjøkelen')}.`,
    look: () => `The village Alteidet lies nearby along the European route E6${wp('Øksfjordjøkelen')}.`
  },
  'nordre-folgefonna': {
    lede: () => 'The northern of the three ice caps of Folgefonna in Hardanger, western Norway.',
    look: () => `Summer skiing is possible on the northern part of Folgefonna. The glaciers are protected in Folgefonna National Park, founded on 14 May 2005${wp('Folgefonna')}.`,
    name: () => `Folgefonna: folge is a thin layer of snow, fonn a mass of snow or a glacier made of snow${wp('Folgefonna')}.`
  },
  /* ---------------- Svalbard ---------------- */
  storisstraumen: {
    lede: () => 'The largest glacier unit in the inventory of the Norwegian Polar Institute: a big outlet from the centre of the ice cap Austfonna on Nordaustlandet.',
    news: () => `Storisstraumen has been surging since 2012, into the strait Erik Eriksenstretet${gfn(NPI_NAMES_SRC)}. The area of the glacier unit grew from 1,230 km² in 2001–2010 to 1,413 km² in 2020${fn('sj_npi')}.`
  },
  brasvellbreen: {
    lede: () => 'A glacier 45 km long that streams south from the dome Sørdomen of Austfonna on Nordaustlandet and ends in the sea.',
    news: () => `In the late 1930s it was seen that Bråsvellbreen had made a huge surge, forming a tongue 10 km long out into the sea. The name means the "sudden swell glacier"${wp('Bråsvellbreen')}.`
  },
  negribreen: {
    lede: () => 'A large glacier that ends in the fjord Storfjorden in Spitsbergen, with a wide front and the moving point Kapp Antinori.',
    news: () => `Negribreen began a surge after a collapse of its front in summer 2016. Surface speeds rose above 25 m a day, among the fastest in Svalbard. The glacier had probably last surged in the 1930s${doiSrc('Haga, O. N. et al. (2020), From high friction zone to frontal collapse: dynamics of an ongoing tidewater glacier surge, Negribreen, Svalbard, Journal of Glaciology 66(256).', '10.1017/jog.2020.43')}.`
  },
  hinlopenbreen: {
    lede: () => 'A glacier stream about 70 km long on Spitsbergen that ends in Vaigattbogen on the western side of the Hinlopen Strait.'
  },
  kvitoyjokulen: {
    lede: () => 'The ice cap that covers almost all of the island Kvitøya, "White Island", the easternmost part of Norway.',
    look: () => `The ice cap has the classic hourglass-shaped dome that gave the island its name. The few ice-free areas are each only a few km² large${wp('Kvitøya')}.`,
    fact: () => `Kvitøya was the resting place of Andrée's Arctic balloon expedition of 1897, which had tried to fly over the North Pole in a hydrogen balloon and was forced down on the pack ice about 300 km north of the island${wp('Kvitøya')}.`
  },
  etonbreen: {
    lede: () => 'A glacier on Nordaustlandet that ends in the fjord Wahlenbergfjorden.'
  },
  stonebreen: {
    lede: () => 'A glacier on Edgeøya that ends in the sea and forms the eastern point of the island.',
    look: () => `Earlier names of the glacier were Disco Hook, Steinnase and Stansforelandshuk${wp('Stonebreen')}.`
  },
  hochstetterbreen: {
    lede: () => 'A large glacier in Olav V Land on Spitsbergen that ends in the Hinlopen Strait.'
  },
  schweigaardbreen: {
    lede: () => 'A glacier in the north-east of Austfonna, on Nordaustlandet, that ends in the bay Albertinibukta.'
  },
  monacobreen: {
    lede: () => 'A large glacier at the head of the fjord Liefdefjorden, in Haakon VII Land on Spitsbergen.',
    look: () => `Earlier names of the glacier were Glacier de Monaco and Liefde Bay-bræ${wp('Monacobreen')}.`
  }
};
const NPI_NAMES_SRC = `Norwegian Polar Institute, ${lnk('https://placenames.npolar.no', 'Place names of Svalbard')} (CC BY 4.0): name, definition and origin of each glacier${' ('}${lnk('https://api.npolar.no/placename/', 'api.npolar.no/placename')})`;
