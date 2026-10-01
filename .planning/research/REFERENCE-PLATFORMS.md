# Reference Platforms: Interaction Architecture Study

**Project:** ReefRadar redesign (reef acoustic health: underwater audio → SurfPerch embeddings → 4-class health classifier, 54 reference sites in 7 countries, Next.js dashboard)
**Researched:** 2026-09-30
**Mode:** Ecosystem / comparison (external state of the art; the ReefRadar codebase was deliberately not read beyond README)
**Overall confidence:** MEDIUM-HIGH for patterns, MEDIUM for per-product UI specifics (see "Method and limits")

---

## Method and limits (read first)

- Sources: official product sites, user guides and help centers, platform-update posts, studio case studies, peer-reviewed papers, and press. Each claim is cited inline.
- **Several flagship tools are client-rendered SPAs that could not be fetched as text** (VACS Explorer, Half-Earth map, Climate TRACE Explore, ReefCloud, Earth Index). For those, the UI descriptions come from design write-ups, help docs and press, not from inspecting the live DOM. Those entries are marked **[write-up based]**.
- Anything I am stating from background knowledge and could not re-verify this session is marked **(unverified)**. Do not treat those as authoritative.
- The negative reference (Room 302 / "Mapping Resilience") project page returned 404 at both known URLs, so that section describes only what is verifiable plus the user's stated dislike.

---

## 0. The shape of ReefRadar's problem (why most references only partly transfer)

Most of the given references are built for **millions of features over long time series**. ReefRadar is the opposite shape:

| Dimension | Typical reference (GFW, Climate TRACE, MapBiomas) | ReefRadar |
|---|---|---|
| Entity count | 10^5 to 10^9 (Climate TRACE: 2.77M sources from 744M assets, per [c10e.org/explore](https://c10e.org/explore)) | **54 reference sites**, plus user uploads |
| Geography | Continuous global coverage | **7 tight clusters** (Sulawesi, GBR, Kenya, Maldives, Mexico, Florida Keys, Bora-Bora). On a world map, mostly empty ocean |
| Time | Multi-year calendar series, often daily | **Snapshots**. The meaningful "time" axes are (a) seconds within a recording, (b) time of day, (c) recovery stage (degraded → restored_early → restored_mid → healthy) |
| Primary evidence | Pixels / tracks / numbers | **Sound**. The evidence can be *heard* |
| Model output | Pre-computed layers | **A classifier verdict + nearest-neighbour similarity** on a user query, with an out-of-distribution (OOD) region caveat |
| Core user act | Browse layers, filter, report on an area | **"Listen, compare, upload my recording, see what it sounds like"** |

**Implication:** copy the *entity, provenance, comparison and listening* patterns aggressively. Copy the *map-as-canvas, timebar, histogram filtering and layer-library* patterns only in reduced form. The products whose shape is closest to ReefRadar are not the big map platforms. They are **CoralSoundExplorer, Pattern Radio, SanctSound, NOAA Coral Reef Watch virtual stations, Ocean Health Index region pages, and Perch agile modeling**.

---

## 1. Opinionated headline recommendations

1. **Make sound the primary canvas and demote the map to a locator.** With 54 points in 7 clusters, a full-bleed world map is mostly empty ocean. Use a persistent minimap/locator (VACS Explorer's "navigable minimap", [Stamen](https://stamen.com/?p=23135)) and give the main canvas to a **sound-space view**: a UMAP/embedding scatter that can morph to geography. This is the Earth Index "geographic mode ↔ similarity mode" transition ([Earth Genome](https://www.earthgenome.org/blog/visualizing-a-planet-of-embeddings)), and it lines up with how CoralSoundExplorer validates reef soundscapes in UMAP space ([Minier et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12017563/)).
2. **Every mark is playable.** Click a site, a segment or a point and it plays, as in CoralSoundExplorer's "click points to trigger immediate audio playback and spectrogram" ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12017563/)). xeno-canto's map pins open a sonogram with play ([xeno-canto forum](https://www.xeno-canto.org/forum/topic/23048)).
3. **Treat a user upload as a query, not a job.** Perch agile modeling and Earth Index both treat an example as a vector search over embeddings ([Perch agile modeling](https://arxiv.org/html/2505.03071v1)). The result should be "your reef, placed among 54 references, with its nearest neighbours playable side by side". A progress bar ending in a label is not enough.
4. **Sites and analyses are first-class URL entities.** Model them on GFW vessel profiles ([GFW user guide](https://globalfishingwatch.org/user-guide/)), Ocean Health Index region pages ([OHI Germany](https://oceanhealthindex.org/regions/germany)) and Coral Reef Watch virtual stations ([CRW](https://coralreefwatch.noaa.gov/product/vs/index.php)). Use `/sites/[id]` and `/analyses/[id]`, deep-linkable down to the playhead second, as Pattern Radio does: "share a link that goes directly to that sound" ([Google](https://blog.google/technology/ai/pattern-radio-whale-songs/)).
5. **Show the probability distribution, never only the label.** Use the patterns from ReefCloud (median plus credible interval, [data.gov.au](https://www.data.gov.au/data/dataset/reefcloud)), Coral Reef Watch (ordinal alert levels plus projections) and CoralNet (posterior per suggestion plus a public "backend" page with a threshold sweep and confusion matrix, [CoralNet](https://coralnet.ucsd.edu/source/23/backend)). Add a **model card page** modelled on CoralNet's backend.
6. **Use a per-segment timeline strip under the spectrogram** as the ReefRadar "timebar". This is Pattern Radio's "AI heat map beneath the spectrogram" ([Google](https://blog.google/technology/ai/pattern-radio-whale-songs/)) applied to ReefRadar's 5 s SurfPerch windows. A GFW-style multi-year calendar timebar does not fit this data.
7. **Start with question-first entry and ear-training before analysis.** SanctSound organises its whole portal around "Why and how did we listen? / Where and when? / What did we hear? / What did we learn?" ([sanctsound.ioos.us](https://sanctsound.ioos.us/)). Google's *Calling in our Corals* opens with "listen to a healthy reef, compare to an unhealthy reef, train your ear" ([Google Experiments](https://experiments.withgoogle.com/calling-in-our-corals)). Use curated questions, not an LLM chat box.
8. **Put provenance one click from every number.** Each reference site carries a dataset, DOI, licence and caveats (MARRS CC-BY, Irma CC0, CoralSoundExplorer CC-BY, SanctSound public domain). Climate TRACE shows the cost of hiding this: its UI is a simplified view and the real semantics, such as null vs 0, live only in the CSVs ([Climate TRACE](https://climatetrace.org/news/beyond-the-ui-what039s-in-the-asset-metadata)).
9. **Keep all state in the URL and skip accounts.** GFW workspaces persist zoom, layers, time range and selected vessels in a shared link ([GFW user guide](https://globalfishingwatch.org/user-guide/)). ReefRadar needs the same with no login.
10. **Do not drift toward the scrollytelling-microsite direction (Mapping Resilience).** Narrative belongs in a short, skippable onboarding that hands off to the explorer, never as the main information architecture.

---

## 2. Per-reference profiles

Field key: **URL · What · IA/entry · Spatial · Temporal · Filtering · Selection/inspector · Provenance/uncertainty · Saved/shared · Responsive · Rendering · Steal for ReefRadar · Avoid**

### 2A. The given list

#### 1. VACS Explorer (Earth Genome × Stamen) [write-up based]
- **URL:** https://vacs.theplotline.org/ · case study: https://stamen.com/work/mapping-crop-potential-in-a-changing-climate
- **What:** Shows modelled 2050 viability (vs. 2010) of 20+ traditional African crops under two climate scenarios, built for COP28 on AgMIP model output ([Earth Genome](https://www.earthgenome.org/blog/building-the-vision-for-a-more-sustainable-food-future-in-africa), [Stamen](https://stamen.com/work/mapping-crop-potential-in-a-changing-climate)).
- **IA/entry:** Crop-first. The user picks a crop and a scenario, and the map answers ([Stamen](https://stamen.com/work/mapping-crop-potential-in-a-changing-climate)).
- **Spatial:** Continental map of Africa plus a **navigable minimap** ([Stamen NACIS](https://stamen.com/?p=23135)).
- **Temporal:** None interactive. Two fixed endpoints (2010 baseline vs 2050) and a scenario toggle. The comparison is the time model.
- **Filtering / lenses:** Crop × scenario. **Small multiples** let crops be compared side by side ([Stamen](https://stamen.com/?p=23135)). A sidebar shows nutrition and soil context ([Stamen napkin post](https://stamen.com/when-science-meets-design-visualizing-the-future-of-food-security-on-the-back-of-a-napkin)).
- **Provenance/uncertainty:** Stamen "worked carefully to ensure that we respected the integrity of the data and model, so as to avoid any misleading assumptions users could make" ([Stamen](https://stamen.com/work/mapping-crop-potential-in-a-changing-climate)). Details of the ensemble-spread display are not documented.
- **Saved/shared, responsive, rendering:** Not documented (unverified).
- **Steal:**
  - **Small multiples of the same place under different "lenses".** ReefRadar equivalent: the same site's 4-class probabilities, or the same recording compared against healthy, degraded and restored references.
  - **Minimap as a locator.** This is the right role for geography when the data are 7 clusters.
  - **Context sidebar** that pairs the model output with secondary data. For ReefRadar: depth, habitat and restoration year where known.
- **Avoid:** Endpoint-only comparison without visible model spread. ReefRadar must expose classifier uncertainty.

#### 2. Climate TRACE: Explore
- **URL:** https://climatetrace.org/explore (also https://c10e.org/explore)
- **What:** Facility-level global GHG inventory. The Explore page says it is "Loading data from 2,765,771 emissions sources summarized from 744,678,997 assets" ([c10e.org/explore](https://c10e.org/explore)).
- **IA/entry:** Map-first, global default view, "most-recent calendar year", all sectors. A running total updates bottom-left as selections change ([search summary of Climate TRACE help](https://www.opennetzero.org/climate-trace)). Separate Country Inventory and asset pages.
- **Spatial:** Scaled points globally. The team iterated through "clustered points, dot grids, hot spots, and line segments" before settling ([Mapbox](https://www.mapbox.com/blog/the-power-of-mapping-global-emissions-data)).
- **Temporal:** "Monthly" / "Annual" toggle plus year selector ([c10e.org/explore](https://c10e.org/explore)).
- **Filtering:** Sector multi-select ("All sectors"), gas selector.
- **Selection/inspector:** Detail cards are generated from rendered vector-tile features (`queryRenderedFeatures`) with no extra API call ([Mapbox](https://www.mapbox.com/blog/the-power-of-mapping-global-emissions-data)).
- **Provenance/uncertainty:** Mostly in downloads. The UI shows "basic details about their location and annual emissions", while CSVs carry ownership, capacity and emissions factors. A **null** means "more than 0.5% … but not measuring it" and **0** means "less than 0.5%" ([Climate TRACE](https://climatetrace.org/news/beyond-the-ui-what039s-in-the-asset-metadata)).
- **Saved/shared:** Not documented (unverified).
- **Rendering:** Mapbox GL JS, vector tiles ([Mapbox](https://www.mapbox.com/blog/the-power-of-mapping-global-emissions-data)).
- **Steal:**
  - A **live summary readout** that recomputes as filters change. ReefRadar: "Showing 21 of 54 sites · 9 healthy · 7 degraded …".
  - **Inspector cards populated from already-loaded data**, so selection feels instant. With 54 sites, preload everything.
- **Avoid:** Hiding semantics such as null vs 0, or caveats, in a CSV. ReefRadar's caveats (OOD region, acoustic ≠ coral tissue) must be in the UI.

#### 3. Global Fishing Watch: Map (timebar, 4Wings, workspaces, reports)
- **URL:** https://globalfishingwatch.org/map · guide: https://globalfishingwatch.org/user-guide/
- **What:** Open platform for vessel activity at sea, built on AIS/VMS/SAR/VIIRS and ML ([GFW](https://globalfishingwatch.org/user-guide/)).
- **IA/entry:** Map plus left sidebar with typed sections (ACTIVITY, DETECTIONS, VESSELS, ENVIRONMENT, REFERENCE LAYERS, USER DATASETS). Each layer row has toggle, colour, centre, info and filter icons, and its scale "adjusts as users zoom" ([GFW user guide](https://globalfishingwatch.org/user-guide/)).
- **Spatial:** 4Wings gridded spatiotemporal tiles, "from yearly to hourly views and from world view to city-scale", built for "no UI lock, and GPU rendering" ([4Wings GitHub](https://github.com/GlobalFishingWatch/4wings), [4Wings API](https://globalfishingwatch.org/our-apis/documentation/docs/v3/4wings)).
- **Temporal:** The **timebar** is the signature piece. Drag start/end handles or use a date picker. Click years, months or days to drill in. Play with speed and loop. Hover a vessel track graph for speed or depth at an instant ([GFW user guide](https://globalfishingwatch.org/user-guide/)). The **expanded timebar** (drag its top edge) shows event, speed and depth rows for "up to 20 vessels … at the same time" ([GFW update](https://globalfishingwatch.org/?p=63116)).
- **Filtering:** Per-layer filters (source, flag, gear) with an **"Exclude" invert**. Environmental layers carry **filter histograms** ([GFW user guide](https://globalfishingwatch.org/user-guide/)).
- **Selection/inspector:** The **vessel profile** has REGISTRY/AIS identity tabs, an ACTIVITY event timeline (fishing, encounters, loitering, port visits) with per-type toggles, an AREAS tab and a Related Vessels tab, plus CSV downloads ([GFW user guide](https://globalfishingwatch.org/user-guide/)).
- **Analysis:** **Dynamic reports** on any EEZ, MPA or drawn polygon, with modes "Before/After", "Period Comparison" and "Evolution". Bar breakdowns by flag, vessel type and gear ([GFW user guide](https://globalfishingwatch.org/user-guide/), [GFW reports](https://globalfishingwatch.org/?p=63384)).
- **Comparison:** **Bivariate mode** for two activity layers ([GFW user guide](https://globalfishingwatch.org/user-guide/)).
- **Saved/shared:** Workspaces are saved to a profile, and a share link copies a URL that preserves "zoom level, layers, time range, and selected vessels" ([GFW user guide](https://globalfishingwatch.org/user-guide/)).
- **Rendering:** deck.gl-based custom layers (`@globalfishingwatch/deck-layers`, `4wings-map`) in a frontend monorepo ([npm](https://www.npmjs.com/~j8seangel), [4wings](https://github.com/GlobalFishingWatch/4wings)).
- **Responsive:** Desktop-first analytical tool (unverified on mobile).
- **Steal:**
  - The **entity profile with an event timeline and per-type toggles**. ReefRadar: a site profile whose "events" are segments classified healthy, degraded and so on, toggleable, each jumping the player.
  - **Before/After and Period-Comparison report modes.** These map directly onto restoration comparison (degraded vs restored_mid vs healthy).
  - **"Up to N entities stacked in an expanded timebar".** ReefRadar: stack 2–4 recordings' segment strips for A/B/C listening.
  - **URL-complete workspace state.**
- **Avoid:** The density of the sidebar (dozens of layers, icon rows). ReefRadar has about 3 layers of meaning, so a GFW-style layer library would be ceremony.

#### 4. Global Fishing Watch: Marine Manager (histogram environmental filtering)
- **URL:** https://globalfishingwatch.org/marine-manager (portal of the same map stack)
- **What:** MPA-manager-oriented workspace over GFW data plus 12 environmental datasets (oxygen, pH, wave height, coral reefs, mangroves, seagrasses…) ([GFW platform updates](https://globalfishingwatch.org/?p=23687)).
- **Filtering:** Environmental layers expose a **histogram of "frequency of environmental data values across the grid cells"**, and the user filters the heatmap "to only show certain areas where environment data meets the range you've set" ([GFW user guide](https://globalfishingwatch.org/user-guide/), [GFW updates](https://globalfishingwatch.org/?p=23687)). Vessel tracks are filterable by speed and depth ([GFW Aug 2024](https://globalfishingwatch.org/platform-update/2024-august-marine-manager-work-together-in-shared-workspaces-new-analysis-features-and-more)).
- **Analysis:** Multi-area aggregated analysis. **Pin-drop analysis** "around specific points of interest within selected timeframes". Reports reachable from the homepage without entering the map ([GFW Aug 2024](https://globalfishingwatch.org/platform-update/2024-august-marine-manager-work-together-in-shared-workspaces-new-analysis-features-and-more)).
- **Saved/shared:** **Shared workspaces with password-protected view/edit** and **map annotations** at any location ([GFW Aug 2024](https://globalfishingwatch.org/platform-update/2024-august-marine-manager-work-together-in-shared-workspaces-new-analysis-features-and-more)).
- **Steal:**
  - **Histogram as filter and legend at once.** For ReefRadar, use it on confidence or similarity score ("show sites where P(healthy) > 0.7"), not on environmental rasters.
  - **Reports reachable without the map.** Site and analysis pages should stand alone and be shareable to someone who will never open the explorer.
- **Avoid:** Histogram filtering over 54 values. A histogram of 54 is noisy, so use a **beeswarm/dot strip** (each dot is a site and is clickable) that doubles as a range filter.

#### 5. Half-Earth Project Map (Vizzuality × E.O. Wilson Foundation × Map of Life × Esri) [write-up based]
- **URL:** https://map.half-earthproject.org/
- **What:** Biodiversity richness and rarity at 1 km, protection indices, priority places ([Vizzuality](https://vizzuality.com/project/half-earth)).
- **IA/entry:** An opening screen offers an **audio tour** of priority places or national report cards ("On the opening screen, you'll be able to select an audio tour", [E.O. Wilson Foundation](https://eowilsonfoundation.org/?p=71)). Modes: explore data, Places for a Half-Earth Future (up to 20 regions per country), **National Report Cards** with Species Protection Index trends and comparison, and **Areas of interest** (draw/upload 1,000–35,000 km², name, share, save the URL) ([E.O. Wilson Foundation NRC](https://eowilsonfoundation.org/which-half/national-report-cards/), [search summary](https://eowilsonfoundation.org/?p=1117)).
- **Spatial:** 3D interactive **globe** that users can "spin, magnify, and layer data" on, with a custom vibrant basemap co-designed with Esri's John Nelson ([Vizzuality](https://vizzuality.com/project/half-earth)).
- **Temporal:** SPI over time inside report cards. Otherwise static.
- **Selection/inspector:** Country to report card. Custom area to species list with "how local protection contributes to protection of their global range".
- **Saved/shared:** Named AOIs with shareable URLs.
- **Rendering:** Esri ArcGIS API for JavaScript (WebGL) ([Vizzuality](https://vizzuality.com/project/half-earth)).
- **Steal:**
  - The **audio tour as an entry option**. It is the only big conservation map that uses narrated audio for onboarding, which is natural for a sound product: "Take the 90-second listening tour".
  - **Report card as the entity page** (score, trend, comparison to peers).
- **Avoid:** The globe as the main canvas. A spinning globe emphasises emptiness for 7 clusters, and its emotional-cinematic register is close to the direction the user rejected (Section 5).

#### 6. Global Nature Watch (formerly Global Forest Watch, renamed 21 Sep 2026) + Horizon preview
- **URL:** https://www.globalforestwatch.org (now Global Nature Watch) · AI: Global Nature Watch / Horizon
- **What:** WRI's flagship monitoring platform. The 2025 AI system lets users "ask questions in plain language and receive responses backed by data … supported by maps, statistics and context" across 80+ peer-reviewed datasets ([WRI hub](https://hub.wri.org/global-nature-watch-ai-powered-insights-nature-africa-and-beyond)). On **21 Sep 2026** GFW was renamed Global Nature Watch, and an AI-driven platform called **Horizon** launched in preview alongside the existing tools, which are preserved ([WRI release](https://www.wri.org/news/release-global-forest-watch-becomes-global-nature-watch-expanding-cover-more-land-ecosystems)).
- **IA/entry:** (a) The classic GFW map and dashboards: "dashboards for any area in the world to answer specific questions on where, why, and how much forest change" ([Nature4Climate](https://nature4climate.org/news/new-map-interface-on-global-forest-watch-makes-it-easier-to-use-and-customize-forest-data/)). (b) **Chat-and-map**: the agent identifies "the place and timeframe, select[s] the right datasets, and generate[s] a chart and map" ([WRI hub](https://hub.wri.org/global-nature-watch-ai-powered-insights-nature-africa-and-beyond)).
- **Provenance:** "AI predominantly for orchestrating rather than generating content". Outputs are "tied to open, peer-reviewed datasets that anyone can trace", with an open evaluation framework ([Development Seed](https://developmentseed.org/blog/2025-10-16-global-nature-watch), [project](https://developmentseed.org/projects/global-nature-watch/)).
- **Rendering/tech:** Next.js frontend, eoAPI + STAC, LangChain agents, Google and Anthropic LLMs ([Development Seed](https://developmentseed.org/projects/global-nature-watch/)).
- **Steal:**
  - **"AI orchestrates, data answers".** If ReefRadar ever adds natural language, the model only routes to existing views (site, analysis, comparison) and never writes ecological claims.
  - **The dashboard-for-any-area concept, scaled down.** Every site and every upload gets a generated dashboard.
- **Avoid:** A chat box as primary entry. With 54 sites and a fixed question space, **curated question chips** beat open chat. Chat also invites questions ReefRadar cannot answer (bleaching, species counts; see README "What It Cannot Measure").

#### 7. MapBiomas
- **URL:** https://plataforma.brasil.mapbiomas.org (and country platforms)
- **What:** Annual land-cover/land-use collections since 1985 for Brazil and other countries.
- **IA/entry:** **Module (theme) on the left → territory search at top → statistics on the right**. The platform "automatically generat[es] statistics and graphs during navigation". By default a pie shows the last year and a line chart the whole series, and **adjusting the temporal bar** re-scopes both ([MapBiomas](https://brasil.mapbiomas.org/en/?p=7465), [stats guide](https://venezuela.mapbiomas.org/wp-content/uploads/sites/5/2025/11/How_to_download_statistics_from_MapBiomas_platform_v3_EN_PT_ES.pdf)).
- **Spatial:** Click territories directly. Hierarchical territory picker (Country > State > …) ([download guide](https://brasil.mapbiomas.org/wp-content/uploads/sites/4/2025/10/how_to_download_maps_MapBiomas_platform_PT_EN_v4.pdf)).
- **Extras:** 3D view, downloadable **time-series animations**, and **legend classes with explanations and images** ([MapBiomas](https://brasil.mapbiomas.org/en/?p=7465)).
- **Steal:**
  - The **three-zone layout** (choose lens left, choose place top, read numbers right) is the clearest map + analytical sidecar in the set.
  - **Legend entries that explain themselves with an image.** ReefRadar: each class chip ("healthy", "restored_mid") opens a 10 s exemplar clip plus spectrogram plus one-line description.
- **Avoid:** Pie charts for class composition. Use a stacked bar for the 4-class probability.

#### 8. Nature Map Explorer (IIASA / UNEP-WCMC / SDSN) [write-up based]
- **URL:** https://explorer.naturemap.earth (the domain now resolves to unrelated content, so treat it as defunct, verified 2026-09-30). Data moved to UN Biodiversity Lab.
- **What:** Integrated global maps of biodiversity and ecosystem services, "designed to allow users to explore and provide feedback" and "for visualization and **expert annotation** on the preliminary outputs" ([UNEP CKAN](https://wesr-search.unep.org/ckan/dataset/0b3ea00d-5a1f-408f-9b2f-ade247b60ae6), [IIASA](https://www.iiasa.ac.at/web/home/about/news/190924-nature-map-earth.html)).
- **Steal:** **"Preliminary output + expert feedback" as an explicit product state.** ReefRadar's classifier is about 90% on held-out data from limited regions. A "Disagree? Tell us what you know about this reef" affordance on analyses fits.
- **Avoid:** Shipping a portal with no long-term home. The domain lapsed.

#### 9. UN Biodiversity Lab (UNBL 2.0)
- **URL:** https://unbiodiversitylab.org · map: https://map.unbiodiversitylab.org
- **What:** 400+ global layers for national biodiversity reporting (UNDP / UNEP-WCMC / CBD) ([UNDP](https://www.undp.org/press-releases/launch-un-biodiversity-lab-20-spatial-data-and-future-our-planet)).
- **IA/entry:** **Curated data collections** plus a layer library. **Secure workspaces**: upload national data, "invite colleagues to collaborate, and calculate dynamic indicators for a subnational or transboundary area of interest" ([UNDP](https://www.undp.org/press-releases/launch-un-biodiversity-lab-20-spatial-data-and-future-our-planet)). It is available in 5 languages.
- **Steal:** **Curated collections**, meaning pre-composed views for a purpose. ReefRadar: "Restoration in Sulawesi", "Hurricane Irma before/after", "Bora-Bora boat vs undisturbed".
- **Avoid:** A 400-layer catalogue mental model.

#### 10. Restor [write-up based]
- **URL:** https://restor.eco
- **What:** Open restoration platform with 130,000 sites from 1,000 organisations in 140 countries ([Vizzuality](https://vizzuality.com/project/restor)).
- **IA/entry:** "Google Maps for nature". Outline any area to get biodiversity, soil carbon, land cover, pH and rainfall ([Renewable Matter](https://www.renewablematter.eu/en/startup-restors-open-maps-highlight-forest-restoration-potential)). **Site profiles** for registered projects.
- **Spatial:** Pins are batched and clustered so the map scaled "from 100 sites to … 130,000" ([Vizzuality](https://vizzuality.com/project/restor)).
- **Steal:** **The site profile as the social object.** A restoration site page that a project team would link from their own website. ReefRadar's MARRS sites are restoration projects, so a site page could become the thing MARRS links to.
- **Avoid:** Clustering. At 54 sites it hides information. Show all points.

#### 11. OpenForests: explorer.land
- **URL:** https://explorer.land
- **What:** Map-based communication platform for forest projects, used by 200+ projects ([Mapbox](https://www.mapbox.com/blog/explorer-land-regrowing-confidence-in-forest-restoration-projects-with-maps-and-data), [BELSPO](https://eo.belspo.be/en/news/openforests-launches-forest-project-platform-explorerland)).
- **IA/entry:** Project pages for donors and stakeholders. **Geolocated multimedia** (field photos, video, camera-trap footage) captured with an Android story-mapping app. Custom drone imagery stitched over satellite imagery for **before/after** ([Mapbox](https://www.mapbox.com/blog/explorer-land-regrowing-confidence-in-forest-restoration-projects-with-maps-and-data)). Embeddable on partner sites.
- **Steal:**
  - **Media pinned to place** is the visual analogue of "recording pinned to reef". Each site should show where the hydrophone sat, plus a reef photo where licences allow.
  - **Embeddable site widget**: an iframe with a player and verdict.
- **Avoid:** Donor-marketing tone in a scientific tool.

#### 12. Ocean+ Habitats (UNEP-WCMC)
- **URL:** https://habitats.oceanplus.org
- **What:** Global and national statistics on warm-water corals, cold-water corals, mangroves, seagrasses and saltmarsh. Overlap with the WDPA and IUCN Red List status of habitat-forming species ([UNEP CKAN](https://wesr-search.unep.org/ckan/dataset/unep-wcmc-rsrc-platform-ocean--habitats)).
- **IA/entry:** **Habitat-first selector → global stats → country stats → protection coverage charts → species by Red List category.** Citation guidance asks users to "insert month/year of the version downloaded" ([habitats.oceanplus.org](https://habitats.oceanplus.org/)). Companion Ocean+ Data Viewer and Library were retired in 2025.
- **Steal:** **Versioned citation text on every page** ("Cite this view: ReefRadar reference set v2026-09, model v…"). It also points to a likely **context layer**: warm-water coral extent (from here or the Allen Coral Atlas) behind ReefRadar sites.
- **Avoid:** The statistics-portal register (tables-first). It is too dry for a listening product.

#### 13. Google Earth Engine / Google Earth Timelapse
- **URL:** https://earthengine.google.com/timelapse/ and Google Earth → Timelapse
- **What:** 1984–present global satellite timelapse, delivered as "83 million multi-resolution overlapping video tiles" via CMU CREATE Lab's open-source Time Machine ([Google Research](https://www.research.google/blog/an-inside-look-at-google-earth-timelapse/)).
- **Temporal:** A **year scrubber** designed for extensibility ("won't break the design" when time increments change). Scrubbing backwards is encouraged as "an interesting way to compare the present with the past" ([Google Research](https://www.research.google/blog/an-inside-look-at-google-earth-timelapse/)).
- **Spatial:** "Maps Mode" toggle for orientation. Real estate goes to imagery ("devoting as much real estate as possible to the map").
- **Responsive:** Explicit mobile version ([Google](https://blog.google/products/earth/get-lost-new-earth-timelapse-now-mobile/)).
- **Rendering:** WebGL viewer, whole-screen video tiles in a 13-level pyramid.
- **Steal:**
  - **Pre-render expensive media into a tile pyramid.** For ReefRadar, pre-render spectrogram images server-side at 2–3 zoom levels per recording instead of running client-side FFT on long files.
  - **A minimal scrubber with immediate media response.** Scrubbing must feel like scrubbing audio.
- **Avoid:** Autoplay-first behaviour. Audio autoplay is blocked by browsers and is hostile.

#### 14. Climate Central (Coastal Risk Finder / Screening Tool)
- **URL:** https://coastal.climatecentral.org · https://www.climatecentral.org/coastal-risk-finder/
- **What:** Sea-level rise and coastal-flood projections by year, pollution pathway and flood level ([NOAA Digital Coast](https://coast.noaa.gov/digitalcoast/tools/coastal-risk-screening.html)).
- **IA/entry:** **Persona-based entry**: Concerned Citizen, Community Leader, Media Professional, Researcher, Educator, Government Official ([Climate Central](https://www.climatecentral.org/coastal-risk-finder/concerned-citizen)). Address search first.
- **Temporal:** Decade sliders (2030–2100), scenario menu, "Projection Type" slider (annual / 10-yr / 100-yr event).
- **Uncertainty:** **Translates probability into lived terms**: "a home with a 1% chance of flooding in a given year has a 26% chance of flooding during the course of a 30-year mortgage" ([Climate Central](https://www.climatecentral.org/coastal-risk-finder/concerned-citizen)). Solutions cards close the loop.
- **Steal:**
  - **Plain-language translation of the classifier output.** "87% healthy" becomes "Of the 12 five-second windows in your recording, 10 sound most like healthy reefs."
  - **"What can I do with this?" cards** (submit to MARRS or CoralSoundExplorer, record at dawn, record longer).
- **Avoid:** Six personas. ReefRadar needs at most two implicit modes, *listener* and *analyst*, and even those are better expressed as entry questions than persona pages.

### 2B. Additional references (sound / ocean prioritised)

#### 15. NOAA SanctSound portal (IOOS) ★ closest IA analogue
- **URL:** https://sanctsound.ioos.us · data: NCEI Passive Acoustic Data Map Viewer
- **What:** Results of NOAA–US Navy Sanctuary Soundscape Monitoring (2018–2022) across 7 sanctuaries plus a monument, about 300 TB ([NCEI](https://www.ncei.noaa.gov/node/2092), [EM](https://ecomagazine.com/news/research/sanctsound-studying-the-underwater-world-of-sound/)). **Source of ReefRadar's Florida Keys data.**
- **IA/entry:** **Question-first**: "Why and how did we listen?", "Where and when did we listen?", "What did we measure?", "What did we hear?", "What did we learn?", "Who are we?". Parallel axes: **Sanctuaries** (place), **Sounds** (Animal / Human-made / Physical / Soundscape), **Stories**, **Data Portal** ([sanctsound.ioos.us](https://sanctsound.ioos.us/)).
- **Connecting sound to place:** Each sanctuary page has an **interactive illustrated scene**: "Click the icons in the scene below to listen and learn about the sounds we recorded in this sanctuary." Florida Keys includes midshipman, black and red grouper, dolphins, fish chorus, snapping shrimp, vessels, explosions, scuba bubbles, hurricanes and rain ([FKNMS page](https://sanctsound.ioos.us/s_fknms.html)).
- **Data:** Detections (e.g., humpback song, red grouper calls) and sound-level metrics. Raw data via the NCEI map viewer (sites as dots colour-coded by project) and Google Cloud ([NCEI](https://www.ncei.noaa.gov/node/2092)).
- **Steal:**
  - The **question-first IA** almost verbatim, adapted: *What does a reef sound like? · Where did we listen? · How does the model decide? · What can't it tell you? · Analyse your recording*.
  - **Taxonomy of sound sources** (biophony / anthrophony / geophony). ReefRadar can explain why boat noise and rain confuse a classifier.
  - **Separating Stories from Data.** Narrative is a sibling section, not the wrapper.
- **Avoid:** The illustrated "scene" as the only route to sounds. It is charming, but every sound should also be reachable from a list and a map.

#### 16. Pattern Radio: Whale Songs (Google Creative Lab × NOAA PIFSC) ★ best spectrogram explorer
- **URL:** https://patternradio.withgoogle.com · https://experiments.withgoogle.com/patternradio
- **What:** 8,000+ hours of Hawaiian hydrophone audio labelled by an ML humpback detector, out of a 187,000-hour archive ([Google blog](https://blog.google/technology/ai/pattern-radio-whale-songs/)).
- **Temporal / semantic zoom:** One continuous spectrogram, zoomable from "months of sound at a time" down to "individual sounds" ([Google blog](https://blog.google/technology/ai/pattern-radio-whale-songs/)).
- **AI treatment:** "**Beneath the spectrogram is a heat map**, which uses AI to help you navigate the data". **Highlight bars** show "repetitions and patterns of the sounds within the songs" ([Google blog](https://blog.google/technology/ai/pattern-radio-whale-songs/), [kidshouldseethis](https://thekidshouldseethis.com/post/pattern-radio-ai-whale-songs)).
- **Narrative:** **Guided tours by experts** (Ann Allen, Christopher Clark, Annie Lewandowski) that point into the data ([Google blog](https://blog.google/technology/ai/pattern-radio-whale-songs/)).
- **Shared state:** Deep link "directly to that sound".
- **Rendering:** WebGL + Pixi.js, TensorFlow, Web Audio API ([Experiments](https://experiments.withgoogle.com/patternradio)).
- **Steal:**
  - **Spectrogram on top, model-output strip directly beneath, the same x-axis.** This is the single most transferable pattern. ReefRadar: one colored cell per 5 s segment showing argmax class, with opacity set by confidence.
  - **Expert tours that steer the playhead**, the narrative-to-analysis bridge done right: the tour drives the real explorer rather than a separate microsite.
  - **Timestamped deep links.**
- **Avoid:** Its months-long zoom range. ReefRadar recordings are minutes, so cap the zoom levels.

#### 17. CoralSoundExplorer (Minier et al., 2025) ★ domain twin
- **URL:** paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC12017563/ · data DOI 10.5281/zenodo.14577064 (ReefRadar's Bora-Bora source)
- **What:** Open-source software that projects reef recordings into 2D/3D acoustic spaces (UMAP over VGGish embeddings, 15 s samples) and quantifies them ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12017563/)).
- **Interaction:** Interactive point cloud you can "orient as desired and zoom". Points are coloured **by site, by time of day, or by continuous recording time**. **Clicking a point plays the audio and shows its spectrogram**, with adjustable window, volume and playback speed ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12017563/)).
- **Temporal:** **Trajectories** through acoustic space over time, coloured by time of day. A **distance-from-start vs time** plot that revealed rain disturbance ("a sudden increase in distance at around 3 p.m.").
- **Quantification:** Silhouette indices between groups (boat vs undisturbed 0.65–0.78; tourist vs undisturbed 0.33). HDBSCAN clusters with contingency matrices. Analysis in "a few hours" vs "around 15 days" of manual spectrogram review.
- **Online viewer** for previously processed data, no install.
- **Steal:**
  - **Embedding scatter with click-to-listen and recolour-by** (site / status / country / dataset / time of day). It makes SurfPerch's similarity *visible and audible*, which turns "similar_sites" from a list into an explanation.
  - **Separation metric as a headline.** "How distinct are healthy vs degraded in this dataset?" is an honest model-quality signal.
  - **Trajectory view** for any long upload: how the soundscape moves over the recording.
- **Avoid:** A 3D point cloud by default. 2D is more legible and accessible.

#### 18. MBARI Soundscape Listening Room + Soundscape Visual Browser
- **URL:** https://www.mbari.org/soundscape-listening-room/ · https://www.mbari.org/data/soundscape-visual-browser/
- **What:** Live stream and curated library from the MARS cabled hydrophone (Monterey Bay) ([MBARI](https://www.mbari.org/soundscape-listening-room/)).
- **Listening UX:** The live stream is delayed about 20 minutes and plays 10-minute files sequentially, and the page says so. **Honest hardware warnings**: "**audible only with appropriate speakers**" on low-frequency clips. Library is organised by **biophony / geophony / anthrophony**. Each clip card has a player bottom-left and the title opens details ([MBARI](https://www.mbari.org/soundscape-listening-room/)).
- **Visual browser:** Pick month/year and all hourly spectrograms for the month tile into a grid. It is **silent by design** and points to the Listening Room for audio ([MBARI search summary](https://www.mbari.org/data/soundscape-visual-browser/)).
- **Steal:**
  - **Listening-condition notices** ("Use headphones; snapping shrimp are high-frequency, fish calls low") plus a **level-normalised playback** default.
  - **Calendar grid of spectrogram thumbnails.** For ReefRadar: a **54-site spectrogram contact sheet**, one thumbnail per site, that you can scan visually before listening.
- **Avoid:** Splitting "see" and "hear" into separate pages.

#### 19. Calling in our Corals (Google Arts & Culture × Steve Simpson et al.)
- **URL:** https://experiments.withgoogle.com/calling-in-our-corals · https://artsandculture.google.com/story/RgUBYCe8v8Ol0Q
- **What:** Citizen-science listening experience over reef hydrophones in the Philippines and 9 other locations ([Google Experiments](https://experiments.withgoogle.com/calling-in-our-corals)).
- **Flow:** (1) "Listen to a healthy coral reef and compare it to the sounds of an unhealthy reef" (copy: "Can you hear the silence?"), then (2) "Train your ear on different types of ocean sounds", then (3) "**Click when you hear a fish sound**". Clicks become timestamps for researchers and ML training. About 3 minutes ([Google Experiments](https://experiments.withgoogle.com/calling-in-our-corals), [Reef Builders](https://reefbuilders.com/2023/09/20/calling-all-citizen-scientists-help-researchers-listen-for-the-sounds-of-a-healthy-coral-reef/)).
- **Steal:**
  - **The healthy-vs-degraded A/B as the very first interaction.** It is ReefRadar's thesis in one gesture.
  - **Ear-training step** before any model output, so users learn what "snaps, grunts, whoops" are. Lamont's restoration study vocabulary is "whoops, croaks, growls, raspberries and foghorns" ([EcoWatch](https://www.ecowatch.com/coral-reef-recovery-sounds-2655959737.html), [Bristol](https://bristol.ac.uk/news/2021/december/coral-reef-restoration-project.html)).
  - **Tap-when-you-hear** as an optional, lightweight annotation that could later feed model validation.
- **Avoid:** Gamified, one-way flow as the whole product. Use it as onboarding.

#### 20. Arbimon (Rainforest Connection)
- **URL:** https://arbimon.org · help: https://help.rfcx.org/arbimon/
- **What:** Free cloud platform for acoustic monitoring: upload, visualise, pattern-match, train models ([RFCx](https://rfcx.org/ecoacoustics), [Mongabay](https://news.mongabay.com/2023/05/bioacoustic-analysis-made-easier-qa-with-rainforest-connection-ceo-bourhan-yassin/)).
- **IA:** Project → Explore → **Visualizer**. Browse **by site, playlist, or soundscape**, with a scrollable column of spectrogram thumbnails that opens into the large viewer ([Arbimon help](https://help.rfcx.org/arbimon/explore/visualize-recordings-as-spectrograms/)).
- **Annotation:** Tag a whole recording, or **draw a box on the spectrogram** to tag a region ([Arbimon help](https://help.rfcx.org/arbimon/explore/visualize-recordings-as-spectrograms/)).
- **Soundscapes:** Aggregate peaks by **time of day (recommended), day of week, month, year** into a frequency × time heatmap, optionally normalised by recordings per interval ([Arbimon soundscape job](https://help.rfcx.org/arbimon/analyze/soundscapes/creating-a-soundscape-job/)).
- **Steal:**
  - **Thumbnail rail + big viewer** for browsing many recordings.
  - **Time-of-day × frequency soundscape heatmap** per site, if time-of-day metadata exists for references. It is the standard "fingerprint" ecologists recognise.
  - **Playlists** become "collections" in ReefRadar.
- **Avoid:** Arbimon's admin-heavy project chrome. ReefRadar is read-mostly.

#### 21. Merlin Sound ID (Cornell Lab)
- **URL:** https://merlin.allaboutbirds.org
- **What:** On-device real-time bird sound identification.
- **Interaction:** Live scrolling spectrogram while recording. **Species cards appear and highlight as each bird vocalises**. After recording you can "select a species and **zip back to the spot in the recording** where its song or call occurred". Recordings auto-save for re-listening ([Cornell Chronicle](https://news.cornell.edu/node/321931)).
- **Responsive:** Mobile-native. It is the reference for audio + ML on a phone.
- **Steal:**
  - **Result to moment linkage.** Clicking "restored_mid (3 segments)" should jump the playhead to those segments.
  - **Progressive results during processing.** Show segment verdicts streaming in as SurfPerch processes windows instead of a spinner, and replace the README's "allow ~30s for cold start" with visible work.
- **Avoid:** A list of labels without confidence. Merlin can afford it with thousands of species. ReefRadar, with 4 classes and modest accuracy, cannot.

#### 22. Perch agile modeling + Hoplite (Google DeepMind)
- **URL:** https://github.com/google-research/perch-hoplite · paper: https://arxiv.org/html/2505.03071v1
- **What:** The search-by-example and active-learning workflow over Perch/SurfPerch-family embeddings. **Includes coral-reef case studies** ([arXiv](https://arxiv.org/html/2505.03071v1), [DeepMind](https://deepmind.google/discover/blog/how-ai-is-helping-advance-the-science-of-bioacoustics-to-save-endangered-species/)).
- **Interaction:** The query clip is embedded, then the target set is ranked by inner product, and the user labels **positive/negative** (4.79 s average per 5 s clip). Active learning uses "top 10 + quantile" sampling. The user sees held-out **ROC-AUC**. **Call density** is reported with **bootstrap/beta-distribution uncertainty**. Reef detections were aggregated per site ([arXiv](https://arxiv.org/html/2505.03071v1)). It runs in notebooks, with no polished UI.
- **Steal:**
  - **Upload = query vector** and **results = ranked, listenable neighbours with scores**, the exact mental model of ReefRadar's `similar_sites`.
  - **Distributional uncertainty** (intervals, not point scores) where sample sizes are small, which they are.
- **Avoid:** Notebook UX. ReefRadar is the polished layer this ecosystem lacks, and that is a real differentiator.

#### 23. BirdWeather (PUC stations + BirdNET)
- **URL:** https://app.birdweather.com
- **What:** Network of continuously listening stations with BirdNET IDs, a public live map, and web plus mobile apps ([BirdWeather](https://birdweather.com/)).
- **Provenance:** "**Every detection is saved with an audio recording and spectrogram, so you can verify any detection yourself**". Detections carry "a confidence score and a probability score, both filterable by the user". Live audio has a live spectrogram ([BirdWeather](https://www.birdweather.com/about/stations), [llms.txt](https://app.birdweather.com/llms.txt)).
- **Steal:** **Verify-it-yourself as a principle.** Every classification in ReefRadar links to the exact audio windows that produced it.
- **Avoid:** Leaderboards and gamification. They are irrelevant here.

#### 24. Orcasound + OrcaHello
- **URL:** https://live.orcasound.net · https://github.com/orcasound
- **What:** Live hydrophone streaming in Puget Sound (<60 s latency, HLS from S3 to a browser player) plus an ML detector with **human-in-the-loop moderation** by experts before alerts go out ([Orcasound](https://labs.sonicfield.org/library/orcasound-app-an-open-source-solution-for-streaming-live-ocean-sound-to-citizen-), [GitHub](https://github.com/orcasound)).
- **Steal:** **Model proposes, expert confirms** as an explicit status on records ("model verdict", "expert-reviewed"). For ReefRadar reference sites, the status labels come from field survey ground truth (MARRS), which differs from a model verdict. Show that difference.
- **Avoid:** Live-stream framing. ReefRadar has no live hydrophones.

#### 25. Allen Coral Atlas
- **URL:** https://allencoralatlas.org
- **What:** Global benthic and geomorphic maps of shallow tropical reefs (about 247,000 km² mapped) plus near-real-time **bleaching** monitoring ([Mongabay](https://news.mongabay.com/2021/09/the-first-complete-map-of-the-worlds-shallow-tropical-coral-reefs-is-here/), [EarthSky](https://earthsky.org/earth/a-new-coral-reef-atlas-allen-coral-atlas/)). Registered users download data for any mapped area. A 30-second tutorial is offered ([search summary](https://earthsky.org/earth/a-new-coral-reef-atlas-allen-coral-atlas/)).
- **Steal:** **Reef context for each site.** Show ReefRadar sites over real reef extent and geomorphic zone (where the licence and data allow), so the site is visibly *on a reef*. Also use it as a **complementary-evidence link**: "Visual/bleaching data for this area: Allen Coral Atlas / Coral Reef Watch". This directly addresses the README's "acoustics ≠ coral tissue" limitation.
- **Avoid:** Duplicating its mapping. Link out instead.

#### 26. ReefCloud (AIMS) [write-up based]
- **URL:** https://reefcloud.ai
- **What:** End-to-end reef monitoring: AI image annotation, Bayesian models, and a dashboard designed by Fjord/Accenture ([data.gov.au](https://www.data.gov.au/data/dataset/reefcloud), [Accenture](https://www.consultancy.uk/news/31081/accenture-helping-pacific-region-with-coral-reef-conservation)).
- **Uncertainty:** Predicts coral and macroalgae cover "(median and upper/lower credibility intervals) across all known coral reefs (both monitored and unmonitored)". The dashboard shows "average percentage cover … along with uncertainty ranges that indicate where the true value is most likely to lie" ([data.gov.au](https://www.data.gov.au/data/dataset/reefcloud)). Audience includes Traditional Owner rangers and tourism operators.
- **Steal:**
  - **Monitored vs modelled as a visible distinction.** For ReefRadar, the equivalent is "field-surveyed status label" vs "classifier estimate" vs "out-of-region estimate".
  - **Intervals by default.**
- **Avoid:** Not observed (UI not fetchable).

#### 27. CoralNet (UCSD)
- **URL:** https://coralnet.ucsd.edu
- **What:** Benthic image point-annotation with ML suggestions.
- **Uncertainty:** Each point shows label suggestions with a **posterior probability**. Source admins set a **confidence threshold** above which points auto-confirm ([CoralNet backend](https://coralnet.ucsd.edu/source/23/backend)).
- **Model transparency page ("backend"):** Active classifier ID and training date, a **threshold sweep** plotting accuracy vs fraction auto-confirmed, an interactive **confusion matrix** at any threshold, and **Labels vs Functional Groups** toggle. It also carries the caveat that metrics reflect the training source, not necessarily yours ([CoralNet backend](https://coralnet.ucsd.edu/source/23/backend)).
- **Steal:** **A public model page**: confusion matrix across the 4 classes, per-region performance (in-distribution Indo-Pacific/Kenya vs OOD), and a "what this accuracy means" note. It is the most credible single thing ReefRadar can add.
- **Avoid:** Auto-confirm semantics. ReefRadar is not an annotation tool.

#### 28. NOAA Coral Reef Watch: 5 km Regional Virtual Stations ★ closest scale analogue
- **URL:** https://coralreefwatch.noaa.gov/product/vs/index.php
- **What:** 219 virtual stations (same order of magnitude as ReefRadar's 54) summarising satellite thermal stress per reef region ([CRW](https://coralreefwatch.noaa.gov/product/vs/index.php)).
- **Per-station page:** **Four gauges**: current alert level plus projected levels for weeks 1–4, 5–8 and 9–12. **Ordinal alert scale**: No Stress, Bleaching Watch, Bleaching Warning, Alert Level 1, Alert Level 2. Two-year and multi-year time-series graphics. Region map navigation. **Email subscriptions** per region ([CRW](https://coralreefwatch.noaa.gov/product/vs/index.php)).
- **Steal:**
  - **Small, consistent per-station "card" that is the same everywhere**, so 54 sites become scannable.
  - **An ordinal, named scale** instead of raw probability for the at-a-glance read. ReefRadar's classes are already ordinal-ish (degraded < restored_early < restored_mid < healthy).
  - **Cross-link to CRW gauges** for the thermal context of each ReefRadar site. It is the natural complementary evidence.
- **Avoid:** Gauge skeuomorphism. Use the semantics, not dial graphics.

#### 29. Ocean Health Index
- **URL:** https://oceanhealthindex.org
- **What:** Annual scores for 220 regions across 10 goals.
- **Entity page:** Score, a sentence comparing it to the global average ("76 out of 100, which is **higher than** the global average score of 72"), **rank** (53rd of 220), a **flower plot** where petal length is score and petal width is weight, "click on a goal to learn how it is calculated", a **time series with this region in dark blue vs the all-region average in grey**, and a "see scores for a different region" dropdown ([OHI Germany](https://oceanhealthindex.org/regions/germany), [OHI 2021](https://oceanhealthindex.org/news/2021-scores/)).
- **Steal:**
  - **Every entity page states its relation to the population** ("This site sounds more like the healthy references than 80% of degraded sites").
  - **Highlight-one-against-all-grey** for any per-site chart.
  - **Prev/next entity switcher** on the page itself.
- **Avoid:** The flower plot. It is iconic but hard to read for 4 classes, so use a stacked bar.

#### 30. Earth Index embeddings explorer (Earth Genome) ★ the geography ↔ similarity morph
- **URL:** https://embeddings.earthindex.ai · https://www.earthgenome.org/works/earth-index
- **What:** About 800k sampled satellite-patch embeddings (from ~3.5B) that can be shown as a **normal map** or rearranged into **similarity space**: "Deserts in Africa begin clustering with deserts in Australia". Spatially stratified sampling, UMAP projection, aridity-based colouring ([Earth Genome](https://www.earthgenome.org/blog/visualizing-a-planet-of-embeddings), [embeddings for all](https://www.earthgenome.org/blog/embeddings-for-all)). The Earth Index product adds Quick Search (similarity) and Deep Search (classifier training).
- **Steal:** **An animated morph between geographic layout and sound-similarity layout of the same points.** This is ReefRadar's signature visual. "Kenyan healthy reefs sound like Indonesian healthy reefs" becomes a visible motion, and a user upload lands in its neighbourhood. For 54 sites, or a few thousand segments, it is trivially performant.
- **Avoid:** Unlabelled colour. Colour by health status, and state what the axes are not (UMAP axes have no units).

#### 31. Renumics Spotlight (applied to underwater soundscapes)
- **URL:** https://renumics.com/blog/data-centric-workflows-for-marine-bioacoustics/
- **What:** A linked-views data explorer: dataframe, similarity map and inspector.
- **Interaction:** "Color the Similarity Map by call_type", then "brush a group, open the Inspector, and view each call as a player, as a spectrogram, and listen to it". "color by confidence (or filter confidence < 0.7)" builds "a short, high-value listening queue" ([Renumics](https://renumics.com/blog/data-centric-workflows-for-marine-bioacoustics/)).
- **Steal:** **Brush → inspector of players** and the **listening queue of low-confidence items**. That is a superb "where is the model unsure?" view for an analyst mode.

#### Compact references (briefer, still useful)

| Reference | One pattern to steal | Source |
|---|---|---|
| **Ocean Noise Explorer** (UW / OOI) | Station map → pick station → time range to the minute. Separate **pre-computed long-term spectrograms** vs **on-demand short spectrograms** vs **SPDF** and octave-band boxplots. React + Flask | [docs](https://ocean-noise-explorer.readthedocs.io) |
| **xeno-canto** | Map pin hover → **info window with sonogram and play link**. Draw a rectangle to search recordings in an area | [forum](https://www.xeno-canto.org/forum/topic/23048), [cursus](https://cursus.edu/en/12878/listen-do-you-know-this-bird) |
| **Macaulay Library** spectrogram redesign | No length cutoff for long PAM recordings. Settings tuned to show quiet background. **"Timeline" overview strip below the main spectrogram** | [eBird news](https://ebird.org/news/macaulay-library-unveils-new-look-for-spectrograms) (fetch blocked; via search summary) |
| **Whombat** | Browser annotation tool that also **visualises and evaluates ML predictions** against annotations | [Methods Ecol Evol / GitHub](https://github.com/vogelbam/whombat) |
| **Audio Atlas** (ISMIR 2024) | Audio embeddings in 2D via **DeepScatter** + vector DB semantic search | [arXiv](https://arxiv.org/abs/2412.00591) |
| **Felt** | One-click share, **comments pinned to map locations without an account**, threaded and resolvable. Components (charts, time sliders, tables) bound to the map | [Felt blog](https://www.felt.com/blog/comments-public-feedback-and-grouping), [help](https://help.felt.com:443/getting-started/what-is-felt) |
| **kepler.gl / Foursquare Studio** | A time filter turns into a **playback bar whose bars are the distribution of points over time**. Its Y axis can be switched to a selected metric. Speed 1x/2x/4x | [kepler docs](https://docs.kepler.gl/docs/user-guides/h-playback), [Foursquare](https://docs.foursquare.com/studio/docs/maps-time-playback) |
| **Linear (Cmd-K) / cmdk** | One input to "navigate anywhere, run any action, and find anything". Context menus that teach shortcuts | [Linear](https://linear.app/now/invisible-details), [summary](https://dev.to/thekitbase/cmdk-is-the-new-hamburger-menu-why-command-palettes-are-taking-over-saas-81d) |
| **wavesurfer.js v7** (implementation) | Official Spectrogram, Regions, Timeline and **Minimap** plugins, TypeScript, Shadow DOM | [docs](https://wavesurfer.xyz/docs/plugins/) |

---

## 3. Cross-cutting pattern catalog

Fit legend: **STRONG** = build it · **ADAPT** = build a reduced or reshaped version · **WEAK** = skip or defer.

| Pattern | Best exemplar | Runner-up | Fit for ReefRadar (~54 sites, audio, classifier) |
|---|---|---|---|
| Question-first entry | **SanctSound** question IA | Climate Central personas, GNW chat | **STRONG** as 3–5 curated question cards. **WEAK** as LLM chat |
| Lenses | **VACS** crop × scenario + small multiples | MapBiomas modules | **ADAPT**: 3–4 colour/grouping lenses (status, restoration stage, country, dataset), not layer stacks |
| Semantic zoom | **Pattern Radio** (months → single call) | GFW 4Wings (world → city) | **STRONG along the entity hierarchy** (world → region cluster → site → recording → 5 s segment → spectrogram detail). **WEAK as map-tile zoom** |
| Timebar / scrubber | **GFW timebar** (density, drill, play, expanded multi-entity rows) | Timelapse, kepler playback | **ADAPT**: the timebar is the **recording timeline with a per-segment class strip**, and can stack 2–4 recordings. A calendar timebar does not fit snapshot data |
| Map + analytical sidecar | **MapBiomas** (lens left / place top / stats right) | GFW reports, Half-Earth NRC | **ADAPT**: sidecar yes, but the map is a **locator/minimap** and the main canvas is sound space |
| Entity-as-first-class state | **GFW vessel profile** | OHI region page, CRW virtual station, Restor site profile | **STRONG**. 54 sites is exactly the scale where each deserves a real page |
| Histogram filters | **GFW Marine Manager** env histograms | kepler.gl | **WEAK as histograms** (n = 54). **ADAPT as a beeswarm range filter** on probability/similarity |
| Command palette | **Linear Cmd-K** | — | **ADAPT (cheap, low priority)**: jump to site, compare X vs Y, upload, change lens. Nice for analysts, never the only path |
| Provenance popovers | **CoralNet backend** + **Climate TRACE metadata** lesson | OHI "how it's calculated", Ocean+ citation | **STRONG**. Four datasets, four licences, OOD regions. Every number needs a "where from?" |
| Workspace / URL state | **GFW workspace links** | Pattern Radio sound deep links, Half-Earth AOI URLs | **STRONG and cheap**. Full state in URL, no accounts. Password workspaces are **WEAK** |
| Narrative → analysis transition | **Pattern Radio expert tours** driving the real explorer | Half-Earth audio tour, Calling in our Corals 3-step | **STRONG** if the tour drives the live explorer. **REJECT** as a separate scrollytelling microsite (see Section 5) |
| Geography ↔ similarity morph | **Earth Index embeddings** | CoralSoundExplorer UMAP | **STRONG, signature differentiator**. Small n makes animation smooth and every point listenable |
| Query-by-example | **Perch agile modeling** / Earth Index Quick Search | Arbimon pattern matching | **STRONG**. It is literally ReefRadar's upload flow |
| Verify-it-yourself evidence | **BirdWeather** | Merlin zip-back | **STRONG**. Every verdict links to the windows that produced it |
| Model card / transparency page | **CoralNet backend** | GNW "open evaluation" | **STRONG**. Cheap, high credibility |
| Shared annotation / comments | **Felt** pinned comments | Marine Manager annotations, Nature Map expert feedback | **WEAK now, ADAPT later** ("flag this verdict" is enough) |

### Notes per pattern (the honest fit discussion)

**Question-first entry.** It fits because ReefRadar's question space is small and known. The README itself names the questions: is it healthy? which reefs is it similar to? what can't it tell me? SanctSound proves this works for an acoustic program. GNW's chat is the wrong analogue: it solves dataset routing across 80+ datasets, and ReefRadar has one model and one reference set.

**Semantic zoom.** Map zoom adds little when everything is 7 dots. The useful zoom is **conceptual**: overview of 54 → a cluster (e.g., the 21 Sulawesi sites, which include the healthy/degraded/restored chronosequence) → one site → its recording → a 5 s window. Each level changes *what is shown*, not only *how big*, which is semantic zoom proper.

**Timebar.** Be blunt in the roadmap: ReefRadar has **no calendar time series** worth a GFW timebar. It does have three time-like axes that deserve UI:
1. **Within-recording time.** Spectrogram plus segment strip, scrubbable, playhead-linked. This is the core.
2. **Time of day.** Only if reference metadata support it, which is a gap to verify. If present, show a 24-hour diel ring per site, Arbimon-style.
3. **Recovery stage as pseudo-time.** degraded → restored_early (<3 months) → restored_mid (32–53 months) → healthy is a *chronosequence* (Lamont et al.'s design). An ordinal "recovery ladder" axis, with clips playable at each rung, is the most meaningful "timeline" ReefRadar can offer.

**Map + sidecar.** The sidecar is right. The map-as-hero is wrong for this data. Use the VACS minimap pattern, and let the main canvas toggle between **Sound space** and **Geography**.

**Histogram filters.** With 54 sites a histogram has about 10 bins of about 5 items, which is noise. A **beeswarm/dot strip** keeps identity: hover shows the site, click selects, drag selects a range. Use it for P(healthy), similarity to the current query, and confidence.

**Command palette.** Small surface, cheap to build with `cmdk`. Value is moderate: it helps analysts jump to `ind_H4` or "compare mex_D2". It is not an IA strategy.

**Workspace / URL state.** Use the full GFW-grade version, which costs almost nothing here. Encode: view (sound/geo), lens, selected site(s), compare set, analysis id, playhead seconds, zoom level. Example: `/explore?view=sound&lens=status&site=ind_H4&compare=ind_D2&t=12.5`.

---

## 4. Sound and acoustic interface patterns (dedicated)

### 4.1 Listening
| Pattern | Exemplar | ReefRadar application |
|---|---|---|
| **Every mark is playable** | CoralSoundExplorer point-click; xeno-canto map pin to sonogram | Sites on map, points in sound space, segments in strip, class-legend chips: all play |
| **A/B as the first interaction** | Calling in our Corals ("Can you hear the silence?") | Landing: two big players, healthy vs degraded, same Sulawesi area, level-matched |
| **Listening-condition honesty** | MBARI "audible only with appropriate speakers"; stream delay disclosed | "Best with headphones" notice. Note that snapping-shrimp crackle is high-frequency and fish calls are low |
| **Level normalisation** | (implied by MBARI amplification note) | Loudness-normalise all reference clips so "quiet reef" is not confused with "low gain". Show a "raw level" toggle for analysts |
| **One-player rule** | (general audio UX) | Starting any clip pauses others, except in explicit **synced A/B mode** |
| **Progressive results while listening/processing** | Merlin live species cards | Stream per-segment verdicts as inference completes |
| **Audio tours** | Half-Earth opening audio tour; Pattern Radio expert tours | 60–90 s narrated tour that *drives the explorer* (moves playhead, selects sites) |

### 4.2 Seeing (spectrograms)
| Pattern | Exemplar | ReefRadar application |
|---|---|---|
| **Spectrogram + model strip on a shared x-axis** | Pattern Radio heatmap beneath spectrogram | 5 s SurfPerch windows as cells coloured by argmax class, opacity by confidence |
| **Overview strip below detail** | Macaulay "timeline preview"; wavesurfer Minimap | Whole-recording thumbnail under the zoomed spectrogram, draggable viewport |
| **Tuned for quiet backgrounds** | Macaulay settings change | Reef soundscapes are diffuse, so choose dynamic range and colormap to show the shrimp "haze" and faint fish calls. Use a perceptual, colour-blind-safe colormap |
| **Pre-computed long, on-demand short** | Ocean Noise Explorer; Timelapse tile pyramid | Server-render spectrogram images (Lambda already has the audio) at 2–3 zooms. Use client FFT only for short user clips |
| **Contact sheet of spectrograms** | MBARI Visual Browser monthly grid; Arbimon thumbnail rail | A 54-site spectrogram grid sorted by status, to scan visually before listening |
| **Frequency bands named** | SanctSound sound categories | Annotate bands: "snapping shrimp (2–20 kHz)", "fish calls (<1.5 kHz)". Ranges to be verified with domain sources before shipping |

### 4.3 Comparing soundscapes
| Pattern | Exemplar | ReefRadar application |
|---|---|---|
| **Embedding scatter, recolour-by, click-to-listen** | CoralSoundExplorer; Renumics Spotlight | Sound-space canvas with lenses: status / country / dataset / time-of-day |
| **Geography ↔ similarity morph** | Earth Index | Toggle animates the same points between map and UMAP |
| **Query lands among references** | Perch agile modeling; Earth Index Quick Search | Upload appears as a distinct marker plus its k nearest references, each playable |
| **Group-separation metric** | CoralSoundExplorer silhouette index | Model page: "How separable are the classes?" per region |
| **Time-of-day × frequency fingerprint** | Arbimon soundscapes | Per-site diel fingerprint (if metadata exist) |
| **Synced A/B/C players** | GFW expanded timebar (up to 20 stacked) | Stack 2–4 recordings, shared playhead, solo/mute per row |
| **Before/after, period comparison** | GFW report modes; explorer.land imagery | Irma pre/post, degraded vs restored_mid vs healthy |
| **Long-term statistical views** | Ocean Noise Explorer SPDF, LTSA | Analyst-only, deferred. ReefRadar lacks long series |

### 4.4 Scrubbing time
- **Playhead-linked everything** (Pattern Radio, Merlin). Scrubbing the spectrogram moves the segment strip highlight and, in sound space, highlights the current segment's point. Clicking a point seeks the player.
- **Jump to evidence** (Merlin "zip back"). In the probability breakdown, clicking a class seeks to its segments, and next/previous cycles through them.
- **Deep-link the moment** (Pattern Radio). `?t=` in every share link.
- **Keyboard**: space play/pause, ←/→ previous/next segment, A/B to swap compare source (unverified convention; standard media-player practice).

### 4.5 Annotating
- **Tap-when-you-hear** (Calling in our Corals) is lightweight, fun and research-grade. A good optional activity on reference clips.
- **Box on spectrogram** (Arbimon, Whombat) is analyst-grade. Defer.
- **Model proposes / expert confirms** status (OrcaHello, CoralNet) means labelling *reference status provenance*: field-surveyed label vs model estimate.
- **Flag this verdict** (Nature Map Explorer's expert-feedback ethos, Felt comments) is a minimal, valuable feedback loop.

### 4.6 Connecting sound to place
- **Illustrated scene of sound sources** (SanctSound) is good for education, but must not be the only route.
- **Map pin → mini sonogram + play** (xeno-canto) is the right tooltip anatomy for ReefRadar's locator map.
- **Station network map with per-station pages** (BirdWeather, CRW) is the right model for 54 sites.
- **Reef context under the pin** (Allen Coral Atlas habitat; CRW thermal stress) gives complementary evidence and answers "this is acoustic, what about the coral itself?"
- **Media at place** (explorer.land) means hydrophone deployment photos and reef photos per site, where licences allow.

### 4.7 Proposed "acoustic evidence panel" anatomy (synthesis)

Top to bottom, one component reused on site pages, analysis pages and the compare view:
1. Header: entity name · status chip (ordinal colour) · provenance pill (dataset, licence, DOI) · OOD badge if applicable.
2. Verdict: stacked 4-class probability bar plus plain-language sentence ("10 of 12 windows sound most like healthy reefs").
3. Spectrogram (zoomable) with a band-label gutter.
4. **Segment strip** (5 s cells, class colour × confidence opacity), playhead-linked.
5. Overview minimap strip.
6. Transport: play, loop selection, speed, "best with headphones" hint.
7. Nearest references: 3–5 cards, each with a mini spectrogram, play button, similarity score and status. "Compare" adds a card to the synced A/B stack.
8. "What this can't tell you" disclosure (from README "What It Cannot Measure") with links to Allen Coral Atlas and Coral Reef Watch for the site's area.

---

## 5. Negative reference: Room 302 Studio / "Mapping Resilience"

- **What it is (verifiable):** A microsite by EJ Fox's studio, Room 302 Studio, for the Wildlife Conservation Society, "telling the story of coral reefs that may defy the odds and survive climate change" ([ejfox.com project listing via search](https://ejfox.com/blog/projects/mapping-resilience); studio: [Room 302](https://ejfox.com/blog/starting-a-studio-introducing-room-302)). The project page returned **HTTP 404** at both known URLs on 2026-09-30, so its current interaction details could not be inspected.
- **User position:** The user dislikes its aesthetic and interaction direction. **This study does not recommend moving toward it.**
- **Guardrails derived from that position** (these describe the *direction* to avoid; they are not claims about specific features of that site):
  1. **No narrative-as-IA.** Story content is a sibling section (SanctSound "Stories") or a skippable tour that drives the real explorer (Pattern Radio). It never wraps the product.
  2. **No one-way scroll-driven sequences** that lock interaction until the reader scrolls. Every view is directly addressable by URL.
  3. **No cinematic or atmospheric treatment that competes with the data**, such as full-bleed globes, ambient motion or decorative particles. Motion is reserved for meaningful transitions (geography ↔ sound-space morph, playhead).
  4. **No campaign-microsite register.** ReefRadar should read as an instrument, closer to Pattern Radio, CoralNet, CRW and GFW than to an NGO story page.
  5. **Reuse check:** if a proposed design element would also fit naturally in a donor-facing scrollytelling piece, ask whether it serves listening, comparing or verifying. If it does not, cut it.

---

## 6. Anti-patterns compiled (across references)

| Anti-pattern | Seen in / risk from | Why bad for ReefRadar | Instead |
|---|---|---|---|
| Full-bleed world map as hero | Climate TRACE, GFW, Half-Earth globe | 7 clusters means mostly empty ocean, and the evidence (sound) is off-canvas | Sound-space canvas + locator minimap |
| Pin clustering | Restor | Hides 54 meaningful entities | Show all, offset overlapping pins within clusters |
| Layer library / 400-layer catalogue | UNBL, GFW | ReefRadar has ~3 meaningful variables | 3–4 lenses |
| Label-only verdicts | Merlin (acceptable there) | 4 classes, ~90% held-out accuracy, OOD regions | Distribution + plain-language + segment evidence |
| Caveats in downloads only | Climate TRACE | Users over-trust OOD verdicts | Inline OOD badge + model page |
| Spinner during inference | (current README flow: "sleep 30") | Feels broken on cold start | Staged progress + streaming segment verdicts |
| LLM chat entry | GNW/Horizon | Invites unanswerable questions (bleaching, species) | Curated question cards |
| Histograms over tiny n | GFW Marine Manager (fine there) | Noisy, anonymous bins | Beeswarm with identity |
| See and hear on separate pages | MBARI Visual Browser vs Listening Room | Breaks the core loop | One evidence panel |
| Narrative microsite as wrapper | Mapping Resilience direction | User-rejected, and blocks direct access | Tour-drives-explorer |

---

## 7. Roadmap implications (for the roadmapper)

Suggested phase emphasis derived from this study:
1. **Entity and URL foundation.** `/sites/[id]`, `/analyses/[id]`, full URL state, provenance model (dataset, licence, DOI, status source). Everything else hangs off this. *Standard patterns, low research need.*
2. **Acoustic evidence panel.** Spectrogram (server-rendered tiles) + segment strip + transport + nearest references + A/B sync. *Needs a spike*: spectrogram rendering pipeline (Lambda pre-render vs wavesurfer client FFT), audio licensing and hosting of reference clips, and loudness normalisation.
3. **Sound-space canvas.** UMAP of reference segments, recolour lenses, click-to-listen, geography ↔ sound morph, upload lands as a query. *Needs a spike*: projecting a *new* upload into an existing UMAP (parametric UMAP or nearest-neighbour placement vs refitting) without misleading users.
4. **Model transparency page.** Confusion matrix, per-region performance, OOD explanation, "what acoustics can't tell you", cross-links to Allen Coral Atlas and CRW. *Low research need; needs the training metrics.*
5. **Question-first landing + ear-training + guided audio tour** that drives the explorer. *Content-heavy; needs domain review of sound descriptions.*
6. **Analyst extras (defer).** Beeswarm range filters, Cmd-K, low-confidence listening queue (Renumics), flag-this-verdict, time-of-day fingerprints (if metadata exist).

---

## 8. Confidence and gaps

| Area | Confidence | Notes |
|---|---|---|
| GFW map / Marine Manager patterns | HIGH | Official user guide and platform updates |
| SanctSound, MBARI, CRW, OHI, CoralNet, Arbimon | HIGH | Fetched official pages and help docs |
| Pattern Radio, Calling in our Corals, Merlin | MEDIUM-HIGH | Official Google/Cornell posts. Exact control details not documented |
| CoralSoundExplorer, Perch agile modeling | HIGH | Peer-reviewed / arXiv full text |
| VACS, Half-Earth, Climate TRACE UI, ReefCloud, Earth Index UI | MEDIUM | SPA not fetchable. Relied on write-ups |
| Responsive behaviour across references | LOW | Rarely documented. Mostly unverified |
| Mapping Resilience specifics | LOW | Page 404. Only studio and client verifiable |

**Gaps to resolve in phase research:**
- Do ReefRadar's reference recordings carry **time-of-day** and **recording-date** metadata consistently across MARRS, Irma, CoralSoundExplorer and SanctSound? This decides whether diel views are possible.
- **Licensing for re-hosting reference audio clips** in the browser (CC-BY attribution UI; SanctSound public domain is fine).
- **Placing uploads into UMAP space** honestly (parametric UMAP vs kNN placement).
- **Spectrogram parameters** suited to reef soundscapes at 32 kHz (FFT size, frequency scale, colormap). Validate with domain literature before shipping.
- Per-class / per-region confusion metrics need to exist for the model page.
- Frequency-band labels (shrimp vs fish ranges) must be checked against primary literature.

---

## Sources (primary, by section)

- GFW: [User guide](https://globalfishingwatch.org/user-guide/) · [Expanded timebar](https://globalfishingwatch.org/?p=63116) · [Dynamic reports](https://globalfishingwatch.org/?p=63384) · [Marine Manager Aug 2024](https://globalfishingwatch.org/platform-update/2024-august-marine-manager-work-together-in-shared-workspaces-new-analysis-features-and-more) · [Platform updates](https://globalfishingwatch.org/?p=23687) · [4Wings API](https://globalfishingwatch.org/our-apis/documentation/docs/v3/4wings) · [4wings repo](https://github.com/GlobalFishingWatch/4wings)
- VACS: [Stamen work](https://stamen.com/work/mapping-crop-potential-in-a-changing-climate) · [Stamen NACIS](https://stamen.com/?p=23135) · [Stamen napkin](https://stamen.com/when-science-meets-design-visualizing-the-future-of-food-security-on-the-back-of-a-napkin) · [Earth Genome](https://www.earthgenome.org/blog/building-the-vision-for-a-more-sustainable-food-future-in-africa)
- Climate TRACE: [Explore](https://c10e.org/explore) · [Asset metadata](https://climatetrace.org/news/beyond-the-ui-what039s-in-the-asset-metadata) · [Mapbox case](https://www.mapbox.com/blog/the-power-of-mapping-global-emissions-data)
- Half-Earth: [Vizzuality](https://vizzuality.com/project/half-earth) · [EOWBF map](https://eowilsonfoundation.org/?p=71) · [NRC](https://eowilsonfoundation.org/which-half/national-report-cards/)
- GNW/GFW: [WRI release 2026-09-21](https://www.wri.org/news/release-global-forest-watch-becomes-global-nature-watch-expanding-cover-more-land-ecosystems) · [WRI hub](https://hub.wri.org/global-nature-watch-ai-powered-insights-nature-africa-and-beyond) · [Development Seed blog](https://developmentseed.org/blog/2025-10-16-global-nature-watch) · [DS project](https://developmentseed.org/projects/global-nature-watch/) · [Nature4Climate](https://nature4climate.org/news/new-map-interface-on-global-forest-watch-makes-it-easier-to-use-and-customize-forest-data/)
- MapBiomas: [Platform update](https://brasil.mapbiomas.org/en/?p=7465) · [Stats guide](https://venezuela.mapbiomas.org/wp-content/uploads/sites/5/2025/11/How_to_download_statistics_from_MapBiomas_platform_v3_EN_PT_ES.pdf)
- Nature Map: [UNEP CKAN](https://wesr-search.unep.org/ckan/dataset/0b3ea00d-5a1f-408f-9b2f-ade247b60ae6) · [IIASA](https://www.iiasa.ac.at/web/home/about/news/190924-nature-map-earth.html)
- UNBL: [UNDP](https://www.undp.org/press-releases/launch-un-biodiversity-lab-20-spatial-data-and-future-our-planet)
- Restor: [Vizzuality](https://vizzuality.com/project/restor) · [Renewable Matter](https://www.renewablematter.eu/en/startup-restors-open-maps-highlight-forest-restoration-potential)
- explorer.land: [Mapbox](https://www.mapbox.com/blog/explorer-land-regrowing-confidence-in-forest-restoration-projects-with-maps-and-data)
- Ocean+ Habitats: [site](https://habitats.oceanplus.org/) · [UNEP CKAN](https://wesr-search.unep.org/ckan/dataset/unep-wcmc-rsrc-platform-ocean--habitats)
- Timelapse: [Google Research](https://www.research.google/blog/an-inside-look-at-google-earth-timelapse/) · [Google mobile](https://blog.google/products/earth/get-lost-new-earth-timelapse-now-mobile/)
- Climate Central: [Coastal Risk Finder](https://www.climatecentral.org/coastal-risk-finder/concerned-citizen) · [NOAA Digital Coast](https://coast.noaa.gov/digitalcoast/tools/coastal-risk-screening.html)
- SanctSound: [Portal](https://sanctsound.ioos.us/) · [FKNMS](https://sanctsound.ioos.us/s_fknms.html) · [NCEI](https://www.ncei.noaa.gov/node/2092) · [Hum, Crackle, Knock](https://sanctuaries.noaa.gov/news/jun21/monitoring-reefs-florida-keys.html)
- Pattern Radio: [Google blog](https://blog.google/technology/ai/pattern-radio-whale-songs/) · [Experiments](https://experiments.withgoogle.com/patternradio)
- CoralSoundExplorer: [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12017563/)
- MBARI: [Listening Room](https://www.mbari.org/soundscape-listening-room/) · [Visual browser](https://www.mbari.org/data/soundscape-visual-browser/)
- Calling in our Corals: [Experiments](https://experiments.withgoogle.com/calling-in-our-corals) · [Reef Builders](https://reefbuilders.com/2023/09/20/calling-all-citizen-scientists-help-researchers-listen-for-the-sounds-of-a-healthy-coral-reef/)
- Reef sound vocabulary: [EcoWatch (Lamont)](https://www.ecowatch.com/coral-reef-recovery-sounds-2655959737.html) · [Bristol](https://bristol.ac.uk/news/2021/december/coral-reef-restoration-project.html) · [CT Public/NPR](https://ctpublic.org/2024-03-18/theres-a-difference-between-the-sound-of-a-healthy-coral-reef-and-a-degraded-reef)
- Arbimon: [Visualizer help](https://help.rfcx.org/arbimon/explore/visualize-recordings-as-spectrograms/) · [Soundscape job](https://help.rfcx.org/arbimon/analyze/soundscapes/creating-a-soundscape-job/) · [RFCx](https://rfcx.org/ecoacoustics)
- Merlin: [Cornell Chronicle](https://news.cornell.edu/node/321931)
- Perch: [Agile modeling arXiv](https://arxiv.org/html/2505.03071v1) · [DeepMind](https://deepmind.google/discover/blog/how-ai-is-helping-advance-the-science-of-bioacoustics-to-save-endangered-species/)
- BirdWeather: [Stations](https://www.birdweather.com/about/stations) · [llms.txt](https://app.birdweather.com/llms.txt)
- Orcasound: [App paper](https://labs.sonicfield.org/library/orcasound-app-an-open-source-solution-for-streaming-live-ocean-sound-to-citizen-) · [GitHub](https://github.com/orcasound)
- Allen Coral Atlas: [Mongabay](https://news.mongabay.com/2021/09/the-first-complete-map-of-the-worlds-shallow-tropical-coral-reefs-is-here/) · [EarthSky](https://earthsky.org/earth/a-new-coral-reef-atlas-allen-coral-atlas/)
- ReefCloud: [data.gov.au](https://www.data.gov.au/data/dataset/reefcloud)
- CoralNet: [Backend page](https://coralnet.ucsd.edu/source/23/backend)
- Coral Reef Watch: [Virtual stations](https://coralreefwatch.noaa.gov/product/vs/index.php)
- OHI: [Germany](https://oceanhealthindex.org/regions/germany) · [2021 scores](https://oceanhealthindex.org/news/2021-scores/)
- Earth Index: [Visualizing embeddings](https://www.earthgenome.org/blog/visualizing-a-planet-of-embeddings) · [Embeddings for all](https://www.earthgenome.org/blog/embeddings-for-all)
- Renumics: [Marine bioacoustics](https://renumics.com/blog/data-centric-workflows-for-marine-bioacoustics/)
- Ocean Noise Explorer: [docs](https://ocean-noise-explorer.readthedocs.io)
- xeno-canto: [forum](https://www.xeno-canto.org/forum/topic/23048) · Macaulay: [eBird news](https://ebird.org/news/macaulay-library-unveils-new-look-for-spectrograms) · Whombat: [GitHub](https://github.com/vogelbam/whombat) · Audio Atlas: [arXiv](https://arxiv.org/abs/2412.00591)
- Felt: [Comments](https://www.felt.com/blog/comments-public-feedback-and-grouping) · kepler.gl: [Playback](https://docs.kepler.gl/docs/user-guides/h-playback) · Linear: [Invisible details](https://linear.app/now/invisible-details) · wavesurfer.js: [Plugins](https://wavesurfer.xyz/docs/plugins/)
- Room 302 / Mapping Resilience: [project listing (404 on fetch)](https://ejfox.com/blog/projects/mapping-resilience) · [Room 302 intro](https://ejfox.com/blog/starting-a-studio-introducing-room-302)
